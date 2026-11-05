import { useMemo, useState } from 'react'
import { useWriteContract } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { CalendarClock } from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import { INTERVAL_OPTIONS, VAULT_ADDRESS, vaultAbi } from '@/lib/vault'
import { useRecipients } from '@/hooks/useRecipients'
import { useTxFlow } from '@/hooks/useTxFlow'
import type { AgentState } from '@/hooks/useAgent'
import type { useVaultState } from '@/hooks/useVaultState'
import { ActionButton, SectionCard, TxStatus } from './ui'
import { RecipientsEditor } from './RecipientsEditor'
import { CallPreview } from './TxDecoder'

export function PayrollPlanner({ agent, state }: { agent: AgentState; state: ReturnType<typeof useVaultState> }) {
  const r = useRecipients()
  const flow = useTxFlow()
  const { writeContractAsync } = useWriteContract()
  const [interval, setIntervalSeconds] = useState<number>(INTERVAL_OPTIONS[0].seconds)
  const [runs, setRuns] = useState('3')

  const maxRuns = Number.parseInt(runs, 10)
  const runsValid = Number.isInteger(maxRuns) && maxRuns >= 1 && maxRuns <= 1000
  const ready = r.addresses.length > 0 && r.errors.length === 0 && runsValid && agent.agentId !== undefined && agent.exists
  const spendCap = runsValid ? r.total * BigInt(maxRuns) : 0n

  const args = useMemo(
    () =>
      ready && agent.agentId !== undefined
        ? ([agent.agentId, r.addresses, r.amounts, BigInt(interval), 0n, maxRuns, spendCap] as const)
        : undefined,
    [ready, agent.agentId, r.addresses, r.amounts, interval, maxRuns, spendCap],
  )
  const calls = useMemo(
    () => (args ? [{ heading: 'createPlan', data: encodeFunctionData({ abi: vaultAbi, functionName: 'createPlan', args }) }] : []),
    [args],
  )

  const submit = async () => {
    if (!args) return
    await flow.run('Create payroll plan', [
      { label: 'Create plan', send: () => writeContractAsync({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'createPlan', args }) },
    ])
  }

  let hint: string | undefined
  if (agent.agentId === undefined) hint = 'Register or enter an agent ID in Agent status first.'
  else if (!agent.exists && !agent.isLoading) hint = `Agent #${agent.agentIdText} was not found in the ERC-8004 registry.`

  return (
    <SectionCard
      title="Automated payroll"
      subtitle="Choose who gets paid, how often, and a spend cap. Funds stay in your vault until your ERC-8004 agent triggers a run that passes every rule."
      icon={<CalendarClock size={18} aria-hidden />}
    >
      <RecipientsEditor r={r} idPrefix="payroll" defaultAmount="0.5" />

      <div className="form-grid">
        <div className="field-group">
          <label htmlFor="pay-interval" className="field-label">
            Repeats every
          </label>
          <select id="pay-interval" className="input" value={interval} onChange={(e) => setIntervalSeconds(Number(e.target.value))}>
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="pay-runs" className="field-label">
            Maximum runs
          </label>
          <input
            id="pay-runs"
            className="input num"
            inputMode="numeric"
            value={runs}
            onChange={(e) => /^\d{0,4}$/.test(e.target.value) && setRuns(e.target.value)}
          />
        </div>
      </div>

      <dl className="stats-grid" style={{ margin: 0 }}>
        <div className="stat">
          <dt className="label">Per run</dt>
          <dd className="stat-value" style={{ margin: 0 }}>
            {formatUsdc(r.total)} <span className="hero-unit" style={{ fontSize: '0.8125rem' }}>USDC</span>
          </dd>
        </div>
        <div className="stat">
          <dt className="label">Spend cap</dt>
          <dd className="stat-value" style={{ margin: 0 }}>
            {formatUsdc(spendCap)} <span className="hero-unit" style={{ fontSize: '0.8125rem' }}>USDC</span>
          </dd>
        </div>
      </dl>

      <CallPreview calls={calls} />
      {hint && <p className="hint hint-warn">{hint}</p>}
      <ActionButton
        block
        label="Create payroll plan"
        busy={flow.busy}
        busyLabel={flow.status === 'wallet' ? 'Confirm in wallet…' : 'Confirming…'}
        disabled={!ready || state.paused === true}
        onClick={() => void submit()}
      />
      <TxStatus status={flow.status} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} />
      {flow.status === 'success' && <p className="hint hint-ok">Plan created. Trigger it from Agent status once it is due.</p>}
    </SectionCard>
  )
}
