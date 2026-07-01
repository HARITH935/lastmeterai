import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import {
  getNotifications, markNotificationRead, markAllRead, deleteNotification,
  type NotificationCategory, type NotificationItem, type NotificationListResponse,
} from '../api/notifications'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

// ── Category config ────────────────────────────────────────────────────────────

const CAT_CONFIG: Record<
  NotificationCategory,
  { label: string; pill: string }
> = {
  ai_alert:       { label: 'AI',       pill: 'bg-blue-50 text-blue-600' },
  delivery_alert: { label: 'Delivery', pill: 'bg-amber-50 text-amber-600' },
  weather_alert:  { label: 'Weather',  pill: 'bg-cyan-50 text-cyan-600' },
  system_alert:   { label: 'System',   pill: 'bg-slate-100 text-slate-500' },
}

function CatBadge({ category }: { category: NotificationCategory }) {
  const c = CAT_CONFIG[category]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${c.pill}`}>
      {c.label}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function NotifSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => <Sk key={i} className="h-20" />)}
    </div>
  )
}

// ── Filter types ───────────────────────────────────────────────────────────────

type ReadFilter = 'all' | 'unread' | 'read'

// ── Notification row ───────────────────────────────────────────────────────────

function NotifRow({
  notif,
  pending,
  onMarkRead,
  onDelete,
}: {
  notif:       NotificationItem
  pending:     boolean
  onMarkRead:  (id: number) => void
  onDelete:    (id: number) => void
}) {
  return (
    <div
      className={`px-4 py-3 border-b border-slate-50 last:border-0 flex gap-3 items-start transition-colors ${
        !notif.is_read ? 'bg-blue-50/25' : ''
      }`}
    >
      {/* Unread dot */}
      <div className="pt-1.5 shrink-0 w-2">
        {!notif.is_read && (
          <div className="w-2 h-2 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <CatBadge category={notif.category} />
          <span className={`text-sm font-semibold text-slate-800 ${!notif.is_read ? 'font-bold' : ''}`}>
            {notif.title}
          </span>
          <span className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">
            {fmtTime(notif.created_at)}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
          {notif.message}
        </p>
        {notif.order_id != null && (
          <p className="text-[11px] text-blue-600 mt-1">
            → Order #{notif.order_id}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0 pt-0.5">
        {!notif.is_read && (
          <button
            onClick={() => onMarkRead(notif.id)}
            disabled={pending}
            title="Mark as read"
            className="text-[11px] text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-40"
          >
            ✓
          </button>
        )}
        <button
          onClick={() => onDelete(notif.id)}
          disabled={pending}
          title="Delete"
          className="text-[11px] text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
        >
          ×
        </button>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Notifications() {
  const { access_token } = useAuth()
  const { setUnreadCount } = useSocket()

  const [filterCat,  setFilterCat]  = useState<NotificationCategory | ''>('')
  const [filterRead, setFilterRead] = useState<ReadFilter>('all')
  const [page,       setPage]       = useState(1)

  const [listState, setListState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; resp: NotificationListResponse }
  >({ status: 'loading' })

  // IDs currently being mutated (disables buttons while in-flight)
  const [pendingIds,   setPendingIds]   = useState<Set<number>>(new Set())
  const [markingAll,   setMarkingAll]   = useState(false)

  // Stable ref so fetch callback can be called after mutations too
  const fetchRef = useRef<() => void>()

  useEffect(() => {
    let cancelled = false
    setListState({ status: 'loading' })

    const isRead =
      filterRead === 'unread' ? false :
      filterRead === 'read'   ? true  : undefined

    getNotifications(access_token!, {
      category: filterCat || undefined,
      is_read:  isRead,
      page,
      per_page: 20,
    })
      .then(resp => {
        if (!cancelled) {
          setListState({ status: 'success', resp })
          setUnreadCount(resp.unread_counts.total)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setListState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, filterCat, filterRead, page, setUnreadCount])

  // Store latest fetch trigger for post-mutation refetch
  fetchRef.current = () => {
    const isRead =
      filterRead === 'unread' ? false :
      filterRead === 'read'   ? true  : undefined
    setListState({ status: 'loading' })
    getNotifications(access_token!, {
      category: filterCat || undefined,
      is_read:  isRead,
      page,
      per_page: 20,
    })
      .then(resp => {
        setListState({ status: 'success', resp })
        setUnreadCount(resp.unread_counts.total)
      })
      .catch((err: unknown) => setListState({ status: 'error', message: extractMsg(err) }))
  }

  function addPending(id: number) {
    setPendingIds(s => { const n = new Set(s); n.add(id); return n })
  }
  function removePending(id: number) {
    setPendingIds(s => { const n = new Set(s); n.delete(id); return n })
  }

  async function handleMarkRead(id: number) {
    addPending(id)
    try {
      await markNotificationRead(access_token!, id)
      fetchRef.current?.()
    } catch { /* error visible on refetch */ }
    finally { removePending(id) }
  }

  async function handleDelete(id: number) {
    addPending(id)
    try {
      await deleteNotification(access_token!, id)
      fetchRef.current?.()
    } catch { /* error visible on refetch */ }
    finally { removePending(id) }
  }

  async function handleMarkAll() {
    setMarkingAll(true)
    try {
      await markAllRead(access_token!, filterCat || undefined)
      fetchRef.current?.()
    } catch { /* silent */ }
    finally { setMarkingAll(false) }
  }

  // Reset to page 1 when filters change
  function changeFilterCat(v: NotificationCategory | '') {
    setPage(1)
    setFilterCat(v)
  }
  function changeFilterRead(v: ReadFilter) {
    setPage(1)
    setFilterRead(v)
  }

  const unread = listState.status === 'success'
    ? listState.resp.unread_counts.total
    : null

  const pagination = listState.status === 'success'
    ? listState.resp.pagination
    : null

  const hasUnread = listState.status === 'success'
    ? (filterRead !== 'read' && listState.resp.unread_counts.total > 0)
    : false

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
          {unread != null && unread > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500 text-white">
              {unread}
            </span>
          )}
        </div>
        {hasUnread && (
          <button
            onClick={handleMarkAll}
            disabled={markingAll}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-4 pb-0 flex flex-wrap gap-3">
        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          {(
            [
              { value: '' as const,               label: 'All' },
              { value: 'ai_alert' as const,        label: 'AI' },
              { value: 'delivery_alert' as const,  label: 'Delivery' },
              { value: 'weather_alert' as const,   label: 'Weather' },
              { value: 'system_alert' as const,    label: 'System' },
            ] as const
          ).map(opt => (
            <button
              key={opt.value}
              onClick={() => changeFilterCat(opt.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                filterCat === opt.value
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Read/unread toggle */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 ml-auto">
          {(
            [
              { value: 'all' as const,    label: 'All' },
              { value: 'unread' as const, label: 'Unread' },
              { value: 'read' as const,   label: 'Read' },
            ] as const
          ).map(opt => (
            <button
              key={opt.value}
              onClick={() => changeFilterRead(opt.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                filterRead === opt.value
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="p-4 md:p-6 pt-4">
        {listState.status === 'loading' && <NotifSkeleton />}

        {listState.status === 'error' && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-600">Failed to load notifications</p>
            <p className="text-xs text-red-500 mt-1">{listState.message}</p>
          </div>
        )}

        {listState.status === 'success' && (
          <>
            {listState.resp.data.length === 0 ? (
              <div className="card">
                <p className="text-sm text-slate-400 text-center py-6">
                  {filterRead === 'unread'
                    ? 'No unread notifications.'
                    : filterCat
                    ? `No ${CAT_CONFIG[filterCat].label.toLowerCase()} notifications.`
                    : 'No notifications yet.'}
                </p>
              </div>
            ) : (
              <div className="card overflow-hidden p-0">
                {listState.resp.data.map(n => (
                  <NotifRow
                    key={n.id}
                    notif={n}
                    pending={pendingIds.has(n.id)}
                    onMarkRead={handleMarkRead}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="text-xs font-semibold text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page {pagination.page} of {pagination.pages}
                  <span className="text-slate-400"> · {pagination.total} total</span>
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className="text-xs font-semibold text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}

            {/* Unread breakdown (shown when viewing "All") */}
            {filterRead === 'all' && listState.resp.unread_counts.total > 0 && (
              <div className="mt-4 card bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Unread by category
                </p>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ['ai_alert', 'AI'] ,
                      ['delivery_alert', 'Delivery'],
                      ['weather_alert', 'Weather'],
                      ['system_alert', 'System'],
                    ] as [NotificationCategory, string][]
                  ).map(([key, label]) => {
                    const count = listState.resp.unread_counts[key]
                    if (count === 0) return null
                    return (
                      <button
                        key={key}
                        onClick={() => changeFilterCat(key)}
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold ${CAT_CONFIG[key].pill}`}
                      >
                        {label}: {count}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
