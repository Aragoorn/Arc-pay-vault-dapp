import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { CheckCircle2, Play, XCircle } from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import { CHECK_LABELS, VAULT_ADDRESS, vaultAbi } from '@/lib/vault'
import { usePlans, type PlanView } from '@/hooks/usePlans'
import { useNow, type useVaultState } from '@/hooks/useVaultState'
import { useTxFlow } from '@/hooks/useTxFlow'
import { ActionButton, EmptyState, TxStatus } from './ui'
import { TxReceiptDecoder } from './TxDecoder'

function countdown(seconds: number): string {
  if (seconds <= 0) return 'now'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

function Rule({ ok, label }: { ok: boolean | undefined; label: string }) {
  return (
    <li className={`rule${ok === false ? ' rule-bad' : ''}`}>
      {ok ? (
        <CheckCircle2 size={14} aria-hidden style={{ color: 'var(--success)', flex: 'none' }} />
      ) : (
        <XCircle size={14} aria-hidden style={{ color: ok === undefined ? 'var(--subtle)' : 'var(--danger)', flex: 'none' }} />
      )}
      {label}
    </li>
  )
}

export function PlanList({ state }: { state: ReturnType<typeof useVaultState> }) {
  const { plans, isLoading, total } = usePlans()
  const now = useNow()
  const flow = useTxFlow()
  const { writeContractAsync } = useWriteContract()
  const [activePlan, setActivePlan] = useState<bigint>()

  const execute = async (plan: PlanView) => {
    setActivePlan(plan.id)
    await flow.run(`Agent executes payroll #${plan.id}`, [
      {
        label: 'Execute payroll',
        send: () => writeContractAsync({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'executePayroll', args: [plan.id, plan.agentId] }),
      },
    ])
  }
  const cancel = async (plan: PlanView) => {
    setActivePlan(plan.id)
    await flow.run(`Cancel plan #${plan.id}`, [
      { label: 'Cancel plan', send: () => writeContractAsync({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'cancelPlan', args: [plan.id] }) },
    ])
  }

  if (!state.address) return <EmptyState>Connect your wallet to see your payroll plans.</EmptyState>
  if (isLoading) return <EmptyState>Loading plans…</EmptyState>
  if (plans.length === 0) return <EmptyState>No payroll plans yet. Create one in Automated payroll.</EmptyState>

  return (
    <div className="stack">
      {total > plans.length && (
        <p className="hint">
          Showing your {plans.length} newest of {total} plans.
        </p>
      )}
      {plans.map((plan) => {
        const wait = Number(plan.nextExecutionAt) - now
        const ready = plan.check === 0
        const funded = state.vaultBalance !== undefined ? state.vaultBalance >= plan.perRun : undefined
        const withinCap = plan.spent + plan.perRun <= plan.spendCap
        const active = activePlan === plan.id
        return (
          <article key={plan.id.toString()} className="plan">
            <div className="row-between">
              <h3 className="plan-title">
                Plan #{plan.id.toString()} <span className="hint">· agent #{plan.agentId.toString()}</span>
              </h3>
              <span className={`pill ${ready ? 'pill-ok' : plan.active ? 'pill-warn' : 'pill-bad'}`}>
                {plan.check !== undefined ? (CHECK_LABELS[plan.check] ?? 'Unknown') : '…'}
              </span>
            </div>
            <p className="hint num" style={{ margin: 0 }}>
              {plan.recipients.length} recipient{plan.recipients.length === 1 ? '' : 's'} · {formatUsdc(plan.perRun)} USDC per run · run {plan.executions}/
              {plan.maxExecutions} · spent {formatUsdc(plan.spent)} of {formatUsdc(plan.spendCap)}
            </p>

            <ul className="rules" aria-label="Rules checked before release">
              <Rule ok={plan.active} label="Plan is active" />
              <Rule ok={plan.isOperator} label={`You operate agent #${plan.agentId.toString()}`} />
              <Rule ok={wait <= 0} label={wait <= 0 ? 'Payment is due' : `Due in ${countdown(wait)}`} />
              <Rule ok={plan.executions < plan.maxExecutions} label="Runs remaining" />
              <Rule ok={withinCap} label="Within spend cap" />
              <Rule ok={funded} label="Vault balance covers a run" />
            </ul>

            <div className="btn-row">
              <ActionButton
                block
                small
                label="Execute as agent"
                icon={<Play size={14} aria-hidden />}
                busy={flow.busy && active}
                busyLabel="Executing…"
                disabled={!ready || flow.busy}
                onClick={() => void execute(plan)}
              />
              <ActionButton block small variant="ghost" label="Cancel plan" disabled={!plan.active || flow.busy} onClick={() => void cancel(plan)} />
            </div>
            {active && (
              <>
                <TxStatus status={flow.status} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} />
                {flow.status === 'success' && <TxReceiptDecoder hash={flow.hash} />}
              </>
            )}
          </article>
        )
      })}
      <p className="hint">The vault re-checks every rule onchain before any USDC leaves.</p>
    </div>
  )
}
