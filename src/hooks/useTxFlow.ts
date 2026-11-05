import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import type { Hex, PublicClient, TransactionReceipt } from 'viem'
import { CHAIN_ID } from '@/lib/vault'
import { finishCall, patchCall, startCall, withTraceGroup } from '@/lib/callLog'
import { parseTxError } from '@/lib/decode'

export type FlowStatus = 'idle' | 'wallet' | 'confirming' | 'success' | 'error'

export interface FlowStep {
  label: string
  send: () => Promise<Hex>
}

interface FlowState {
  status: FlowStatus
  stepLabel?: string
  hash?: Hex
  error?: string
}

/** Sends each step in order and waits for its receipt. Returns the receipt of the last step. */
async function executeSteps(
  client: PublicClient,
  callId: number,
  steps: FlowStep[],
  setState: (next: FlowState) => void,
): Promise<TransactionReceipt | undefined> {
  const receipts: TransactionReceipt[] = []
  for (const step of steps) {
    setState({ status: 'wallet', stepLabel: step.label })
    patchCall(callId, (e) => ({ ...e, steps: [...e.steps, { label: step.label, status: 'wallet' }] }))
    const hash = await step.send()
    setState({ status: 'confirming', stepLabel: step.label, hash })
    patchCall(callId, (e) => ({
      ...e,
      steps: e.steps.map((s) => (s.label === step.label ? { ...s, hash, status: 'confirming' as const } : s)),
    }))
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`${step.label} reverted onchain`)
    receipts.push(receipt)
    patchCall(callId, (e) => ({
      ...e,
      steps: e.steps.map((s) => (s.label === step.label ? { ...s, status: 'success' as const } : s)),
    }))
  }
  return receipts[receipts.length - 1]
}

/**
 * Runs one or more wallet transactions in order, waits for each receipt, and tags
 * every RPC call made along the way with a named trace group.
 */
export function useTxFlow() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  const [state, setState] = useState<FlowState>({ status: 'idle' })

  const run = useCallback(
    async (label: string, steps: FlowStep[]): Promise<TransactionReceipt | undefined> => {
      if (!publicClient) return undefined
      const callId = startCall(label)
      try {
        const receipt = await withTraceGroup(label, async () => {
          if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
          return executeSteps(publicClient, callId, steps, setState)
        })
        setState((prev) => ({ status: 'success', hash: prev.hash }))
        finishCall(callId, 'success')
        await queryClient.invalidateQueries()
        return receipt
      } catch (error) {
        const message = parseTxError(error)
        const cancelled = message === 'Transaction cancelled.'
        setState(cancelled ? { status: 'idle' } : { status: 'error', error: message })
        patchCall(callId, (e) => ({
          ...e,
          steps: e.steps.map((s) => (s.status === 'success' ? s : { ...s, status: 'error' as const })),
        }))
        finishCall(callId, 'error', message)
        return undefined
      }
    },
    [chainId, publicClient, queryClient, switchChainAsync],
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { ...state, run, reset, busy: state.status === 'wallet' || state.status === 'confirming' }
}
