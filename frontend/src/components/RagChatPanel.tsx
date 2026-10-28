import { useEffect, useRef, useState } from 'react'
import { sendRagQuery, type RagSource } from '../api/rag'
import styles from './RagChatPanel.module.css'

interface Message {
  role:    'user' | 'assistant'
  text:    string
  route?:  string
  sources?: RagSource[]
}

const ROUTE_LABEL: Record<string, string> = {
  policy_lookup: 'Policy',
  historical_lookup: 'History',
  live_decision_explanation: 'Live decision',
}

const SUGGESTIONS = [
  'Why was this order flagged NO-GO?',
  "What's our policy on severe weather overrides?",
  'Have we had similar NO-GO overrides before?',
]

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return <div className={styles.userBubble}>{msg.text}</div>
  }
  return (
    <div className={styles.assistantBubble}>
      {msg.route && <span className={styles.routeTag}>{ROUTE_LABEL[msg.route] ?? msg.route}</span>}
      <p className={styles.assistantText}>{msg.text}</p>
      {msg.sources && msg.sources.length > 0 && (
        <div className={styles.sources}>
          <p className={styles.sourcesLabel}>Sources</p>
          <ul>
            {msg.sources.map((s, i) => (
              <li key={i} title={s.description}>{s.citation}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function RagChatPanel({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setMessages(m => [...m, { role: 'user', text: q }])
    setInput('')
    setLoading(true)
    try {
      const res = await sendRagQuery(accessToken, q)
      setMessages(m => [...m, { role: 'assistant', text: res.answer, route: res.route, sources: res.sources }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Something went wrong reaching the assistant. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        className={styles.launcher}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" /></svg>
        )}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.panelTitle}>Ops Assistant</p>
            <p className={styles.panelSub}>Grounded in SOPs, decision logs &amp; live SHAP data</p>
          </div>

          <div className={styles.thread} ref={scrollRef}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                <p className={styles.emptyText}>Ask about GO/NO-GO policy, past decisions, or why an order was flagged.</p>
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} className={styles.suggestionChip} onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
            {loading && (
              <div className={styles.assistantBubble}>
                <span className={styles.thinking}><span /><span /><span /></span>
              </div>
            )}
          </div>

          <form
            className={styles.inputRow}
            onSubmit={e => { e.preventDefault(); ask(input) }}
          >
            <input
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={loading}
            />
            <button type="submit" className={styles.sendBtn} disabled={loading || !input.trim()} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}
