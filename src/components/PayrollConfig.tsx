import { useMemo, useRef, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { Bot, Plus, Trash2, Users } from 'lucide-react'
import { arcPayVaultAbi } from '@/contracts/arcPayVaultAbi'
import { useVaultData } from '@/hooks/useVaultData'
import { useVaultTx } from '@/hooks/useVaultTx'
import type { TestWallet } from '@/hooks/useTestWallets'
import { fixed, parseInput } from '@/lib/amount'
import { MAX_BATCH, VAULT_ADDRESS, identityAbi } from '@/lib/vault'
import { useTxLog } from '@/lib/txLog'

interface Row {
  key: number
  address: string
  amount: string
}

type Data = ReturnType<typeof useVaultData>

const INTERVALS = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
]

export function PayrollConfig({ data, wallets }: { data: Data; wallets: TestWallet[] }) {
  const send = useVaultTx()
  const records = useTxLog()
  const nextKey = useRef(2)
  const [rows, setRows] = useState<Row[]>([{ key: 1, address: '', amount: '' }])
  const [agentId, setAgentId] = useState('')
  const [interval, setIntervalSeconds] = useState(60)
  const [cap, setCap] = useState('')

  const parsed = useMemo(
    () => rows.map((r) => ({ address: isAddress(r.address) ? (r.address) : undefined, amount: parseInput(r.amount) })),
    [rows],
  )
  const complete = parsed.every((p) => p.address && p.amount && p.amount > 0n)
  const total = parsed.reduce((sum, p) => sum + (p.amount ?? 0n), 0n)
  const capRaw = cap ? parseInput(cap) : total
  const idValid = /^\d+$/.test(agentId)
  const busy = records[0] !== undefined && ['preparing', 'signing', 'confirming'].includes(records[0].status)
  const active = data.payroll.data?.active === true
  const ready = complete && idValid && capRaw !== undefined && capRaw >= total && total > 0n && data.paused.data !== true

  const update = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const register = async () => {
    const registry = data.registry.data
    if (!registry) return
    const card = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'ArcPay Payroll Agent',
      description: 'Runs scheduled payroll for the ArcPay Automated Vault.',
      services: [],
      x402Support: false,
      active: true,
    }
    const uri = `data:application/json;base64,${btoa(JSON.stringify(card))}`
    const result = await send({ label: 'Register ERC-8004 agent', to: registry, abi: identityAbi, functionName: 'register', args: [uri] })
    const id = result.events.find((e) => e.eventName === 'Registered')?.args.find((a) => a.name === 'agentId')?.value
    if (id) setAgentId(id)
  }

  const save = () => {
    if (!ready || capRaw === undefined) return
    void send({
      label: 'Configure payroll',
      to: VAULT_ADDRESS,
      abi: arcPayVaultAbi,
      functionName: 'setPayroll',
      args: [parsed.map((p) => p.address as Address), parsed.map((p) => p.amount as bigint), BigInt(interval), capRaw, BigInt(agentId)],
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="eyebrow" htmlFor="agent-id">ERC-8004 agent ID</label>
        <div className="mt-1.5 flex gap-2">
          <input id="agent-id" className="field tabular-nums" inputMode="numeric" placeholder="Agent ID" value={agentId} onChange={(e) => /^\d*$/.test(e.target.value) && setAgentId(e.target.value)} />
          <button className="btn-ghost inline-flex shrink-0 items-center gap-1.5" disabled={busy || !data.registry.data} onClick={() => void register()}>
            <Bot className="size-3.5" /> Register new
          </button>
        </div>
        <p className="mt-1.5 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          The wallet that owns this agent in the identity registry is the only one that can trigger payroll.
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="eyebrow">Recipients</span>
          <button
            className="btn-ghost inline-flex items-center gap-1.5"
            disabled={wallets.length === 0}
            onClick={() => setRows(wallets.slice(0, MAX_BATCH).map((w) => ({ key: nextKey.current++, address: w.address, amount: rows[0]?.amount || '1' })))}
          >
            <Users className="size-3.5" /> Use test wallets
          </button>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.key} className="grid grid-cols-[1fr_96px_auto] items-center gap-2">
              <input className="field mono !text-xs" aria-label={`Payroll recipient ${i + 1}`} placeholder="0x recipient address" value={row.address} onChange={(e) => update(row.key, { address: e.target.value.trim() })} />
              <input className="field tabular-nums" inputMode="decimal" aria-label={`Payroll amount ${i + 1}`} placeholder="0.00" value={row.amount} onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && update(row.key, { amount: e.target.value })} />
              <button className="btn-ghost !px-2" aria-label={`Remove payroll recipient ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((p) => p.filter((r) => r.key !== row.key))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <button className="btn-ghost mt-2 inline-flex items-center gap-1.5" disabled={rows.length >= MAX_BATCH} onClick={() => setRows((p) => [...p, { key: nextKey.current++, address: '', amount: '' }])}>
          <Plus className="size-3.5" /> Add recipient
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className="eyebrow">Run every</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {INTERVALS.map((o) => (
              <button
                key={o.seconds}
                aria-pressed={interval === o.seconds}
                onClick={() => setIntervalSeconds(o.seconds)}
                className="min-h-9 rounded-lg px-3 text-xs font-semibold"
                style={{ background: interval === o.seconds ? 'var(--accent)' : 'rgba(255,255,255,0.06)', color: interval === o.seconds ? '#0d1b2f' : 'var(--muted)' }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="eyebrow" htmlFor="cap">Cap per run (USDC)</label>
          <input id="cap" className="field mt-1.5 tabular-nums" inputMode="decimal" placeholder={fixed(total)} value={cap} onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setCap(e.target.value)} />
        </div>
      </div>

      {capRaw !== undefined && capRaw < total && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>The cap must cover the run total of {fixed(total)} USDC.</p>
      )}

      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={!ready || busy} onClick={save}>
          {active ? 'Replace payroll' : 'Save payroll'} · {fixed(total)} USDC per run
        </button>
        {active && (
          <button className="btn-ghost" disabled={busy} onClick={() => void send({ label: 'Cancel payroll', to: VAULT_ADDRESS, abi: arcPayVaultAbi, functionName: 'cancelPayroll', args: [] })}>
            Cancel payroll
          </button>
        )}
      </div>
    </div>
  )
}
