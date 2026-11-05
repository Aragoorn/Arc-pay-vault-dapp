import { useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { isAddress, zeroAddress } from 'viem'
import { Bot, Check, Loader2, X } from 'lucide-react'
import { arcPayVaultAbi } from '@/contracts/arcPayVaultAbi'
import { useAgentIdentity, useVaultData } from '@/hooks/useVaultData'
import { useVaultTx } from '@/hooks/useVaultTx'
import { fixed } from '@/lib/amount'
import { VAULT_ADDRESS, formatDuration, shortAddress } from '@/lib/vault'
import { useTxLog } from '@/lib/txLog'

interface Rule {
  label: string
  ok: boolean
  detail?: string
}

export function AgentStatus() {
  const { address } = useAccount()
  const send = useVaultTx()
  const records = useTxLog()
  const [payerInput, setPayerInput] = useState('')
  const payer = isAddress(payerInput) ? (payerInput) : address
  const data = useVaultData(payer)
  const payroll = data.payroll.data
  const agentId = payroll?.active || (payroll && payroll.agentId > 0n) ? payroll.agentId : undefined
  const identity = useAgentIdentity(data.registry.data, agentId, address)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [auto, setAuto] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const total = payroll ? payroll.amounts.reduce((sum, a) => sum + a, 0n) : 0n
  const dueIn = payroll ? Number(payroll.nextExecutionAt) - now : 0
  const balance = data.payerVaultBalance.data ?? 0n
  const verdict = data.verdict.data
  const busy = records[0] !== undefined && ['preparing', 'signing', 'confirming'].includes(records[0].status)

  const rules: Rule[] = payroll
    ? [
        { label: 'Payroll is active', ok: payroll.active },
        { label: agentId !== undefined ? `Agent #${agentId.toString()} is registered in ERC-8004` : 'Agent is registered in ERC-8004', ok: identity.registered },
        { label: 'Run is due', ok: dueIn <= 0, detail: dueIn > 0 ? `in ${formatDuration(dueIn)}` : undefined },
        { label: 'Within the per-run cap', ok: total <= payroll.maxPerRun, detail: `${fixed(total)} of ${fixed(payroll.maxPerRun)} USDC` },
        { label: 'Vault balance covers the run', ok: balance >= total, detail: `${fixed(balance)} USDC held` },
        { label: 'Vault is not paused', ok: data.paused.data !== true },
        { label: 'Connected wallet is the agent', ok: identity.operator.data === true, detail: identity.owner.data ? `owner ${shortAddress(identity.owner.data)}` : undefined },
      ]
    : []

  const contractOk = verdict?.[0] === true
  const canRun = !!payer && payroll?.active === true && contractOk && identity.operator.data === true

  const run = async () => {
    if (!payer || inFlight.current) return false
    inFlight.current = true
    try {
      const result = await send({ label: 'Agent: execute payroll', to: VAULT_ADDRESS, abi: arcPayVaultAbi, functionName: 'executePayroll', args: [payer] })
      return result.ok
    } finally {
      inFlight.current = false
    }
  }

  // Auto mode: act as the agent while this tab is open, one run per due window.
  useEffect(() => {
    if (!auto || !canRun || busy || inFlight.current) return
    void run().then((ok) => {
      if (!ok) setAuto(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, canRun, busy, payroll?.nextExecutionAt])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-strong)' }}>
            <Bot className="size-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="text-sm font-semibold">{agentId !== undefined ? `Agent #${agentId.toString()}` : 'No agent assigned'}</div>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>
              {identity.wallet.data && identity.wallet.data !== zeroAddress ? `Wallet ${shortAddress(identity.wallet.data)}` : 'ERC-8004 identity checked onchain'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="eyebrow">Contract verdict</div>
          <div className="mono text-sm font-semibold" style={{ color: contractOk ? 'var(--success)' : 'var(--warn)' }}>
            {verdict ? verdict[1] : '…'}
          </div>
        </div>
      </div>

      <div>
        <label className="eyebrow" htmlFor="payer">Payroll owner</label>
        <input id="payer" className="field mono mt-1.5 !text-xs" placeholder={address ?? 'Connect a wallet or paste a payer address'} value={payerInput} onChange={(e) => setPayerInput(e.target.value.trim())} />
      </div>

      {!payroll || (!payroll.active && payroll.recipients.length === 0) ? (
        <p className="glass-inner p-3 text-sm text-pretty" style={{ color: 'var(--subtle)' }}>
          No payroll found for this wallet. Configure one below, then the registered agent can run it.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5" aria-label="Execution rules">
            {rules.map((rule) => (
              <li key={rule.label} className="glass-inner flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full" style={{ background: rule.ok ? 'rgba(141,216,159,0.16)' : 'rgba(232,109,122,0.16)' }}>
                  {rule.ok ? <Check className="size-3" style={{ color: 'var(--success)' }} /> : <X className="size-3" style={{ color: 'var(--danger)' }} />}
                </span>
                <span className="flex-1 text-sm">{rule.label}</span>
                {rule.detail && <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>{rule.detail}</span>}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
            <span className="tabular-nums">{payroll.runs} run{payroll.runs === 1 ? '' : 's'} so far · every {formatDuration(Number(payroll.interval))}</span>
            <span className="tabular-nums">{payroll.recipients.length} recipients · {fixed(total)} USDC</span>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary flex-1" disabled={!canRun || busy} onClick={() => void run()}>
          {busy ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Working…</span> : canRun ? 'Run agent now' : 'Rules not met yet'}
        </button>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-[#acc6e9]" />
          Auto-run while this tab is open
        </label>
      </div>
    </div>
  )
}
