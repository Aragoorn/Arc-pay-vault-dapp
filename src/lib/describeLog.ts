import { formatUsdc } from '@/onchain-money'
import { shortAddress } from '@/lib/vault'
import type { VaultLog } from '@/hooks/useVaultEvents'

export type Tone = 'ok' | 'warn' | 'bad' | 'info'

export interface LogLine {
  title: string
  detail: string
  tone: Tone
  agent: boolean
}

const text = (v: unknown) =>
  typeof v === 'string' ? shortAddress(v) : typeof v === 'number' || typeof v === 'bigint' ? v.toString() : '?'
const usdc = (v: unknown) => (typeof v === 'bigint' ? `${formatUsdc(v)} USDC` : '?')

export function describeLog(log: VaultLog): LogLine {
  const a = log.args
  switch (log.eventName) {
    case 'Deposited':
      return { title: 'Deposit', detail: `${text(a.account)} added ${usdc(a.amount)}`, tone: 'ok', agent: false }
    case 'Withdrawn':
      return { title: 'Withdrawal', detail: `${text(a.account)} took out ${usdc(a.amount)}`, tone: 'info', agent: false }
    case 'BatchPaid':
      return { title: `Batch #${String(a.batchId)}`, detail: `${text(a.payer)} paid ${String(a.recipientCount)} recipients, ${usdc(a.total)}`, tone: 'ok', agent: false }
    case 'Paid':
      return { title: 'Batch payment', detail: `${usdc(a.amount)} to ${text(a.recipient)}`, tone: 'info', agent: false }
    case 'PaymentFailed':
      return { title: 'Payment returned', detail: `${usdc(a.amount)} to ${text(a.recipient)} failed and went back to ${text(a.payer)}`, tone: 'bad', agent: true }
    case 'PayrollConfigured':
      return { title: 'Payroll configured', detail: `${text(a.payer)} set ${String(a.recipientCount)} recipients for agent #${String(a.agentId)}, ${usdc(a.total)} per run`, tone: 'info', agent: true }
    case 'PayrollCancelled':
      return { title: 'Payroll cancelled', detail: `${text(a.payer)} stopped their payroll`, tone: 'warn', agent: true }
    case 'PayrollExecuted':
      return { title: `Agent #${String(a.agentId)} ran payroll (run ${String(a.runId)})`, detail: `${text(a.executor)} released ${usdc(a.total)} to ${String(a.recipientCount)} recipients for ${text(a.payer)}`, tone: 'ok', agent: true }
    case 'PayrollPaid':
      return { title: 'Payroll payment', detail: `${usdc(a.amount)} to ${text(a.recipient)} (run ${String(a.runId)})`, tone: 'info', agent: true }
    case 'Paused':
    case 'Unpaused':
      return { title: log.eventName, detail: `by ${text(a.account)}`, tone: 'warn', agent: false }
    default:
      return { title: log.eventName, detail: '', tone: 'info', agent: false }
  }
}
