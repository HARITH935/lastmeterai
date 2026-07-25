import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { sendChatMessage, type ChatMessageResponse } from '../api/chat'
import styles from './Chat.module.css'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: number
  role: 'user' | 'assistant' | 'error'
  text: string
  intent?: string
  intentConfidence?: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<string, string> = {
  order_status:        'Order Status',
  earnings_query:      'Earnings',
  area_risk:           'Area Risk',
  reassign_suggestion: 'Reassignment',
  weather_query:       'Weather',
  agent_performance:   'Agent Performance',
  postpone_query:      'Postpone Query',
  general:             'General',
}

const AGENT_SUGGESTIONS = [
  'How much will I earn today?',
  'Which orders should I deliver first?',
  'Which orders should be postponed?',
]

const MANAGER_SUGGESTIONS = [
  'Which area has the most failures?',
  'Suggest reassignments for today',
  'How are my agents performing this week?',
]

// ── Icons ──────────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// ── Intent badge ───────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.40

function IntentBadge({ intent, confidence }: { intent: string; confidence?: number }) {
  const label     = INTENT_LABELS[intent] ?? intent
  const isGeneral = intent === 'general'
  const isLow     = confidence !== undefined && confidence < CONFIDENCE_THRESHOLD

  return (
    <div className={styles.badgeRow}>
      <span className={`${styles.badge} ${isGeneral ? '' : styles.badgeIntent}`}>{label}</span>
      {confidence !== undefined && confidence > 0 && (
        <span className={`${styles.badge} ${isLow ? styles.badgeLow : ''}`}>
          {isLow ? `Low confidence · ${Math.round(confidence * 100)}%` : `${Math.round(confidence * 100)}%`}
        </span>
      )}
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMsg }) {
  if (msg.role === 'user') {
    return (
      <div className={`${styles.row} ${styles.rowEnd}`}>
        <div className={styles.bubbleUser}>{msg.text}</div>
      </div>
    )
  }

  if (msg.role === 'error') {
    return (
      <div className={`${styles.row} ${styles.rowStart}`}>
        <div className={styles.bubbleError}>
          <p>{msg.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.row} ${styles.rowStart}`}>
      <div className={styles.bubbleAssistantWrap}>
        <div className={styles.bubbleAssistant}>
          <p>{msg.text}</p>
        </div>
        {msg.intent && <IntentBadge intent={msg.intent} confidence={msg.intentConfidence} />}
      </div>
    </div>
  )
}

// ── Typing indicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className={`${styles.row} ${styles.rowStart}`}>
      <div className={styles.typing}>
        <div className={styles.typingDots}>
          {[0, 1, 2].map(i => (
            <span key={i} className={styles.typingDot} style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({
  isManager,
  onSuggest,
}: {
  isManager: boolean
  onSuggest: (text: string) => void
}) {
  const suggestions = isManager ? MANAGER_SUGGESTIONS : AGENT_SUGGESTIONS

  return (
    <div className={styles.empty}>
      <div className={styles.emptyAtmosphere} />
      <div className={styles.emptyMark}>AI</div>
      <h2 className={styles.emptyTitle}>LastMeter Assistant</h2>
      <p className={styles.emptySub}>
        {isManager
          ? 'Ask about area performance, agent assignments, failures, or weather impact.'
          : 'Ask about your deliveries, earnings, or what to prioritise today.'}
      </p>
      <div className={styles.suggestions}>
        {suggestions.map(s => (
          <button key={s} onClick={() => onSuggest(s)} className={styles.suggestion}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Chat() {
  const { user, access_token } = useAuth()
  const isManager = user?.role === 'manager'

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [input, setInput] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const msgIdRef  = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || pending) return

    setInput('')
    setMessages(prev => [
      ...prev,
      { id: ++msgIdRef.current, role: 'user', text: trimmed },
    ])
    setPending(true)

    try {
      const res: ChatMessageResponse = await sendChatMessage(
        access_token!,
        trimmed,
        sessionId,
      )
      if (!sessionId) setSessionId(res.session_id)
      setMessages(prev => [
        ...prev,
        {
          id:               ++msgIdRef.current,
          role:             'assistant',
          text:             res.reply,
          intent:           res.intent,
          intentConfidence: res.intent_confidence,
        },
      ])
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : "Couldn't reach the assistant. Try again."
      setMessages(prev => [
        ...prev,
        { id: ++msgIdRef.current, role: 'error', text: msg },
      ])
    } finally {
      setPending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />

      <div className={styles.list}>
        <div className={styles.listInner}>
          {messages.length === 0 && !pending ? (
            <EmptyState isManager={isManager} onSuggest={text => void send(text)} />
          ) : (
            <>
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {pending && <TypingIndicator />}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      </div>

      <div className={styles.inputBar}>
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={pending}
            placeholder="Ask me anything…"
          />
          <button
            onClick={() => void send(input)}
            disabled={pending || !input.trim()}
            aria-label="Send message"
            className={styles.sendBtn}
          >
            <SendIcon />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </div>
  )
}
