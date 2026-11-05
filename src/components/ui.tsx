import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { CheckCircle2, ExternalLink, Loader2, TriangleAlert } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID, shortHash } from '@/lib/vault'
import type { FlowStatus } from '@/hooks/useTxFlow'

export function SectionCard({
  title,
  subtitle,
  icon,
  aside,
  children,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      <header className="card-head">
        <div className="card-head-main">
          {icon && <div className="card-icon">{icon}</div>}
          <div className="minw0">
            <h2 className="card-title">{title}</h2>
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
        </div>
        {aside && <div className="noshrink">{aside}</div>}
      </header>
      <div className="stack">{children}</div>
    </section>
  )
}

type Variant = 'primary' | 'outline' | 'ghost'

/** Action button that becomes "Connect wallet" until a wallet is attached. */
export function ActionButton({
  label,
  busyLabel,
  busy,
  disabled,
  onClick,
  variant = 'primary',
  block = false,
  small = false,
  icon,
}: {
  label: string
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  variant?: Variant
  block?: boolean
  small?: boolean
  icon?: ReactNode
}) {
  const { isConnected } = useAccount()
  const cls = `btn btn-${variant}${block ? ' btn-block' : ''}${small ? ' btn-sm' : ''}`
  if (!isConnected) {
    return (
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button type="button" className={cls} onClick={show}>
            Connect wallet
          </button>
        )}
      </ConnectKitButton.Custom>
    )
  }
  return (
    <button type="button" className={cls} disabled={disabled || busy} onClick={onClick}>
      {busy ? (
        <>
          <Loader2 size={16} className="spin" aria-hidden /> {busyLabel ?? 'Working…'}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  )
}

export function TxStatus({
  status,
  stepLabel,
  hash,
  error,
}: {
  status: FlowStatus
  stepLabel?: string
  hash?: `0x${string}`
  error?: string
}) {
  if (status === 'idle') return null
  const link = hash && (
    <a href={buildTxExplorerUrl(CHAIN_ID, hash)} target="_blank" rel="noopener noreferrer" className="link">
      {shortHash(hash)} <ExternalLink size={12} aria-hidden />
    </a>
  )
  return (
    <div className="tx-status" role="status" aria-live="polite">
      {status === 'wallet' && (
        <>
          <Loader2 size={16} className="spin" aria-hidden style={{ color: 'var(--accent)' }} />
          <span>Confirm “{stepLabel}” in your wallet…</span>
        </>
      )}
      {status === 'confirming' && (
        <>
          <Loader2 size={16} className="spin" aria-hidden style={{ color: 'var(--accent)' }} />
          <span>Waiting for Arc Testnet to confirm “{stepLabel}”…</span>
          {link}
        </>
      )}
      {status === 'success' && (
        <>
          <CheckCircle2 size={16} aria-hidden style={{ color: 'var(--success)' }} />
          <span className="hint-ok">Confirmed onchain</span>
          {link}
        </>
      )}
      {status === 'error' && (
        <>
          <TriangleAlert size={16} aria-hidden style={{ color: 'var(--danger)' }} />
          <span className="hint-bad">{error}</span>
        </>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
