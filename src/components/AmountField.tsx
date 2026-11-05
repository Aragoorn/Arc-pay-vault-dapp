import { exact, fixed } from '@/lib/amount'

interface Props {
  value: string
  onChange: (value: string) => void
  /** Spendable balance for the Max shortcut, in USDC base units. */
  max?: bigint
  maxLabel: string
  disabled?: boolean
}

export function AmountField({ value, onChange, max, maxLabel, disabled }: Props) {
  return (
    <div className="glass-inner p-4">
      <div className="flex items-baseline gap-2">
        <input
          inputMode="decimal"
          aria-label="Amount in USDC"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value.replace(/[^0-9.]/g, '')
            if (next === '' || /^\d*\.?\d{0,6}$/.test(next)) onChange(next)
          }}
          placeholder="0.00"
          className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-500 disabled:opacity-50"
        />
        <span className="text-sm font-semibold" style={{ color: 'var(--subtle)' }}>
          USDC
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          {maxLabel}: {max === undefined ? '—' : fixed(max)}
        </span>
        <button
          type="button"
          disabled={max === undefined || max === 0n || disabled}
          onClick={() => max !== undefined && onChange(exact(max))}
          className="min-h-9 px-2 text-xs font-semibold disabled:opacity-40"
          style={{ color: 'var(--accent)' }}
        >
          Max
        </button>
      </div>
    </div>
  )
}
