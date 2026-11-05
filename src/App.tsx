import '@/styles/app.css'
import { Header } from '@/components/Header'
import { BalanceHero } from '@/components/BalanceHero'
import { MoneyForm } from '@/components/MoneyForm'
import { BatchTransfer } from '@/components/BatchTransfer'
import { PayrollPlanner } from '@/components/PayrollPlanner'
import { AgentPanel } from '@/components/AgentPanel'
import { TracePanel } from '@/components/TracePanel'
import { useVaultState } from '@/hooks/useVaultState'
import { useAgent } from '@/hooks/useAgent'

export default function App() {
  const state = useVaultState()
  const agent = useAgent(state.registry)

  return (
    <div className="app-shell">
      <div className="container-app">
        <Header />
        <main className="page">
          <BalanceHero state={state} />
          <div className="grid-2">
            <MoneyForm state={state} />
            <AgentPanel agent={agent} state={state} />
          </div>
          <div className="grid-2">
            <PayrollPlanner agent={agent} state={state} />
            <BatchTransfer state={state} />
          </div>
          <TracePanel />
        </main>
      </div>
    </div>
  )
}
