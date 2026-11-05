import { decodeFunctionData, parseEventLogs, type Abi, type AbiParameter, type Hex, type Log } from 'viem'
import { formatUsdc } from '@/onchain-money'
import { erc20Abi, registryAbi, vaultAbi, shortAddress } from './vault'

const KNOWN_ABIS: { source: string; abi: Abi }[] = [
  { source: 'ArcPayVault', abi: vaultAbi },
  { source: 'USDC', abi: erc20Abi },
  { source: 'ERC-8004 Registry', abi: registryAbi },
]

/** Argument names that carry USDC amounts (6-decimal ERC-20 view). */
const USDC_NAMES = new Set([
  'amount',
  'amounts',
  'value',
  'total',
  'newBalance',
  'paidTotal',
  'failedTotal',
  'totalPerRun',
  'spendCap',
  'spent',
])

export interface DecodedArg {
  name: string
  type: string
  text: string
}

export interface DecodedCall {
  source: string
  name: string
  args: DecodedArg[]
}

export interface DecodedEvent {
  source: string
  name: string
  args: DecodedArg[]
  logIndex: number
}

function formatValue(name: string, type: string, value: unknown): string {
  if (typeof value === 'bigint') return USDC_NAMES.has(name) ? `${formatUsdc(value)} USDC` : value.toString()
  if (Array.isArray(value)) return `[${value.map((v) => formatValue(name, type.replace('[]', ''), v)).join(', ')}]`
  if (typeof value === 'string' && type === 'address') return shortAddress(value)
  return String(value)
}

function toArgs(inputs: readonly AbiParameter[], values: unknown): DecodedArg[] {
  const list = Array.isArray(values) ? (values as unknown[]) : []
  const record = !Array.isArray(values) && values && typeof values === 'object' ? (values as Record<string, unknown>) : {}
  return inputs.map((input, i) => {
    const raw = list.length ? list[i] : record[input.name ?? '']
    const name = input.name ?? `arg${i}`
    return { name, type: input.type, text: formatValue(name, input.type, raw) }
  })
}

export function decodeCall(data: Hex): DecodedCall | null {
  for (const { source, abi } of KNOWN_ABIS) {
    try {
      const { functionName, args } = decodeFunctionData({ abi, data })
      const item = abi.find((i) => i.type === 'function' && i.name === functionName)
      if (item && item.type === 'function') {
        return { source, name: functionName, args: toArgs(item.inputs, args ?? []) }
      }
    } catch {
      /* try the next ABI */
    }
  }
  return null
}

export function decodeLogs(logs: readonly Log[]): DecodedEvent[] {
  const out: DecodedEvent[] = []
  for (const log of logs) {
    for (const { source, abi } of KNOWN_ABIS) {
      try {
        const [parsed] = parseEventLogs({ abi, logs: [log] })
        if (!parsed) continue
        const item = abi.find((i) => i.type === 'event' && i.name === parsed.eventName)
        if (item && item.type === 'event') {
          out.push({
            source,
            name: parsed.eventName,
            args: toArgs(item.inputs, parsed.args),
            logIndex: log.logIndex ?? out.length,
          })
          break
        }
      } catch {
        /* try the next ABI */
      }
    }
  }
  return out
}

/** Friendly message for wallet and RPC errors. */
export function parseTxError(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; name?: string }
  const message = (e?.shortMessage ?? e?.message ?? '').toLowerCase()
  if (e?.code === 4001 || message.includes('user rejected') || message.includes('user denied')) return 'Transaction cancelled.'
  if (message.includes('insufficientbalance') || message.includes('exceeds balance') || message.includes('insufficient funds')) {
    return 'Insufficient balance for this action.'
  }
  const rule = /ruleviolated.*?\(?(\w+)\)?/i.exec(e?.shortMessage ?? '')
  if (message.includes('ruleviolated') && rule) return 'The vault rules blocked this execution.'
  if (message.includes('reverted')) return e?.shortMessage ?? 'Transaction reverted.'
  if (message.includes('network') || message.includes('timeout')) return 'Network issue. Check your connection and retry.'
  return e?.shortMessage ?? 'Something went wrong. Please try again.'
}
