import { useAccount } from 'wagmi'
import { Plus, Trash2, UserRound, Wand2 } from 'lucide-react'
import { MAX_RECIPIENTS, type RecipientsState } from '@/hooks/useRecipients'
import { formatUsdc } from '@/onchain-money'

export function RecipientsEditor({ r, idPrefix, defaultAmount = '1' }: { r: RecipientsState; idPrefix: string; defaultAmount?: string }) {
  const { address } = useAccount()

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="chip" onClick={() => r.add()} disabled={r.rows.length >= MAX_RECIPIENTS}>
          <Plus size={14} aria-hidden /> Add row
        </button>
        <button type="button" className="chip" onClick={() => r.addTestWallets(3, defaultAmount)}>
          <Wand2 size={14} aria-hidden /> 3 test wallets
        </button>
        <button type="button" className="chip" disabled={!address} onClick={() => address && r.add(address, defaultAmount)}>
          <UserRound size={14} aria-hidden /> My wallet
        </button>
        <button type="button" className="chip" onClick={r.clear}>
          Clear
        </button>
      </div>

      <div className="stack-sm">
        <div className="recipient-head" aria-hidden>
          <span className="label">Recipient address</span>
          <span className="label">Amount (USDC)</span>
          <span />
        </div>
        <ul className="recipient-list">
          {r.rows.map((row, i) => (
            <li key={row.key} className="recipient-row">
              <div className="r-addr">
                <label htmlFor={`${idPrefix}-addr-${row.key}`} className="sr-only">
                  Recipient {i + 1} address
                </label>
                <input
                  id={`${idPrefix}-addr-${row.key}`}
                  className="input input-mono"
                  value={row.address}
                  onChange={(e) => r.update(row.key, { address: e.target.value })}
                  placeholder="0x…"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="r-amt">
                <label htmlFor={`${idPrefix}-amt-${row.key}`} className="sr-only">
                  Recipient {i + 1} amount in USDC
                </label>
                <input
                  id={`${idPrefix}-amt-${row.key}`}
                  className="input input-num"
                  value={row.amount}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) r.update(row.key, { amount: v })
                  }}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
              <button type="button" className="icon-btn r-del" aria-label={`Remove recipient ${i + 1}`} disabled={r.rows.length <= 1} onClick={() => r.remove(row.key)}>
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="recipient-total">
        <span className="hint">
          {r.addresses.length} valid recipient{r.addresses.length === 1 ? '' : 's'}
        </span>
        <strong className="num">Total {formatUsdc(r.total)} USDC</strong>
      </div>
      {r.errors.length > 0 && (
        <p className="hint hint-bad" role="alert">
          {r.errors[0]}
          {r.errors.length > 1 ? ` (+${r.errors.length - 1} more)` : ''}
        </p>
      )}
      <p className="hint">Test wallets are freshly generated throwaway addresses. Their keys are discarded, so treat anything sent there as spent.</p>
    </div>
  )
}
