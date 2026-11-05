import { TokenUSDC } from '@web3icons/react'
import { Activity, PauseCircle } from 'lucide-react'
import { formatUnitsFixed } from '@/onchain-money'
import { USDC_DECIMALS } from '@/onchain-facts'
import { useNow, type useVaultState } from '@/hooks/useVaultState'

type VaultState = ReturnType<typeof useVaultState>

const fmt = (raw: bigint | undefined) => (raw === undefined ? '—' : formatUnitsFixed(raw, USDC_DECIMALS, 2))

export function BalanceHero({ state }: { state: VaultState }) {
  const now = useNow()
  const connected = !!state.address
  const ageSec = state.updatedAt ? Math.max(0, now - Math.floor(state.updatedAt / 1000)) : undefined

  return (
    <section className="card">
      <div className="row-between">
        <span className="label">{connected ? 'Your vault balance' : 'Vault overview'}</span>
        <span className="pill pill-ok">
          <Activity size={12} aria-hidden />
          Live{ageSec !== undefined ? ` · updated ${ageSec}s ago` : ''}
        </span>
      </div>

      <div className="hero-amount">
        <TokenUSDC variant="branded" size={36} aria-hidden />
        <span className="hero-number" aria-live="polite">
          {state.isLoading ? '…' : state.isError ? 'Unavailable' : connected ? fmt(state.vaultBalance) : fmt(state.totalDeposits)}
        </span>
        <span className="hero-unit">USDC</span>
      </div>
      <p className="hint" style={{ marginTop: '0.5rem' }}>
        {connected ? 'Funds you can pay out or withdraw at any time.' : 'Connect a wallet to see your own balance and use the vault.'}
      </p>

      <dl className="stats-grid" style={{ margin: '1.5rem 0 0' }}>
        <div className="stat">
          <dt className="label">Wallet USDC balance</dt>
          <dd className="stat-value" style={{ margin: 0 }}>
            {connected ? fmt(state.walletBalance) : '—'}
          </dd>
          <span className="stat-foot">{connected ? 'In your connected wallet' : 'Connect to view'}</span>
        </div>
        <div className="stat">
          <dt className="label">Total value locked</dt>
          <dd className="stat-value" style={{ margin: 0 }}>
            {fmt(state.totalDeposits)}
          </dd>
          <span className="stat-foot">Across all depositors</span>
        </div>
        <div className="stat">
          <dt className="label">Payroll plans</dt>
          <dd className="stat-value" style={{ margin: 0 }}>
            {state.planCount === undefined ? '—' : state.planCount.toString()}
          </dd>
          <span className="stat-foot">{state.paused ? 'Vault is paused' : 'Created in this vault'}</span>
        </div>
      </dl>

      {state.paused && (
        <p className="pill pill-warn" style={{ marginTop: '1rem' }}>
          <PauseCircle size={14} aria-hidden /> Vault paused: withdrawals still work
        </p>
      )}
    </section>
  )
}
