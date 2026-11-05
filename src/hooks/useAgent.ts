import { useCallback, useMemo, useState } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { CHAIN_ID, registryAbi } from '@/lib/vault'

const STORAGE_KEY = 'arcpay.agentIds'

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** The ERC-8004 agent identity the connected wallet operates, verified against the registry. */
export function useAgent(registry: Address | undefined) {
  const { address } = useAccount()
  const [saved, setSaved] = useState<Record<string, string>>(load)
  const key = address?.toLowerCase() ?? ''
  const agentIdText = saved[key] ?? ''

  const setAgentIdText = useCallback(
    (value: string) => {
      if (!/^\d*$/.test(value)) return
      setSaved((prev) => {
        const next = { ...prev, [key]: value }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* storage unavailable */
        }
        return next
      })
    },
    [key],
  )

  const agentId = useMemo(() => (agentIdText ? BigInt(agentIdText) : undefined), [agentIdText])

  const { data, isLoading } = useReadContracts({
    contracts:
      registry && agentId !== undefined
        ? [
            { address: registry, abi: registryAbi, functionName: 'ownerOf' as const, args: [agentId] as const, chainId: CHAIN_ID },
            { address: registry, abi: registryAbi, functionName: 'getAgentWallet' as const, args: [agentId] as const, chainId: CHAIN_ID },
          ]
        : [],
    query: { enabled: !!registry && agentId !== undefined, refetchInterval: 15000 },
  })

  const owner = data?.[0]?.status === 'success' ? (data[0].result) : undefined
  const wallet = data?.[1]?.status === 'success' ? (data[1].result) : undefined
  const same = (a?: Address) => !!a && !!address && a.toLowerCase() === address.toLowerCase()

  return {
    agentId,
    agentIdText,
    setAgentIdText,
    exists: !!owner,
    owner,
    wallet,
    isOperator: same(owner) || same(wallet),
    isLoading,
  }
}

export type AgentState = ReturnType<typeof useAgent>
