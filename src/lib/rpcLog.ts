/**
 * In-app JSON-RPC log. Wraps fetch (after tracing.ts has patched it) and records every
 * JSON-RPC call to the Arc Testnet endpoint: method, params, result or error, and latency.
 */
import { arcTestnet } from 'viem/chains'
import { createStore } from './store'

export interface RpcEntry {
  id: number
  at: number
  method: string
  params: string
  ok: boolean
  summary: string
  ms: number
}

export const rpcLog = createStore<RpcEntry[]>([])

const rpcHost = new URL(arcTestnet.rpcUrls.default.http[0]).host
let counter = 0

function clip(value: unknown, max = 140): string {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length > max ? `${text.slice(0, max)}…` : text
}

interface RpcRequest {
  id?: number | string
  method?: string
  params?: unknown
}
interface RpcResponse {
  id?: number | string
  result?: unknown
  error?: { message?: string }
}

function record(requests: RpcRequest[], responses: RpcResponse[], ms: number): void {
  const entries: RpcEntry[] = requests.map((req) => {
    const res = responses.find((r) => r.id === req.id)
    const ok = !!res && !res.error
    return {
      id: ++counter,
      at: Date.now(),
      method: req.method ?? 'unknown',
      params: clip(req.params),
      ok,
      summary: res?.error ? (res.error.message ?? 'error') : clip(res?.result ?? 'no response'),
      ms,
    }
  })
  rpcLog.set((prev) => [...entries.reverse(), ...prev].slice(0, 200))
}

const originalFetch = globalThis.fetch.bind(globalThis)

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let host = ''
  try {
    host = new URL(url, window.location.href).host
  } catch {
    /* ignore malformed URLs */
  }
  const body = init?.body
  if (host !== rpcHost || typeof body !== 'string') return originalFetch(input, init)

  const started = performance.now()
  const response = await originalFetch(input, init)
  try {
    const parsedReq: unknown = JSON.parse(body)
    const clone = response.clone()
    void clone
      .json()
      .then((parsedRes: unknown) => {
        const reqs = (Array.isArray(parsedReq) ? parsedReq : [parsedReq]) as RpcRequest[]
        const ress = (Array.isArray(parsedRes) ? parsedRes : [parsedRes]) as RpcResponse[]
        record(reqs, ress, Math.round(performance.now() - started))
      })
      .catch(() => undefined)
  } catch {
    /* non-JSON body, skip logging */
  }
  return response
})
