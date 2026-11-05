import { parseAmount, formatAmount, Amount, usdcDecimalsFor } from '@/onchain-money'
import { CHAIN_ID } from '@/lib/vault'

/** Parses user input into USDC base units, or undefined when it is empty or malformed. */
export function parseInput(value: string): bigint | undefined {
  if (!value || value === '.') return undefined
  try {
    return parseAmount(CHAIN_ID, value).raw
  } catch {
    return undefined
  }
}

/** Formats base units with a fixed number of fraction digits (USDC ERC-20 view). */
export function fixed(raw: bigint | undefined, digits = 2): string {
  if (raw === undefined) return '0.00'
  return Amount.fromRaw(raw, usdcDecimalsFor(CHAIN_ID)).toFixed(digits)
}

/** Full-precision string, used to fill an input from a balance. */
export function exact(raw: bigint): string {
  return formatAmount(CHAIN_ID, Amount.fromRaw(raw, usdcDecimalsFor(CHAIN_ID)))
}
