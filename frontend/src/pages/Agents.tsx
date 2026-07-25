import { Fragment, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getKPI, getLeaderboard, type AgentPerf, type LeaderboardAgent } from '../api/analytics'
import { getAllOrders, type OrderListItem } from '../api/orders'
import { createAgentAccount, listAgentAccounts, setAgentActive, type AgentAccount } from '../api/agents'
import { VALID_AREAS } from '../api/analytics'
import styles from './Agents.module.css'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period  = 'week' | 'month'
type SortKey = 'performance_score' | 'success_rate' | 'area' | 'agent_name'
type View    = 'cards' | 'leaderboard' | 'accounts'

type OrderFetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; orders: OrderListItem[] }

// ── Helpers ────────────────────────────────────────────────────────────────────

function toPercent(ratio: number): string {
  return `${(Math.round(ratio * 1000) / 10).toFixed(1)}%`
}

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function rateClass(rate: number): string {
  return rate >= 0.7 ? styles.rateGo : rate >= 0.4 ? styles.rateUrgent : styles.rateNogo
}

function rateColor(rate: number): string {
  return rate >= 0.7 ? 'var(--go)' : rate >= 0.4 ? 'var(--urgent)' : 'var(--nogo)'
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function AgentsSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div className={styles.cardsGrid}>
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 176 }} />)}
        </div>
      </div>
    </div>
  )
}

// ── Status + Risk badges ───────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  pending:    styles.pillPending,
  in_transit: styles.pillIn_transit,
  delivered:  styles.pillDelivered,
  failed:     styles.pillFailed,
  postponed:  styles.pillPostponed,
}

const RISK_PILL: Record<string, string> = {
  low:    styles.pillLow,
  medium: styles.pillMedium,
  high:   styles.pillHigh,
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.pill} ${STATUS_PILL[status] ?? styles.pillPostponed}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className={styles.pillNone}>—</span>
  return (
    <span className={`${styles.pill} ${RISK_PILL[level] ?? styles.pillPostponed}`}>
      {level}
    </span>
  )
}

// ── Agent card ─────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  selected,
  onClick,
}: {
  agent: AgentPerf
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`${styles.agentCard} ${selected ? styles.agentCardSel : ''}`}
    >
      {/* Name + area */}
      <div className={styles.acHead}>
        <div>
          <p className={styles.acName}>{agent.agent_name}</p>
          <span className={styles.areaChip}>{agent.area}</span>
        </div>
        <div>
          <p className={styles.acScoreLbl}>Score</p>
          <p className={styles.acScore}>{Math.round(agent.performance_score * 100)}</p>
        </div>
      </div>

      {/* Stat row */}
      <div className={styles.acStats}>
        <div>
          <p className={styles.acStatLbl}>Orders</p>
          <p className={styles.acStatVal}>{agent.order_count}</p>
        </div>
        <div>
          <p className={styles.acStatLbl}>Delivered</p>
          <p className={styles.acStatVal}>{agent.delivered_count}</p>
        </div>
        <div>
          <p className={`${styles.acStatVal} ${rateClass(agent.success_rate)}`}>{toPercent(agent.success_rate)}</p>
          <p className={styles.acStatLbl} style={{ marginTop: 0 }}>Success</p>
        </div>
      </div>

      {/* Score bar */}
      <div className={styles.acBarRow}>
        <div className={styles.acBar}>
          <div className={styles.acBarFill} style={{ width: `${Math.round(agent.performance_score * 100)}%` }} />
        </div>
        <span className={styles.acBarNum}>{Math.round(agent.performance_score * 100)} / 100</span>
      </div>

      {/* Click hint */}
      <p className={styles.acHint}>
        {selected ? 'Click to hide orders' : 'Click to view orders'}
      </p>
    </button>
  )
}

// ── Agent order detail panel ───────────────────────────────────────────────────

