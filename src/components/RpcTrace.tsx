import { useMemo, useState } from 'react'
import { clearRpcLog, useRpcLog } from '@/lib/rpcLog'

export function RpcTrace() {
  const entries = useRpcLog()
  const [showAll, setShowAll] = useState(false)

  // Actions: calls made inside a named trace group, wallet requests and failures.
  const visible = useMemo(
    () => (showAll ? entries : entries.filter((e) => e.group || e.source === 'wallet' || !e.ok)).slice(0, 60),
    [entries, showAll],
  )

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {[
            { id: false, label: 'Actions' },
            { id: true, label: 'All RPC' },
          ].map((tab) => (
            <button
              key={tab.label}
              aria-pressed={showAll === tab.id}
              onClick={() => setShowAll(tab.id)}
              className="min-h-9 rounded-lg px-3 text-xs font-semibold"
              style={{ background: showAll === tab.id ? 'var(--accent)' : 'transparent', color: showAll === tab.id ? '#0d1b2f' : 'var(--muted)' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--subtle)' }}>
          <span className="tabular-nums">{entries.length} calls logged</span>
          <button className="font-semibold underline-offset-2 hover:underline" onClick={clearRpcLog}>
            Clear
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="glass-inner p-3 text-sm text-pretty" style={{ color: 'var(--subtle)' }}>
          {showAll ? 'No RPC calls yet.' : 'Send a transaction to see its RPC calls grouped here. Every call is also in the Tracing panel.'}
        </p>
      ) : (
        <ul className="mono max-h-72 space-y-1 overflow-y-auto pr-1 text-[11px]">
          {visible.map((e) => (
            <li key={e.id} className="glass-inner flex items-center gap-2 px-3 py-2">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.ok ? 'var(--success)' : 'var(--danger)' }} />
              <span className="tabular-nums" style={{ color: 'var(--subtle)' }}>
                {new Date(e.ts).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--ink-2)' }} title={e.detail}>
                {e.method}
                {e.detail ? ` · ${e.detail}` : ''}
              </span>
              {e.group && (
                <span className="hidden max-w-32 truncate rounded-full px-2 py-0.5 sm:inline" style={{ background: 'rgba(172,198,233,0.14)', color: 'var(--accent)' }}>
                  {e.group}
                </span>
              )}
              <span className="rounded-full px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtle)' }}>
                {e.source}
              </span>
              <span className="w-12 text-right tabular-nums" style={{ color: 'var(--subtle)' }}>
                {e.durationMs}ms
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
