import type { Hex } from 'viem'
import { createStore } from './store'

export interface CallStep {
  label: string
  hash?: Hex
  status: 'wallet' | 'confirming' | 'success' | 'error'
}

export interface CallEntry {
  id: number
  startedAt: number
  label: string
  status: 'pending' | 'success' | 'error'
  steps: CallStep[]
  error?: string
  durationMs?: number
}

export const callLog = createStore<CallEntry[]>([])

let nextId = 1

export function startCall(label: string): number {
  const id = nextId++
  callLog.set((prev) => [{ id, startedAt: Date.now(), label, status: 'pending' as const, steps: [] }, ...prev].slice(0, 60))
  return id
}

export function patchCall(id: number, patch: (entry: CallEntry) => CallEntry): void {
  callLog.set((prev) => prev.map((e) => (e.id === id ? patch(e) : e)))
}

export function finishCall(id: number, status: 'success' | 'error', error?: string): void {
  patchCall(id, (e) => ({ ...e, status, error, durationMs: Date.now() - e.startedAt }))
}

interface StudioTraceApi {
  startGroup: (label: string) => string
  endGroup: () => void
}

/** Groups every RPC call made while `fn` runs under one labelled section in the Tracing panel. */
export async function withTraceGroup<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const api = (window as unknown as { __studioTrace?: StudioTraceApi }).__studioTrace
  api?.startGroup(label)
  try {
    return await fn()
  } finally {
    api?.endGroup()
  }
}
