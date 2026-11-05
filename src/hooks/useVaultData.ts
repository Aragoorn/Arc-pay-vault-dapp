import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, zeroAddress, type Address } from 'viem'
import { arcPayVaultAbi } from '@/contracts/arcPayVaultAbi'
import { CHAIN_ID, USDC_ADDRESS, VAULT_ADDRESS, identityAbi } from '@/lib/vault'

const POLL_MS = 8000

/** Live reads straight from Arc Testnet. Refetched every few seconds and after every transaction. */
export function useVaultData(payerOverride?: Address) {
  const { address } = useAccount()
  const account = address ?? zeroAddress
  const payer = payerOverride ?? account
  const userQuery = { enabled: !!address, refetchInterval: POLL_MS }
  const publicQuery = { refetchInterval: POLL_MS }

  const walletUsdc = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
    chainId: CHAIN_ID,
    query: userQuery,
  })
  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, VAULT_ADDRESS],
    chainId: CHAIN_ID,
    query: userQuery,
  })
  const vaultBalance = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'vaultBalance',
    args: [account],
    chainId: CHAIN_ID,
    query: userQuery,
  })
  const totalDeposits = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'totalDeposits',
    chainId: CHAIN_ID,
    query: publicQuery,
  })
  const paused = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'paused',
    chainId: CHAIN_ID,
    query: publicQuery,
  })
  const registry = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'identityRegistry',
    chainId: CHAIN_ID,
  })
  const payroll = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'getPayroll',
    args: [payer],
    chainId: CHAIN_ID,
    query: { enabled: payer !== zeroAddress, refetchInterval: POLL_MS },
  })
  const verdict = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'checkPayroll',
    args: [payer],
    chainId: CHAIN_ID,
    query: { enabled: payer !== zeroAddress, refetchInterval: POLL_MS },
  })
  const payerVaultBalance = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'vaultBalance',
    args: [payer],
    chainId: CHAIN_ID,
    query: { enabled: payer !== zeroAddress, refetchInterval: POLL_MS },
  })

  return { walletUsdc, allowance, vaultBalance, totalDeposits, paused, registry, payroll, verdict, payerVaultBalance }
}

/** ERC-8004 identity facts for one agent id, plus whether `who` may run its payroll. */
export function useAgentIdentity(registry: Address | undefined, agentId: bigint | undefined, who: Address | undefined) {
  const enabled = !!registry && agentId !== undefined
  const owner = useReadContract({
    address: registry,
    abi: identityAbi,
    functionName: 'ownerOf',
    args: [agentId ?? 0n],
    chainId: CHAIN_ID,
    query: { enabled, retry: false, refetchInterval: POLL_MS },
  })
  const wallet = useReadContract({
    address: registry,
    abi: identityAbi,
    functionName: 'getAgentWallet',
    args: [agentId ?? 0n],
    chainId: CHAIN_ID,
    query: { enabled, retry: false, refetchInterval: POLL_MS },
  })
  const operator = useReadContract({
    address: VAULT_ADDRESS,
    abi: arcPayVaultAbi,
    functionName: 'isAgentOperator',
    args: [agentId ?? 0n, who ?? zeroAddress],
    chainId: CHAIN_ID,
    query: { enabled: enabled && !!who, refetchInterval: POLL_MS },
  })
  return { owner, wallet, operator, registered: !!owner.data }
}
