import { useCallback, useState } from 'react'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Address, Hex } from 'viem'

export interface TestWallet {
  label: string
  address: Address
  privateKey: Hex
}

const STORAGE_KEY = 'arcpay-test-wallets'

function load(): TestWallet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as TestWallet[]) : []
  } catch {
    return []
  }
}

/**
 * Throwaway Arc Testnet recipients generated in this browser. The keys stay in
 * local storage so the USDC you send is never stranded. Testnet only.
 */
export function useTestWallets() {
  const [wallets, setWallets] = useState<TestWallet[]>(load)

  const persist = useCallback((next: TestWallet[]) => {
    setWallets(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const generate = useCallback(
    (count: number) => {
      const created = Array.from({ length: count }, (_, i) => {
        const privateKey = generatePrivateKey()
        return {
          label: `Test wallet ${wallets.length + i + 1}`,
          address: privateKeyToAccount(privateKey).address,
          privateKey,
        }
      })
      persist([...wallets, ...created])
      return created
    },
    [persist, wallets],
  )

  const remove = useCallback((address: Address) => persist(wallets.filter((w) => w.address !== address)), [persist, wallets])

  return { wallets, generate, remove }
}
