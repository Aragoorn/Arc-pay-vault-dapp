import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { CHAIN_ID, VAULT_ADDRESS, vaultAbi } from '@/lib/vault'

export interface PlanView {
  id: bigint
  payer: Address
  agentId: bigint
  interval: bigint
  nextExecutionAt: bigint
  executions: number
  maxExecutions: number
  spendCap: bigint
  spent: bigint
  active: boolean
  recipients: readonly Address[]
  amounts: readonly bigint[]
  perRun: bigint
  /** Result of the contract's own previewExecution for the connected wallet, if known. */
  check?: number
  isOperator?: boolean
}

const MAX_PLANS_SHOWN = 8

/** Payroll plans created by the connected wallet, with each plan's live rule check. */
export function usePlans() {
  const { address } = useAccount()

  const ids = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'getPlanIdsByPayer',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 6000 },
  })

  const planIds = [...(ids.data ?? [])].reverse().slice(0, MAX_PLANS_SHOWN)

  const details = useReadContracts({
    contracts: planIds.map((id) => ({
      address: VAULT_ADDRESS,
      abi: vaultAbi,
      functionName: 'getPlan' as const,
      args: [id] as const,
      chainId: CHAIN_ID,
    })),
    query: { enabled: planIds.length > 0, refetchInterval: 6000 },
  })

  const base = planIds.flatMap((id, i) => {
    const res = details.data?.[i]
    if (!res || res.status !== 'success') return []
    const [payer, agentId, interval, nextExecutionAt, executions, maxExecutions, spendCap, spent, active, recipients, amounts] =
      res.result
    const perRun = amounts.reduce((sum, a) => sum + a, 0n)
    const plan: PlanView = {
      id, payer, agentId, interval, nextExecutionAt, executions, maxExecutions, spendCap, spent, active, recipients, amounts, perRun,
    }
    return [plan]
  })

  const checks = useReadContracts({
    contracts: base.flatMap((p) => [
      {
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'previewExecution' as const,
        args: [p.id, p.agentId, address as Address] as const,
        chainId: CHAIN_ID,
      },
      {
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'isAgentOperator' as const,
        args: [p.agentId, address as Address] as const,
        chainId: CHAIN_ID,
      },
    ]),
    query: { enabled: !!address && base.length > 0, refetchInterval: 6000 },
  })

  const plans: PlanView[] = base.map((p, i) => {
    const preview = checks.data?.[i * 2]
    const operator = checks.data?.[i * 2 + 1]
    return {
      ...p,
      check: preview?.status === 'success' ? Number((preview.result as readonly [number, bigint])[0]) : undefined,
      isOperator: operator?.status === 'success' ? (operator.result as boolean) : undefined,
    }
  })

  return { plans, isLoading: ids.isLoading || details.isLoading, total: ids.data?.length ?? 0 }
}
