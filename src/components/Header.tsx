import { ConnectKitButton } from 'connectkit'
import { ExternalLink, Vault } from 'lucide-react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID, VAULT_ADDRESS, shortAddress } from '@/lib/vault'

export function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <Vault size={22} aria-hidden />
        </div>
        <div className="minw0">
          <h1 className="brand-title">ArcPay Automated Vault</h1>
          <a href={buildAddressExplorerUrl(CHAIN_ID, VAULT_ADDRESS)} target="_blank" rel="noopener noreferrer" className="brand-link">
            Vault {shortAddress(VAULT_ADDRESS)} <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="net-badge">
          <span className="dot" aria-hidden /> Arc Testnet
        </span>
        <ConnectKitButton.Custom>
          {({ isConnected, show, truncatedAddress }) => (
            <button type="button" className="btn btn-primary btn-sm" onClick={show}>
              {isConnected ? truncatedAddress : 'Connect wallet'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </header>
  )
}
