import { useEffect, useState } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { zeroAddress } from 'viem'
import { CHAIN_ID, USDC_ADDRESS, VAULT_ADDRESS, erc20Abi, vaultAbi } from '@/lib/vault'

/** One-second ticker for countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Live balances read straight from Arc Testnet. */
export function useVaultState() {
  const { address } = useAccount()
  const account = address ?? zeroAddress
  const { data, isLoading, isError, dataUpdatedAt } = useReadContracts({
    contracts: [
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'balances', args: [account], chainId: CHAIN_ID },
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [account], chainId: CHAIN_ID },
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [account, VAULT_ADDRESS], chainId: CHAIN_ID },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'totalDeposits', chainId: CHAIN_ID },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'paused', chainId: CHAIN_ID },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'planCount', chainId: CHAIN_ID },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'identityRegistry', chainId: CHAIN_ID },
    ],
    query: { refetchInterval: 5000 },
  })

  const pick = <T,>(i: number): T | undefined => (data?.[i]?.status === 'success' ? (data[i].result as T) : undefined)

  return {
    address,
    vaultBalance: address ? pick<bigint>(0) : undefined,
    walletBalance: address ? pick<bigint>(1) : undefined,
    allowance: address ? pick<bigint>(2) : undefined,
    totalDeposits: pick<bigint>(3),
    paused: pick<boolean>(4),
    planCount: pick<bigint>(5),
    registry: pick<`0x${string}`>(6),
    isLoading,
    isError,
    updatedAt: dataUpdatedAt,
  }
}