function AgentOrderDetail({ agent, state }: { agent: AgentPerf; state: OrderFetchState }) {
  if (state.status === 'idle') return null

  if (state.status === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 40 }} />)}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={styles.errorCard}>
        <p className={styles.errorTitle}>Failed to load orders</p>
        <p className={styles.errorMsg}>{state.message}</p>
      </div>
    )
  }

  const { orders } = state

  if (orders.length === 0) {
    return (
      <p className={styles.emptyNote}>
        No orders assigned to {agent.agent_name} in this period.
      </p>
    )
  }

  return (
    <div className={styles.tableCard}>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              {['Order', 'Customer', 'Status', 'Deadline', 'Risk', 'Amount'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id}>
                <td className={styles.mono}>{o.order_number}</td>
                <td>{o.customer_name}</td>
                <td><StatusBadge status={o.status} /></td>
                <td className={styles.mono} style={{ color: 'var(--ink-muted)' }}>{fmtDate(o.deadline)}</td>
                <td><RiskBadge level={o.risk_level} /></td>
                <td>₹{o.payment_amount.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Leaderboard row ────────────────────────────────────────────────────────────

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function LeaderboardRow({ agent }: { agent: LeaderboardAgent }) {
  const medal = MEDALS[agent.rank]

  return (
    <tr className={agent.rank <= 3 ? styles.top3 : ''}>
      <td className={styles.centerCol}>
        {medal
          ? <span className={styles.medal}>{medal}</span>
          : <span className={styles.rankNum}>#{agent.rank}</span>
        }
      </td>
      <td>
        <p className={styles.agentName}>{agent.agent_name}</p>
        <div style={{ marginTop: 2 }}>
          {agent.area && <span className={styles.areaChip}>{agent.area}</span>}
          {agent.avg_rating != null && (
            <span className={styles.ratingTxt} title={`${agent.rating_count} rating${agent.rating_count !== 1 ? 's' : ''}`}>
              ★ {agent.avg_rating.toFixed(1)}
            </span>
          )}
        </div>
      </td>
      <td className={styles.ordersNum}>
        {agent.order_count}
        <p className={styles.deliveredSub}>{agent.delivered_count} delivered</p>
      </td>
      <td>
        <div className={styles.srRow}>
          <div className={styles.srBar}>
            <div className={styles.srBarFill} style={{ width: `${Math.round(agent.success_rate * 100)}%`, backgroundColor: rateColor(agent.success_rate) }} />
          </div>
          <span className={`${styles.srPct} ${rateClass(agent.success_rate)}`}>
            {toPercent(agent.success_rate)}
          </span>
        </div>
      </td>
      <td className={styles.earnings}>₹{agent.earnings_inr.toLocaleString('en-IN')}</td>
      <td className={styles.scoreCol}>{Math.round(agent.performance_score * 100)}</td>
    </tr>
  )
}

function Leaderboard({ period, accessToken }: { period: Period; accessToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; agents: LeaderboardAgent[] }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getLeaderboard(accessToken, period)
      .then(res => { if (!cancelled) setState({ status: 'success', agents: res.agents }) })
      .catch((err: unknown) => { if (!cancelled) setState({ status: 'error', message: extractMsg(err) }) })
    return () => { cancelled = true }
  }, [accessToken, period])

  if (state.status === 'loading') return <AgentsSkeleton />
  if (state.status === 'error') return (
    <div className={styles.errorCard}>
      <p className={styles.errorMsg}>{state.message}</p>
    </div>
  )

  const { agents } = state
  const top = agents[0]

  return (
    <>
      {/* Top performer highlight */}
      {top && (
        <div className={styles.topCard}>
          <span className={styles.topEmoji}>🏆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className={styles.topLabel}>Top Performer · {period === 'week' ? 'This Week' : 'This Month'}</p>
            <p className={styles.topName}>{top.agent_name}</p>
            <p className={styles.topMeta}>{top.area} · {toPercent(top.success_rate)} success · ₹{top.earnings_inr.toLocaleString('en-IN')} earned</p>
          </div>
          <div className={styles.topScoreWrap}>
            <p className={styles.topScore}>{Math.round(top.performance_score * 100)}</p>
            <p className={styles.topScoreLbl}>score</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={styles.tableCard}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.centerCol} style={{ width: 40 }}>#</th>
                <th>Agent</th>
                <th className={styles.centerCol}>Orders</th>
                <th style={{ minWidth: 140 }}>Success Rate</th>
                <th className={styles.rightCol}>Earnings</th>
                <th className={styles.centerCol}>Score</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => <LeaderboardRow key={a.agent_id} agent={a} />)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ── Accounts view (full roster — includes zero-order agents; deactivate/reactivate) ──

function AccountsView({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; agents: AgentAccount[] }
  >({ status: 'loading' })
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null)

  function load() {
    setState({ status: 'loading' })
    listAgentAccounts(accessToken)
      .then(agents => setState({ status: 'success', agents }))
      .catch((err: unknown) => setState({ status: 'error', message: extractMsg(err) }))
  }

  useEffect(() => { load() }, [])

  async function toggle(agent: AgentAccount) {
    setBusyId(agent.id)
    setRowError(null)
    try {
      await setAgentActive(accessToken, agent.id, !agent.is_active)
      load()
    } catch (err) {
      setRowError({ id: agent.id, message: extractMsg(err) })
    } finally {
      setBusyId(null)
    }
  }

  if (state.status === 'loading') return <AgentsSkeleton />
  if (state.status === 'error') {
    return (
      <div className={styles.errorCard}>
        <p className={styles.errorTitle}>Failed to load agent accounts</p>
        <p className={styles.errorMsg}>{state.message}</p>
      </div>
    )
  }

  return (
    <>
      <div className={styles.tableCard}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                {['Agent', 'Username', 'Area', 'Phone', 'Status', 'Created', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.agents.map(a => (
                <Fragment key={a.id}>
                  <tr>
                    <td className={styles.agentName}>{a.name}</td>
                    <td className={styles.mono} style={{ color: 'var(--ink-muted)' }}>{a.username}</td>
                    <td style={{ color: 'var(--ink-muted)' }}>{a.area}</td>
                    <td style={{ color: 'var(--ink-muted)' }}>{a.phone ?? '—'}</td>
                    <td>
                      <span className={`${styles.pill} ${a.is_active ? styles.statusPillActive : styles.statusPillOff}`}>
                        {a.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--ink-dim)', fontSize: '0.76rem' }}>
                      {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className={styles.rightCol}>
                      <button
                        onClick={() => toggle(a)}
                        disabled={busyId === a.id}
                        className={`${styles.toggleBtn} ${a.is_active ? styles.toggleBtnOff : styles.toggleBtnOn}`}
                      >
                        {busyId === a.id ? '…' : a.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                  {rowError?.id === a.id && (
                    <tr>
                      <td colSpan={7} style={{ paddingTop: 0 }}>
                        <p className={styles.rowError}>{rowError.message}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className={styles.footNote}>
        Deactivating blocks login but preserves the agent's full order/decision history.
        Agents with pending or in-transit orders must be reassigned before deactivating.
      </p>
    </>
  )
}

// ── Add Agent modal ───────────────────────────────────────────────────────────

function AddAgentModal({
  accessToken,
  onClose,
  onCreated,
}: {
  accessToken: string
  onClose: () => void
  onCreated: (username: string) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [area, setArea]         = useState<string>(VALID_AREAS[0])
  const [phone, setPhone]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createAgentAccount(accessToken, {
        username: username.trim(),
        password,
        name: name.trim(),
        area,
        phone: phone.trim() || undefined,
      })
      onCreated(created.username)
    } catch (err) {
      setError(extractMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h2>Add Agent</h2>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              placeholder="e.g. priya.lakshmi"
              className={styles.formInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Full name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className={styles.formInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Area</label>
            <select
              value={area}
              onChange={e => setArea(e.target.value)}
              className={styles.formInput}
            >
              {VALID_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Phone (optional)</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="10-digit number"
              className={styles.formInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Initial password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className={styles.formInput}
            />
            <p className={styles.formHint}>The agent can change this later from their own Settings.</p>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={styles.createBtn}>
              {saving ? 'Creating…' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Agents() {
  const { user, access_token } = useAuth()

  const [view, setView]                   = useState<View>('leaderboard')
  const [period, setPeriod]               = useState<Period>('week')
  const [sortKey, setSortKey]             = useState<SortKey>('performance_score')
  const [selectedAgent, setSelectedAgent] = useState<AgentPerf | null>(null)
  const [showAddAgent, setShowAddAgent]   = useState(false)
  const [addedUsername, setAddedUsername] = useState<string | null>(null)

  const [kpiState, setKpiState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; agents: AgentPerf[] }
  >({ status: 'loading' })

  const [orderState, setOrderState] = useState<OrderFetchState>({ status: 'idle' })

  // Fetch KPI when period changes
  useEffect(() => {
    if (user?.role !== 'manager') return
    let cancelled = false
    setKpiState({ status: 'loading' })
    setSelectedAgent(null)

    getKPI(access_token!, period)
      .then(kpi => {
        if (!cancelled) setKpiState({ status: 'success', agents: kpi.agent_performance })
      })
      .catch((err: unknown) => {
        if (!cancelled) setKpiState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, period, user?.role])

  // Fetch orders when selected agent changes
  useEffect(() => {
    if (!selectedAgent) {
      setOrderState({ status: 'idle' })
      return
    }
    let cancelled = false
    setOrderState({ status: 'loading' })

    getAllOrders(access_token!, { agentId: selectedAgent.agent_id, perPage: 50 })
      .then(res => {
        if (!cancelled) setOrderState({ status: 'success', orders: res.data })
      })
      .catch((err: unknown) => {
        if (!cancelled) setOrderState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, selectedAgent])

  if (user?.role !== 'manager') {
    return (
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <div className={styles.roleGate}>
            <p>This page is for managers only.</p>
          </div>
        </div>
      </div>
    )
  }

  // Client-side sort of the 5-agent array
  const sortedAgents =
    kpiState.status === 'success'
      ? [...kpiState.agents].sort((a, b) => {
          switch (sortKey) {
            case 'performance_score': return b.performance_score - a.performance_score
            case 'success_rate':      return b.success_rate - a.success_rate
            case 'area':              return a.area.localeCompare(b.area)
            case 'agent_name':        return a.agent_name.localeCompare(b.agent_name)
            default:                  return 0
          }
        })
      : []

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>

        {/* Header + controls */}
        <div className={styles.pageHead}>
          <h1>Agent Management</h1>
          <div className={styles.headActions}>
            <button onClick={() => setShowAddAgent(true)} className={styles.btnGold}>
              + Add Agent
            </button>
            {/* View toggle */}
            <div className={styles.pillToggle}>
              {(['leaderboard', 'cards', 'accounts'] as View[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`${styles.pillBtn} ${view === v ? styles.pillBtnSel : ''}`}
                >
                  {v === 'leaderboard' ? '🏆 Leaderboard' : v === 'cards' ? 'Cards' : 'Accounts'}
                </button>
              ))}
            </div>
            {/* Period toggle */}
            <div className={styles.pillToggle}>
              {(['week', 'month'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`${styles.pillBtn} ${period === p ? styles.pillBtnSel : ''}`}
                >
                  {p === 'week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>
            {/* Sort dropdown — only in cards view */}
            {view === 'cards' && (
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className={styles.sortSelect}
              >
                <option value="performance_score">Sort: Score</option>
                <option value="success_rate">Sort: Success Rate</option>
                <option value="area">Sort: Area</option>
                <option value="agent_name">Sort: Name</option>
              </select>
            )}
          </div>
        </div>

        {/* Add-agent success confirmation */}
        {addedUsername && (
          <div className={styles.successBanner}>
            <p>
              ✓ Agent "{addedUsername}" created — they can log in now. They'll appear on the
              Leaderboard/Cards views once they have order activity; this Accounts tab shows them right away.
            </p>
            <button onClick={() => setAddedUsername(null)} className={styles.successClose}>✕</button>
          </div>
        )}

        {showAddAgent && (
          <AddAgentModal
            accessToken={access_token!}
            onClose={() => setShowAddAgent(false)}
            onCreated={(username) => {
              setShowAddAgent(false)
              setAddedUsername(username)
              setView('accounts')
            }}
          />
        )}

        {/* Leaderboard view */}
        {view === 'leaderboard' && (
          <Leaderboard period={period} accessToken={access_token!} />
        )}

        {/* Accounts view — full roster, deactivate/reactivate */}
        {view === 'accounts' && (
          <AccountsView accessToken={access_token!} />
        )}

        {/* Cards view */}
        {view === 'cards' && (
          <>
            {kpiState.status === 'loading' && (
              <div className={styles.cardsGrid}>
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 176 }} />)}
              </div>
            )}

            {kpiState.status === 'error' && (
              <div className={styles.errorCard}>
                <p className={styles.errorTitle}>Failed to load agents</p>
                <p className={styles.errorMsg}>{kpiState.message}</p>
              </div>
            )}

            {kpiState.status === 'success' && (
              <>
                <div className={styles.cardsGrid}>
                  {sortedAgents.map(agent => (
                    <AgentCard
                      key={agent.agent_id}
                      agent={agent}
                      selected={selectedAgent?.agent_id === agent.agent_id}
                      onClick={() =>
                        setSelectedAgent(selectedAgent?.agent_id === agent.agent_id ? null : agent)
                      }
                    />
                  ))}
                </div>

                {selectedAgent && (
                  <div className={styles.detailCard}>
                    <div className={styles.detailHead}>
                      <div>
                        <span className={styles.detailName}>
                          {selectedAgent.agent_name}
                          <span className={styles.detailSub}> · {selectedAgent.area}</span>
                        </span>
                        {orderState.status === 'success' && (
                          <p className={styles.detailSub}>
                            {orderState.orders.length} order{orderState.orders.length !== 1 ? 's' : ''} total
                          </p>
                        )}
                      </div>
                      <button onClick={() => setSelectedAgent(null)} className={styles.closeBtn}>
                        Close ×
                      </button>
                    </div>
                    <AgentOrderDetail agent={selectedAgent} state={orderState} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
