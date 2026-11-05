import { useCallback, useMemo, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { parseUsdc } from '@/onchain-money'

export interface RecipientRow {
  key: number
  address: string
  amount: string
}

let rowKey = 1
const blankRow = (address = '', amount = ''): RecipientRow => ({ key: rowKey++, address, amount })

export const MAX_RECIPIENTS = 100

/** Editable recipient list shared by the batch transfer and payroll forms. */
export function useRecipients() {
  const [rows, setRows] = useState<RecipientRow[]>(() => [blankRow(), blankRow()])

  const update = useCallback((key: number, patch: Partial<RecipientRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }, [])
  const remove = useCallback((key: number) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev)), [])
  const add = useCallback((address = '', amount = '') => {
    setRows((prev) => (prev.length >= MAX_RECIPIENTS ? prev : [...prev, blankRow(address, amount)]))
  }, [])
  const addTestWallets = useCallback((count: number, amount: string) => {
    // Fresh throwaway addresses. The private keys are discarded immediately and never stored.
    const fresh = Array.from({ length: count }, () => privateKeyToAccount(generatePrivateKey()).address)
    setRows((prev) => {
      const kept = prev.filter((r) => r.address.trim() !== '' || r.amount.trim() !== '')
      return [...kept, ...fresh.map((a) => blankRow(a, amount))].slice(0, MAX_RECIPIENTS)
    })
  }, [])
  const clear = useCallback(() => setRows([blankRow(), blankRow()]), [])

  const parsed = useMemo(() => {
    const addresses: Address[] = []
    const amounts: bigint[] = []
    const errors: string[] = []
    rows.forEach((row, i) => {
      const a = row.address.trim()
      const v = row.amount.trim()
      if (!a && !v) return
      if (!isAddress(a)) {
        errors.push(`Row ${i + 1}: invalid address`)
        return
      }
      try {
        const raw = parseUsdc(v)
        if (raw <= 0n) throw new Error('zero')
        addresses.push(a)
        amounts.push(raw)
      } catch {
        errors.push(`Row ${i + 1}: enter an amount above 0 (max 6 decimals)`)
      }
    })
    const total = amounts.reduce((s, x) => s + x, 0n)
    return { addresses, amounts, errors, total }
  }, [rows])

  return { rows, update, remove, add, addTestWallets, clear, ...parsed }
}

export type RecipientsState = ReturnType<typeof useRecipients>
