import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Hex } from 'viem'
import { Binary } from 'lucide-react'
import { CHAIN_ID } from '@/lib/vault'
import { decodeCall, decodeLogs, type DecodedArg } from '@/lib/decode'

function ArgList({ args }: { args: DecodedArg[] }) {
  if (args.length === 0) return null
  return (
    <dl className="arg-grid" style={{ marginBottom: 0 }}>
      {args.map((a) => (
        <div key={a.name} className="contents">
          <dt className="arg-name">
            {a.name} <span style={{ opacity: 0.6 }}>{a.type}</span>
          </dt>
          <dd className="arg-val" style={{ margin: 0 }}>
            {a.text}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function CallBlock({ data, heading }: { data: Hex; heading: string }) {
  const decoded = decodeCall(data)
  return (
    <div className="decode-block">
      <div className="row-between">
        <span className="label">{heading}</span>
        <span className="hint mono">selector {data.slice(0, 10)}</span>
      </div>
      {decoded ? (
        <>
          <p className="decode-name" style={{ marginBottom: 0 }}>
            {decoded.source}.{decoded.name}()
          </p>
          <ArgList args={decoded.args} />
        </>
      ) : (
        <p className="hint mono" style={{ margin: '0.5rem 0 0' }}>
          Unknown call
        </p>
      )}
    </div>
  )
}

function DecodeHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="row">
      <Binary size={14} aria-hidden style={{ color: 'var(--subtle)' }} />
      <span className="label">{children}</span>
    </div>
  )
}

/** Decodes calldata before it is signed. */
export function CallPreview({ calls }: { calls: { heading: string; data: Hex }[] }) {
  if (calls.length === 0) return null
  return (
    <div className="stack-sm">
      <DecodeHeading>Decoded before you sign</DecodeHeading>
      {calls.map((c) => (
        <CallBlock key={c.heading} data={c.data} heading={c.heading} />
      ))}
    </div>
  )
}

/** Decodes a mined transaction: input, status, gas and every emitted event. */
export function TxReceiptDecoder({ hash }: { hash?: Hex }) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { data, isLoading } = useQuery({
    queryKey: ['tx-decode', hash],
    enabled: !!hash && !!client,
    retry: 3,
    queryFn: async () => {
      if (!client || !hash) throw new Error('missing')
      const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
      return { tx, receipt }
    },
  })

  if (!hash) return null
  if (isLoading || !data) return <p className="hint">Decoding transaction…</p>

  const events = decodeLogs(data.receipt.logs)
  return (
    <div className="stack-sm">
      <div className="row">
        <Binary size={14} aria-hidden style={{ color: 'var(--subtle)' }} />
        <span className="label">Decoded receipt</span>
        <span className={`pill ${data.receipt.status === 'success' ? 'pill-ok' : 'pill-bad'}`}>{data.receipt.status}</span>
        <span className="hint mono num">
          block {data.receipt.blockNumber.toString()} · gas {data.receipt.gasUsed.toString()}
        </span>
      </div>
      <CallBlock data={data.tx.input} heading="Call" />
      {events.map((e) => (
        <div key={e.logIndex} className="decode-block">
          <p className="decode-name" style={{ margin: 0, color: 'var(--success)' }}>
            {e.source}.{e.name}
          </p>
          <ArgList args={e.args} />
        </div>
      ))}
      {events.length === 0 && <p className="hint">No known events in this receipt.</p>}
    </div>
  )
}
