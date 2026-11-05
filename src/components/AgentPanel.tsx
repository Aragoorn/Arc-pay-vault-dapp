import { Bot } from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import type { AgentState } from '@/hooks/useAgent'
import type { useVaultState } from '@/hooks/useVaultState'
import { useVaultEvents } from '@/hooks/useVaultEvents'
import { SectionCard } from './ui'
import { AgentIdentity } from './AgentIdentity'
import { PlanList } from './PlanList'

export function AgentPanel({ agent, state }: { agent: AgentState; state: ReturnType<typeof useVaultState> }) {
  const { data } = useVaultEvents()
  const runs = (data?.events ?? []).filter((e) => e.name === 'PayrollExecuted').slice(0, 4)

  const status =
    agent.agentId === undefined ? (
      <span className="pill">No agent</span>
    ) : agent.isLoading ? (
      <span className="pill">Checking…</span>
    ) : agent.exists ? (
      <span className={`pill ${agent.isOperator ? 'pill-ok' : 'pill-warn'}`}>
        Agent #{agent.agentIdText}
        {agent.isOperator ? ' · yours' : ''}
      </span>
    ) : (
      <span className="pill pill-bad">Not registered</span>
    )

  return (
    <SectionCard
      title="Agent status"
      subtitle="Your ERC-8004 agent is the only caller allowed to release payroll. The vault verifies its identity and every rule onchain first."
      icon={<Bot size={18} aria-hidden />}
      aside={status}
    >
      <AgentIdentity agent={agent} registry={state.registry} />
      <PlanList state={state} />
      <div className="inner stack-sm">
        <span className="label">Latest agent executions</span>
        {runs.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            No payroll has been executed yet.
          </p>
        ) : (
          runs.map((e) => (
            <div key={`${e.txHash}-${e.logIndex}`} className="row-between num" style={{ fontSize: '0.8125rem' }}>
              <span>
                Plan #{String(e.args.planId)} · run {String(e.args.runIndex)} · agent #{String(e.args.agentId)}
              </span>
              <span className="hint-ok">{formatUsdc(e.args.paidTotal as bigint)} USDC paid</span>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  )
}
