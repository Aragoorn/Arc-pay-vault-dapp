import { useState } from 'react'
import { ExternalLink, ScrollText } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'
import { CHAIN_ID, shortAddress, shortHash } from '@/lib/vault'
import { callLog } from '@/lib/callLog'
import { rpcLog } from '@/lib/rpcLog'
import { useVaultEvents, type VaultEvent } from '@/hooks/useVaultEvents'
import { useNow } from '@/hooks/useVaultState'
import { EmptyState, SectionCard } from './ui'

type Tab = 'events' | 'calls' | 'rpc'

const usdc = (v: unknown) => `${formatUsdc(v as bigint)} USDC`
const addr = (v: unknown) => shortAddress(String(v))

function summarize(e: VaultEvent): string {
  const a = e.args
  switch (e.name) {
    case 'Deposited':
      return `${addr(a.account)} deposited ${usdc(a.amount)}`
    case 'Withdrawn':
      return `${addr(a.account)} withdrew ${usdc(a.amount)}`
    case 'BatchTransferred':
      return `${addr(a.payer)} paid ${usdc(a.total)} to ${String(a.count)} recipients`
    case 'PaymentSent':
      return `${usdc(a.amount)} to ${addr(a.recipient)}${String(a.planId) === '0' ? '' : ` (plan #${String(a.planId)})`}`
    case 'PaymentFailed':
      return `${usdc(a.amount)} to ${addr(a.recipient)} failed and was refunded to the payer`
    case 'PlanCreated':
      return `Plan #${String(a.planId)} created by ${addr(a.payer)} for agent #${String(a.agentId)}: ${usdc(a.totalPerRun)} per run`
    case 'PlanCancelled':
      return `Plan #${String(a.planId)} cancelled`
    case 'PlanAgentChanged':
      return `Plan #${String(a.planId)} now uses agent #${String(a.newAgentId)}`
    case 'PayrollRuleVerified':
      return `Rules verified for plan #${String(a.planId)}: agent #${String(a.agentId)} via ${addr(a.operator)}`
    case 'PayrollExecuted':
      return `Plan #${String(a.planId)} run ${String(a.runIndex)} released ${usdc(a.paidTotal)}${(a.failedTotal as bigint) > 0n ? `, ${usdc(a.failedTotal)} refunded` : ''}`
    default:
      return e.name
  }
}

function tone(name: string): string {
  if (name === 'PaymentFailed') return 'pill-bad'
  if (name === 'PayrollRuleVerified' || name === 'PayrollExecuted' || name === 'PaymentSent') return 'pill-ok'
  if (name === 'PlanCancelled') return 'pill-warn'
  return ''
}

function ago(ts: number | undefined, now: number): string {
  if (!ts) return ''
  const d = Math.max(0, now - ts)
  if (d < 60) return `${d}s ago`
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function TxLink({ hash }: { hash: `0x${string}` }) {
  return (
    <a href={buildTxExplorerUrl(CHAIN_ID, hash)} target="_blank" rel="noopener noreferrer" className="link">
      {shortHash(hash)} <ExternalLink size={12} aria-hidden />
    </a>
  )
}

function EventsTab() {
  const { data, isLoading, isError } = useVaultEvents()
  const now = useNow(5000)
  if (isLoading) return <EmptyState>Reading vault events from Arc Testnet…</EmptyState>
  if (isError || !data) return <EmptyState>Could not read vault events. Retrying automatically.</EmptyState>
  return (
    <div className="stack-sm">
      <p className="hint num" style={{ margin: 0 }}>
        Scanned blocks {data.from.toString()} to {data.head.toString()} · {data.events.length} events
      </p>
      {data.events.length === 0 ? (
        <EmptyState>No vault activity yet. Make a deposit to see events appear here.</EmptyState>
      ) : (
        <ol className="log-list">
          {data.events.map((e) => (
            <li key={`${e.txHash}-${e.logIndex}`} className="log-item">
              <span className={`pill ${tone(e.name)}`}>{e.name}</span>
              <span className="log-text">{summarize(e)}</span>
              <span className="hint">{ago(e.timestamp, now)}</span>
              <TxLink hash={e.txHash} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function CallsTab() {
  const calls = callLog.use()
  if (calls.length === 0) return <EmptyState>Contract calls you make from this app appear here, grouped the same way as in the Tracing panel.</EmptyState>
  return (
    <ol className="log-list">
      {calls.map((c) => (
        <li key={c.id} className="log-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="row">
            <span className={`pill ${c.status === 'success' ? 'pill-ok' : c.status === 'error' ? 'pill-bad' : 'pill-warn'}`}>{c.status}</span>
            <strong style={{ fontSize: '0.875rem' }}>{c.label}</strong>
            {c.durationMs !== undefined && <span className="hint num">{(c.durationMs / 1000).toFixed(1)}s</span>}
          </div>
          {c.steps.map((s) => (
            <div key={s.label} className="row-between">
              <span>
                {s.label} · {s.status}
              </span>
              {s.hash && <TxLink hash={s.hash} />}
            </div>
          ))}
          {c.error && <span className="hint hint-bad">{c.error}</span>}
        </li>
      ))}
    </ol>
  )
}

function RpcTab() {
  const entries = rpcLog.use()
  const [hideReads, setHideReads] = useState(true)
  const shown = hideReads ? entries.filter((e) => e.method !== 'eth_call' && e.method !== 'eth_blockNumber') : entries
  return (
    <div className="stack-sm">
      <div className="row-between">
        <label className="row hint" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={hideReads} onChange={(e) => setHideReads(e.target.checked)} />
          Hide polling reads (eth_call, eth_blockNumber)
        </label>
        <span className="hint num">{entries.length} calls captured</span>
      </div>
      {shown.length === 0 ? (
        <EmptyState>No JSON-RPC calls captured yet.</EmptyState>
      ) : (
        <ol className="log-list">
          {shown.slice(0, 80).map((e) => (
            <li key={e.id} className="log-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="row-between">
                <span className="row">
                  <span className={`pill ${e.ok ? 'pill-ok' : 'pill-bad'}`}>{e.ok ? 'ok' : 'error'}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {e.method}
                  </span>
                </span>
                <span className="hint num">{e.ms}ms</span>
              </div>
              <span className="log-code">→ {e.params}</span>
              <span className="log-code" style={{ color: e.ok ? 'var(--ink-2)' : 'var(--danger)' }}>
                ← {e.summary}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function TracePanel() {
  const [tab, setTab] = useState<Tab>('events')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'events', label: 'Execution log' },
    { id: 'calls', label: 'Call trace' },
    { id: 'rpc', label: 'RPC log' },
  ]
  return (
    <SectionCard
      title="Execution logs and traces"
      subtitle="Onchain events from the vault, every contract call you send, and every JSON-RPC request this app makes. The Tracing panel shows the same calls grouped by action."
      icon={<ScrollText size={18} aria-hidden />}
    >
      <div role="tablist" aria-label="Log views" className="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'events' && <EventsTab />}
      {tab === 'calls' && <CallsTab />}
      {tab === 'rpc' && <RpcTab />}
    </SectionCard>
  )
}
