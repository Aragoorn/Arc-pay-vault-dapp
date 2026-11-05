import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { parseEventLogs } from 'viem'
import { CHAIN_ID, VAULT_ADDRESS, VAULT_DEPLOY_BLOCK, vaultAbi } from '@/lib/vault'

export interface VaultEvent {
  name: string
  args: Record<string, unknown>
  txHash: `0x${string}`
  blockNumber: bigint
  logIndex: number
  timestamp?: number
}

/** Bounded lookback: never scan from genesis. */
const LOOKBACK_BLOCKS = 5000n
const CHUNK = 2000n
const TIMESTAMPED_EVENTS = 25

/** Vault events from the deployment block (or a bounded lookback), newest first. */
export function useVaultEvents() {
  const client = usePublicClient({ chainId: CHAIN_ID })

  return useQuery({
    queryKey: ['vault-events', VAULT_ADDRESS],
    enabled: !!client,
    refetchInterval: 6000,
    queryFn: async () => {
      if (!client) throw new Error('No client')
      const head = await client.getBlockNumber()
      const floor = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n
      const from = floor > VAULT_DEPLOY_BLOCK ? floor : VAULT_DEPLOY_BLOCK

      const logs = []
      for (let start = from; start <= head; start += CHUNK) {
        const end = start + CHUNK - 1n < head ? start + CHUNK - 1n : head
        logs.push(...(await client.getLogs({ address: VAULT_ADDRESS, fromBlock: start, toBlock: end })))
      }

      const events: VaultEvent[] = parseEventLogs({ abi: vaultAbi, logs })
        .map((l) => ({
          name: l.eventName as string,
          args: (l.args ?? {}) as Record<string, unknown>,
          txHash: l.transactionHash,
          blockNumber: l.blockNumber,
          logIndex: l.logIndex,
        }))
        .reverse()

      const recent = events.slice(0, TIMESTAMPED_EVENTS)
      const blocks = [...new Set(recent.map((e) => e.blockNumber))]
      const stamps = new Map<bigint, number>()
      await Promise.all(
        blocks.map(async (blockNumber) => {
          const block = await client.getBlock({ blockNumber })
          stamps.set(blockNumber, Number(block.timestamp))
        }),
      )
      return {
        head,
        from,
        events: events.slice(0, 150).map((e) => ({ ...e, timestamp: stamps.get(e.blockNumber) })),
      }
    },
  })
}
