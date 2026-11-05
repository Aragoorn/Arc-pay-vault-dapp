import { erc20Abi, parseAbi, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'

export { vaultAbi } from '@/contracts/vaultAbi'

export const CHAIN_ID = arcTestnet.id

export const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS as Address
const deployBlockEnv = import.meta.env.VITE_VAULT_DEPLOY_BLOCK as string | undefined
export const VAULT_DEPLOY_BLOCK = BigInt(deployBlockEnv ?? '0')

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')
export const USDC_ADDRESS = usdcFact.address as Address

/** ERC-8004 identity registry surface used by the agent panel. */
export const registryAbi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function ownerOf(uint256 agentId) view returns (address)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
])

export { erc20Abi }

/** Order matches the contract's Check enum. */
export const CHECK_LABELS = [
  'Ready',
  'Vault paused',
  'Plan inactive',
  'Wrong agent ID',
  'Caller is not the agent',
  'Not due yet',
  'Max runs reached',
  'Spend cap exceeded',
  'Insufficient vault balance',
] as const

export const INTERVAL_OPTIONS = [
  { label: '1 minute', seconds: 60 },
  { label: '5 minutes', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
] as const

export function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`
}
