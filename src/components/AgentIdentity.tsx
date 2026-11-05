import { useWriteContract } from 'wagmi'
import { parseEventLogs, zeroAddress } from 'viem'
import { Bot, ShieldCheck, ShieldX } from 'lucide-react'
import { registryAbi, shortAddress } from '@/lib/vault'
import { useTxFlow } from '@/hooks/useTxFlow'
import type { AgentState } from '@/hooks/useAgent'
import { ActionButton, TxStatus } from './ui'

const REGISTRATION_FILE = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'ArcPay Payroll Agent',
  description: 'Triggers rule-checked payroll runs on the ArcPay Automated Vault.',
  services: [],
  x402Support: false,
  active: true,
}

export function AgentIdentity({ agent, registry }: { agent: AgentState; registry: `0x${string}` | undefined }) {
  const flow = useTxFlow()
  const { writeContractAsync } = useWriteContract()

  const register = async () => {
    if (!registry) return
    const uri = `data:application/json;base64,${btoa(JSON.stringify(REGISTRATION_FILE))}`
    const receipt = await flow.run('Register ERC-8004 agent', [
      { label: 'Register agent', send: () => writeContractAsync({ address: registry, abi: registryAbi, functionName: 'register', args: [uri] }) },
    ])
    if (!receipt) return
    const [registered] = parseEventLogs({ abi: registryAbi, eventName: 'Registered', logs: receipt.logs })
    if (registered) agent.setAgentIdText(registered.args.agentId.toString())
  }

  return (
    <div className="inner stack">
      <div className="row">
        <Bot size={16} aria-hidden style={{ color: 'var(--accent)' }} />
        <span className="label">Agent identity (ERC-8004)</span>
      </div>

      <div className="form-grid" style={{ alignItems: 'end' }}>
        <div className="field-group">
          <label htmlFor="agent-id" className="field-label">
            Agent ID
          </label>
          <input
            id="agent-id"
            className="input num"
            inputMode="numeric"
            placeholder="e.g. 123"
            value={agent.agentIdText}
            onChange={(e) => agent.setAgentIdText(e.target.value)}
          />
        </div>
        <ActionButton
          block
          variant="ghost"
          label="Register new agent"
          busy={flow.busy}
          busyLabel={flow.status === 'wallet' ? 'Confirm in wallet…' : 'Registering…'}
          disabled={!registry}
          onClick={() => void register()}
        />
      </div>

      {agent.agentId !== undefined && (
        <div className="stack-sm">
          {agent.isLoading ? (
            <span className="hint">Checking registry…</span>
          ) : agent.exists ? (
            <>
              <p className={`row hint ${agent.isOperator ? 'hint-ok' : 'hint-warn'}`} style={{ margin: 0 }}>
                {agent.isOperator ? <ShieldCheck size={14} aria-hidden /> : <ShieldX size={14} aria-hidden />}
                {agent.isOperator ? 'You operate this agent and can trigger payroll.' : 'You do not operate this agent. Only its owner or wallet can trigger payroll.'}
              </p>
              <p className="hint mono" style={{ margin: 0 }}>
                owner {agent.owner ? shortAddress(agent.owner) : '—'}
                {agent.wallet && agent.wallet !== zeroAddress ? ` · wallet ${shortAddress(agent.wallet)}` : ''}
              </p>
            </>
          ) : (
            <span className="hint hint-bad">Agent #{agent.agentIdText} is not registered.</span>
          )}
        </div>
      )}
      <TxStatus status={flow.status} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} />
    </div>
  )
}
