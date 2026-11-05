import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  parseEventLogs,
  toFunctionSelector,
  getAbiItem,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import { toast } from 'sonner'
import { arcPayVaultAbi } from '@/contracts/arcPayVaultAbi'
import { CHAIN_ID, USDC_ADDRESS, VAULT_ADDRESS, describeError, formatArg, identityAbi, isUserRejection } from '@/lib/vault'
import { traceGroup } from '@/lib/rpcLog'
import { startTx, updateTx, type DecodedCall, type DecodedEvent } from '@/lib/txLog'

export interface TxCall {
  /** Trace group and log title, for example "Deposit USDC". */
  label: string
  to: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
}

const EVENT_ABI = [...arcPayVaultAbi, ...erc20Abi, ...identityAbi] as Abi

function decodeCall(abi: Abi, data: Hex): DecodedCall {
  const decoded = decodeFunctionData({ abi, data })
  const item = getAbiItem({ abi, name: decoded.functionName })
  const inputs = item && 'inputs' in item ? item.inputs : []
  const args = (decoded.args ?? []).map((value, index) => ({
    name: inputs[index]?.name || `arg${index}`,
    value: formatArg(inputs[index]?.name, value),
  }))
  const selector = item && item.type === 'function' ? toFunctionSelector(item) : (data.slice(0, 10) as Hex)
  return { functionName: decoded.functionName, args, selector, calldata: data }
}

function contractName(address: string): string {
  const lower = address.toLowerCase()
  if (lower === VAULT_ADDRESS.toLowerCase()) return 'ArcPayVault'
  if (lower === USDC_ADDRESS.toLowerCase()) return 'USDC'
  return 'IdentityRegistry'
}

/** Decodes, simulates, sends and decodes the receipt of one contract call. Resolves true on success. */
export function useVaultTx() {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()

  return useCallback(
    async (call: TxCall): Promise<{ ok: boolean; events: DecodedEvent[]; hash?: Hex }> => {
      if (!address || !publicClient) {
        toast.error('Connect your wallet to continue.')
        return { ok: false, events: [] }
      }
      const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args })
      const id = startTx(call.label, decodeCall(call.abi, data))

      return traceGroup(call.label, async () => {
        try {
          if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })

          // Simulate first so a revert is reported by its contract error name.
          await publicClient.call({ account: address, to: call.to, data })

          updateTx(id, { status: 'signing' })
          const hash = await sendTransactionAsync({ to: call.to, data, chainId: CHAIN_ID })
          updateTx(id, { status: 'confirming', hash })

          const receipt = await publicClient.waitForTransactionReceipt({ hash })
          const events: DecodedEvent[] = parseEventLogs({ abi: EVENT_ABI, logs: receipt.logs })
            .filter((log) => {
              const a = log.address.toLowerCase()
              return a === VAULT_ADDRESS.toLowerCase() || a === USDC_ADDRESS.toLowerCase() || a === call.to.toLowerCase()
            })
            .map((log) => {
              const item = getAbiItem({ abi: EVENT_ABI, name: log.eventName })
              const inputs = item && 'inputs' in item ? item.inputs : []
              const values = (log.args ?? {}) as Record<string, unknown>
              return {
                contract: contractName(log.address),
                eventName: log.eventName,
                args: inputs.map((input, index) => ({
                  name: input.name || `arg${index}`,
                  value: formatArg(input.name, values[input.name ?? ''] ?? (log.args as unknown as unknown[])[index]),
                })),
              }
            })

          const ok = receipt.status === 'success'
          updateTx(id, {
            status: ok ? 'success' : 'reverted',
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            events,
            message: ok ? undefined : 'The transaction was mined but reverted.',
          })
          await queryClient.invalidateQueries()
          if (ok) toast.success(`${call.label} confirmed`)
          else toast.error(`${call.label} reverted`)
          return { ok, events, hash }
        } catch (err) {
          const cancelled = isUserRejection(err)
          const message = describeError(err)
          updateTx(id, { status: cancelled ? 'cancelled' : 'failed', message })
          if (!cancelled) toast.error(message)
          return { ok: false, events: [] }
        }
      })
    },
    [address, chainId, publicClient, queryClient, sendTransactionAsync, switchChainAsync],
  )
}
