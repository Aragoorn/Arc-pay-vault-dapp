import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { erc20Abi } from 'viem'
import { Loader2 } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { arcPayVaultAbi } from '@/contracts/arcPayVaultAbi'
import { AmountField } from '@/components/AmountField'
import { CallPreview } from '@/components/TxDecoder'
import { useVaultData } from '@/hooks/useVaultData'
import { useVaultTx } from '@/hooks/useVaultTx'
import { fixed, parseInput } from '@/lib/amount'
import { CHAIN, CHAIN_ID, USDC_ADDRESS, VAULT_ADDRESS } from '@/lib/vault'
import { useTxLog } from '@/lib/txLog'

type Mode = 'deposit' | 'withdraw'
type Data = ReturnType<typeof useVaultData>

export function DepositWithdraw({ data }: { data: Data }) {
  const { isConnected, chainId } = useAccount()
  const send = useVaultTx()
  const records = useTxLog()
  const [mode, setMode] = useState<Mode>('deposit')
  const [amount, setAmount] = useState('')

  const raw = parseInput(amount)
  const wallet = data.walletUsdc.data
  const inVault = data.vaultBalance.data
  const allowance = data.allowance.data ?? 0n
  const max = mode === 'deposit' ? wallet : inVault
  const busy = records[0] !== undefined && ['preparing', 'signing', 'confirming'].includes(records[0].status)

  const needsAllowance = mode === 'deposit' && raw !== undefined && allowance < raw
  const insufficient = raw !== undefined && max !== undefined && raw > max
  const paused = mode === 'deposit' && data.paused.data === true

  const previewArgs = useMemo(() => (raw && raw > 0n ? ([raw] as const) : undefined), [raw])
  const previewAbi = needsAllowance ? erc20Abi : arcPayVaultAbi
  const previewFn = needsAllowance ? 'approve' : mode
  const previewCallArgs = useMemo(
    () => (previewArgs ? (needsAllowance ? [VAULT_ADDRESS, previewArgs[0]] : previewArgs) : undefined),
    [previewArgs, needsAllowance],
  )

  const submit = async () => {
    if (!raw || raw === 0n) return
    if (needsAllowance) {
      await send({ label: 'Allow USDC for the vault', to: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [VAULT_ADDRESS, raw] })
      return
    }
    const result = await send({
      label: mode === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC',
      to: VAULT_ADDRESS,
      abi: arcPayVaultAbi,
      functionName: mode,
      args: [raw],
    })
    if (result.ok) setAmount('')
  }

  const cta = !raw || raw === 0n
    ? 'Enter an amount'
    : insufficient
      ? mode === 'deposit' ? 'Not enough USDC in wallet' : 'More than your vault balance'
      : paused
        ? 'Vault is paused'
        : needsAllowance
          ? 'Allow USDC'
          : mode === 'deposit' ? 'Add to vault' : 'Withdraw to wallet'

  return (
    <section className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="display text-lg font-semibold">Deposit / Withdraw</h2>
        <div className="flex rounded-xl p-1" role="tablist" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {(['deposit', 'withdraw'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setAmount('') }}
              className="min-h-9 rounded-lg px-3 text-xs font-semibold capitalize transition-colors"
              style={{ background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#0d1b2f' : 'var(--muted)' }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <AmountField
        value={amount}
        onChange={setAmount}
        max={isConnected ? max : undefined}
        maxLabel={mode === 'deposit' ? 'Wallet' : 'In vault'}
      />

      <div className="mt-3 space-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <Row label={mode === 'deposit' ? 'Vault balance after' : 'Wallet receives'} value={
          raw && inVault !== undefined && !insufficient
            ? mode === 'deposit' ? `${fixed(inVault + raw)} USDC` : `${fixed(raw)} USDC`
            : '—'
        } />
        <Row label="Network fee" value={`Paid in USDC on ${CHAIN.name}`} />
        {mode === 'deposit' && <Row label="Vault allowance" value={`${fixed(allowance)} USDC`} />}
      </div>

      <div className="mt-3">
        <CallPreview abi={previewAbi} functionName={previewFn} args={previewCallArgs} />
      </div>

      <div className="mt-4">
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => <button className="btn-primary w-full" onClick={show}>Connect wallet</button>}
          </ConnectKitButton.Custom>
        ) : (
          <button className="btn-primary w-full" disabled={!raw || insufficient || paused || busy} onClick={() => void submit()}>
            {busy ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Working…</span>
            ) : chainId !== CHAIN_ID && raw && !insufficient ? `Switch to ${CHAIN.name} and continue` : cta}
          </button>
        )}
        {needsAllowance && !insufficient && (
          <p className="mt-2 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
            The vault needs your permission to move this amount. After it confirms, press Add to vault.
          </p>
        )}
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}
