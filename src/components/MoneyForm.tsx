import { useMemo, useState } from 'react'
import { useWriteContract } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react'
import { formatUsdc, parseUsdc } from '@/onchain-money'
import { USDC_ADDRESS, VAULT_ADDRESS, erc20Abi, vaultAbi } from '@/lib/vault'
import { useTxFlow, type FlowStep } from '@/hooks/useTxFlow'
import type { useVaultState } from '@/hooks/useVaultState'
import { ActionButton, SectionCard, TxStatus } from './ui'
import { CallPreview, TxReceiptDecoder } from './TxDecoder'

type Mode = 'deposit' | 'withdraw'

const QUICK_AMOUNTS = ['1', '5', '10']

export function MoneyForm({ state }: { state: ReturnType<typeof useVaultState> }) {
  const [amount, setAmount] = useState('')
  const flow = useTxFlow()
  const { writeContractAsync } = useWriteContract()

  const raw = useMemo(() => {
    try {
      const v = parseUsdc(amount || '0')
      return v > 0n ? v : undefined
    } catch {
      return undefined
    }
  }, [amount])

  const { walletBalance, vaultBalance, allowance, paused } = state
  const depositShort = raw !== undefined && walletBalance !== undefined && raw > walletBalance
  const withdrawShort = raw !== undefined && vaultBalance !== undefined && raw > vaultBalance
  const needsApproval = raw !== undefined && (allowance ?? 0n) < raw

  const calls = useMemo(() => {
    if (raw === undefined) return []
    const list: { heading: string; data: `0x${string}` }[] = []
    if (needsApproval) {
      list.push({ heading: 'Deposit · step 1: allow vault', data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [VAULT_ADDRESS, raw] }) })
    }
    list.push({ heading: needsApproval ? 'Deposit · step 2' : 'Deposit', data: encodeFunctionData({ abi: vaultAbi, functionName: 'deposit', args: [raw] }) })
    list.push({ heading: 'Withdraw', data: encodeFunctionData({ abi: vaultAbi, functionName: 'withdraw', args: [raw] }) })
    return list
  }, [raw, needsApproval])

  const submit = async (mode: Mode) => {
    if (raw === undefined) return
    const steps: FlowStep[] = []
    if (mode === 'deposit' && needsApproval) {
      steps.push({
        label: 'Allow USDC',
        send: () => writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [VAULT_ADDRESS, raw] }),
      })
    }
    steps.push({
      label: mode === 'deposit' ? 'Deposit' : 'Withdraw',
      send: () => writeContractAsync({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: mode, args: [raw] }),
    })
    const receipt = await flow.run(mode === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC', steps)
    if (receipt) setAmount('')
  }

  let hint: { text: string; tone: string } | undefined
  if (raw !== undefined && depositShort && withdrawShort) hint = { text: 'The amount is above both your wallet and vault balances.', tone: 'hint-warn' }
  else if (depositShort) hint = { text: `Deposit unavailable: your wallet holds ${formatUsdc(walletBalance ?? 0n)} USDC.`, tone: 'hint-warn' }
  else if (withdrawShort) hint = { text: `Withdraw unavailable: your vault balance is ${formatUsdc(vaultBalance ?? 0n)} USDC.`, tone: 'hint-warn' }
  else if (paused) hint = { text: 'Deposits are paused. Withdrawals still work.', tone: 'hint-warn' }
  else if (raw !== undefined && needsApproval) hint = { text: 'Your first deposit asks for two confirmations: allow USDC, then deposit.', tone: 'hint' }

  const busy = flow.busy
  const busyLabel = flow.status === 'wallet' ? 'Confirm in wallet…' : 'Confirming…'

  return (
    <SectionCard
      title="Deposit or withdraw"
      subtitle="Move USDC between your wallet and the vault. Withdrawals always work, even if the vault is paused."
      icon={<Wallet size={18} aria-hidden />}
    >
      <div className="amount-box">
        <label htmlFor="vault-amount" className="label">
          Amount
        </label>
        <div className="amount-row">
          <input
            id="vault-amount"
            className="amount-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              const v = e.target.value
              if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
            }}
          />
          <span className="amount-unit">USDC</span>
        </div>
        <div className="amount-meta">
          {QUICK_AMOUNTS.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => setAmount(q)}>
              {q}
            </button>
          ))}
          <button type="button" className="chip" disabled={walletBalance === undefined} onClick={() => walletBalance !== undefined && setAmount(formatUsdc(walletBalance))}>
            Wallet max
          </button>
          <button type="button" className="chip" disabled={vaultBalance === undefined} onClick={() => vaultBalance !== undefined && setAmount(formatUsdc(vaultBalance))}>
            Vault max
          </button>
        </div>
      </div>

      <div className="btn-row">
        <ActionButton
          block
          label="Deposit"
          icon={<ArrowDownToLine size={16} aria-hidden />}
          busy={busy && flow.stepLabel !== 'Withdraw'}
          busyLabel={busyLabel}
          disabled={raw === undefined || depositShort || paused === true || busy}
          onClick={() => void submit('deposit')}
        />
        <ActionButton
          block
          variant="outline"
          label="Withdraw"
          icon={<ArrowUpFromLine size={16} aria-hidden />}
          busy={busy && flow.stepLabel === 'Withdraw'}
          busyLabel={busyLabel}
          disabled={raw === undefined || withdrawShort || busy}
          onClick={() => void submit('withdraw')}
        />
      </div>
      {hint && <p className={`hint ${hint.tone}`}>{hint.text}</p>}

      <CallPreview calls={calls} />
      <TxStatus status={flow.status} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} />
      {flow.status === 'success' && <TxReceiptDecoder hash={flow.hash} />}
    </SectionCard>
  )
}
