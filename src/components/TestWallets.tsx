import { useReadContracts } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { Copy, KeyRound, Trash2, WalletMinimal } from 'lucide-react'
import { toast } from 'sonner'
import type { TestWallet } from '@/hooks/useTestWallets'
import { fixed } from '@/lib/amount'
import { CHAIN_ID, USDC_ADDRESS, addressUrl, shortAddress } from '@/lib/vault'

interface Props {
  wallets: TestWallet[]
  onGenerate: (count: number) => void
  onRemove: (address: Address) => void
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error('Copy is not available here.')
  }
}

export function TestWallets({ wallets, onGenerate, onRemove }: Props) {
  const balances = useReadContracts({
    contracts: wallets.map((w) => ({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [w.address] as const,
      chainId: CHAIN_ID,
    })),
    query: { enabled: wallets.length > 0, refetchInterval: 8000 },
  })

  return (
    <section className="glass p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="display text-lg font-semibold">Test wallets</h2>
        <button className="btn-ghost inline-flex items-center gap-1.5" onClick={() => onGenerate(3)}>
          <WalletMinimal className="size-3.5" /> Generate 3
        </button>
      </div>
      <p className="mb-3 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        Fresh Arc Testnet recipients created in this browser. Balances are read live, so you can watch a batch land.
      </p>

      {wallets.length === 0 ? (
        <p className="glass-inner p-3 text-sm" style={{ color: 'var(--subtle)' }}>
          No test wallets yet. Generate a few to use as batch recipients.
        </p>
      ) : (
        <ul className="space-y-2">
          {wallets.map((w, index) => {
            const result = balances.data?.[index]
            const raw = result?.status === 'success' ? (result.result) : undefined
            return (
              <li key={w.address} className="glass-inner flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{w.label}</div>
                  <a href={addressUrl(w.address)} target="_blank" rel="noopener noreferrer" className="mono text-xs" style={{ color: 'var(--subtle)' }}>
                    {shortAddress(w.address)}
                  </a>
                </div>
                <div className="flex items-center gap-1">
                  <span className="mr-2 text-sm font-semibold tabular-nums">{raw === undefined ? '…' : fixed(raw)}</span>
                  <button className="btn-ghost !px-2" aria-label={`Copy ${w.label} address`} onClick={() => void copy(w.address, 'Address')}>
                    <Copy className="size-3.5" />
                  </button>
                  <button className="btn-ghost !px-2" aria-label={`Copy ${w.label} private key`} onClick={() => void copy(w.privateKey, 'Private key')}>
                    <KeyRound className="size-3.5" />
                  </button>
                  <button className="btn-ghost !px-2" aria-label={`Remove ${w.label}`} onClick={() => onRemove(w.address)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Testnet only. Keys are stored in this browser so nothing you send is stranded. Never reuse them on a real network.
      </p>
    </section>
  )
}
