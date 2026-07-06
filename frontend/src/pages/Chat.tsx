import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { sendChatMessage, type ChatMessageResponse } from '../api/chat'

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

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
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
    <div className="flex items-center gap-1.5 mt-1.5 ml-1 flex-wrap">
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isGeneral
            ? 'bg-slate-100 text-slate-500'
            : 'bg-blue-50 text-blue-600'
        }`}
      >
        {label}
      </span>
      {confidence !== undefined && confidence > 0 && (
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isLow
              ? 'bg-amber-50 text-amber-600'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
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
      <div className="flex justify-end">
        <div
          className="max-w-[78%] text-white rounded-2xl rounded-tr-sm px-4 py-2.5"
          style={{ backgroundColor: '#2563EB' }}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        </div>
      </div>
    )
  }

  if (msg.role === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[78%] bg-red-50 border border-red-200 rounded-2xl rounded-tl-sm px-4 py-2.5">
          <p className="text-xs font-semibold text-red-600">{msg.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[78%]">
        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{msg.text}</p>
        </div>
        {msg.intent && (
          <IntentBadge intent={msg.intent} confidence={msg.intentConfidence} />
        )}
      </div>
    </div>
  )
}

// ── Typing indicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
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
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <ChatIcon />
      </div>
      <h2 className="text-base font-semibold text-slate-800 mb-1">LastMeter AI Assistant</h2>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        {isManager
          ? 'Ask about area performance, agent assignments, failures, or weather impact.'
          : 'Ask about your deliveries, earnings, or what to prioritise today.'}
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="text-left text-sm text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 transition-colors"
          >
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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Message list — extra bottom padding on mobile so input doesn't cover messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 md:pb-4 space-y-3 bg-slate-50 dark:bg-slate-950">
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

      {/* Input row */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={pending}
            placeholder="Ask me anything…"
            className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:opacity-50 bg-slate-50 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            onClick={() => void send(input)}
            disabled={pending || !input.trim()}
            aria-label="Send message"
            className="px-4 py-2.5 text-white rounded-xl disabled:opacity-40 transition-opacity flex items-center gap-1.5 text-sm font-semibold shrink-0"
            style={{ backgroundColor: '#2563EB' }}
          >
            <SendIcon />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </div>
  )
}
