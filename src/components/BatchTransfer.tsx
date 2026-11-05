import { useMemo, useState } from 'react'
import { useReadContracts, useWriteContract } from 'wagmi'
import { encodeFunctionData, type Address } from 'viem'
import { Send } from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import { CHAIN_ID, USDC_ADDRESS, VAULT_ADDRESS, erc20Abi, shortAddress, vaultAbi } from '@/lib/vault'
import { useRecipients } from '@/hooks/useRecipients'
import { useTxFlow } from '@/hooks/useTxFlow'
import type { useVaultState } from '@/hooks/useVaultState'
import { ActionButton, SectionCard, TxStatus } from './ui'
import { RecipientsEditor } from './RecipientsEditor'
import { CallPreview, TxReceiptDecoder } from './TxDecoder'

function RecipientBalances({ addresses }: { addresses: Address[] }) {
  const { data } = useReadContracts({
    contracts: addresses.map((a) => ({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf' as const, args: [a] as const, chainId: CHAIN_ID })),
    query: { refetchInterval: 5000 },
  })
  if (addresses.length === 0) return null
  return (
    <div className="inner stack-sm">
      <span className="label">Recipient USDC balances (live)</span>
      {addresses.map((a, i) => {
        const res = data?.[i]
        return (
          <div key={a} className="row-between">
            <span className="mono hint">{shortAddress(a)}</span>
            <span className="num" style={{ fontSize: '0.8125rem' }}>
              {res?.status === 'success' ? `${formatUsdc(res.result)} USDC` : '…'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function BatchTransfer({ state }: { state: ReturnType<typeof useVaultState> }) {
  const r = useRecipients()
  const flow = useTxFlow()
  const { writeContractAsync } = useWriteContract()
  const [sent, setSent] = useState<Address[]>([])

  const ready = r.addresses.length > 0 && r.errors.length === 0
  const insufficient = ready && state.vaultBalance !== undefined && r.total > state.vaultBalance

  const calls = useMemo(
    () => (ready ? [{ heading: 'batchTransfer', data: encodeFunctionData({ abi: vaultAbi, functionName: 'batchTransfer', args: [r.addresses, r.amounts] }) }] : []),
    [ready, r.addresses, r.amounts],
  )

  const submit = async () => {
    const recipients = r.addresses
    const amounts = r.amounts
    const receipt = await flow.run('Batch transfer', [
      {
        label: `Pay ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`,
        send: () => writeContractAsync({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'batchTransfer', args: [recipients, amounts] }),
      },
    ])
    if (receipt) setSent(recipients)
  }

  return (
    <SectionCard
      title="Batch transfer"
      subtitle="Pay several wallets in one transaction, straight from your vault balance. A payment that cannot be delivered is refunded to your vault."
      icon={<Send size={18} aria-hidden />}
    >
      <RecipientsEditor r={r} idPrefix="batch" />
      <CallPreview calls={calls} />
      <ActionButton
        block
        label={insufficient ? 'Not enough in vault' : `Send ${formatUsdc(r.total)} USDC`}
        busy={flow.busy}
        busyLabel={flow.status === 'wallet' ? 'Confirm in wallet…' : 'Confirming…'}
        disabled={!ready || insufficient || state.paused === true}
        onClick={() => void submit()}
      />
      {insufficient && (
        <p className="hint hint-warn">
          Your vault holds {state.vaultBalance !== undefined ? formatUsdc(state.vaultBalance) : '0'} USDC. Deposit more first.
        </p>
      )}
      <TxStatus status={flow.status} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} />
      {flow.status === 'success' && <TxReceiptDecoder hash={flow.hash} />}
      <RecipientBalances addresses={sent} />
    </SectionCard>
  )
}
