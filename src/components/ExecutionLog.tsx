import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useVaultEvents } from '@/hooks/useVaultEvents'
import { describeLog, type Tone } from '@/lib/describeLog'
import { shortHash, txUrl } from '@/lib/vault'

const TONE: Record<Tone, string> = {
  ok: 'var(--success)',
  warn: 'var(--warn)',
  bad: 'var(--danger)',
  info: 'var(--accent)',
}

export function ExecutionLog() {
  const { logs, progress } = useVaultEvents()
  const [agentOnly, setAgentOnly] = useState(true)

  const lines = useMemo(
    () => logs.map((log) => ({ log, line: describeLog(log) })).filter(({ line }) => !agentOnly || line.agent),
    [logs, agentOnly],
  )

  const behind = progress.head !== undefined && progress.scanned !== undefined ? progress.head - progress.scanned : undefined

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {[
            { id: true, label: 'Agent' },
            { id: false, label: 'All vault events' },
          ].map((tab) => (
            <button
              key={tab.label}
              aria-pressed={agentOnly === tab.id}
              onClick={() => setAgentOnly(tab.id)}
              className="min-h-9 rounded-lg px-3 text-xs font-semibold"
              style={{ background: agentOnly === tab.id ? 'var(--accent)' : 'transparent', color: agentOnly === tab.id ? '#0d1b2f' : 'var(--muted)' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          {progress.error
            ? 'Event scan hit an error, retrying'
            : progress.scanned === undefined
              ? 'Scanning from deployment block…'
              : behind === 0n || (behind !== undefined && behind < 3n)
                ? `Caught up at block ${progress.scanned.toString()}`
                : `Scanned to block ${progress.scanned.toString()}, ${behind?.toString()} behind head`}
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="glass-inner p-3 text-sm text-pretty" style={{ color: 'var(--subtle)' }}>
          {progress.scanned === undefined
            ? 'Reading vault events from Arc Testnet.'
            : agentOnly
              ? 'No agent activity yet. Configure a payroll and run the agent.'
              : 'No vault events yet.'}
        </p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {lines.slice(0, 80).map(({ log, line }) => (
            <li key={log.id} className="glass-inner flex items-start gap-3 p-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: TONE[line.tone] }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-balance">{line.title}</div>
                {line.detail && (
                  <div className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                    {line.detail}
                  </div>
                )}
              </div>
              <a
                href={txUrl(log.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mono inline-flex shrink-0 items-center gap-1 text-[11px]"
                style={{ color: 'var(--subtle)' }}
                aria-label={`Open transaction ${shortHash(log.txHash)}`}
              >
                #{log.blockNumber.toString()} <ExternalLink className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
