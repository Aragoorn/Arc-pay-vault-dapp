import { useSyncExternalStore } from 'react'
import type { Hex } from 'viem'

export type TxStatus = 'preparing' | 'signing' | 'confirming' | 'success' | 'reverted' | 'failed' | 'cancelled'

export interface DecodedCall {
  functionName: string
  args: { name: string; value: string }[]
  selector: Hex
  calldata: Hex
}

export interface DecodedEvent {
  contract: string
  eventName: string
  args: { name: string; value: string }[]
}

export interface TxRecord {
  id: number
  label: string
  startedAt: number
  status: TxStatus
  call: DecodedCall
  hash?: Hex
  blockNumber?: bigint
  gasUsed?: bigint
  events: DecodedEvent[]
  message?: string
}

let records: TxRecord[] = []
let counter = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export function startTx(label: string, call: DecodedCall): number {
  counter += 1
  records = [{ id: counter, label, startedAt: Date.now(), status: 'preparing' as const, call, events: [] }, ...records].slice(0, 25)
  emit()
  return counter
}

export function updateTx(id: number, patch: Partial<Omit<TxRecord, 'id'>>) {
  records = records.map((record) => (record.id === id ? { ...record, ...patch } : record))
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTxLog(): readonly TxRecord[] {
  return useSyncExternalStore(subscribe, () => records)
}
