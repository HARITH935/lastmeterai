import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import {
  getNotifications, markNotificationRead, markAllRead, deleteNotification,
  type NotificationCategory, type NotificationItem, type NotificationListResponse,
} from '../api/notifications'
import styles from './Notifications.module.css'

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
  ai_alert:       { label: 'AI',       pill: styles.catAi },
  delivery_alert: { label: 'Delivery', pill: styles.catDelivery },
  weather_alert:  { label: 'Weather',  pill: styles.catWeather },
  system_alert:   { label: 'System',   pill: styles.catSystem },
}

function CatBadge({ category }: { category: NotificationCategory }) {
  const c = CAT_CONFIG[category]
  return (
    <span className={`${styles.catBadge} ${c.pill}`}>
      {c.label}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function NotifSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 80 }} />)}
        </div>
      </div>
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
    <div className={`${styles.row} ${!notif.is_read ? styles.rowUnread : ''}`}>
      {/* Unread dot */}
      <div className={styles.dotCol}>
        {!notif.is_read && <div className={styles.unreadDot} />}
      </div>

      {/* Content */}
      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <CatBadge category={notif.category} />
          <span className={`${styles.rowTitle} ${!notif.is_read ? styles.rowTitleUnread : ''}`}>
            {notif.title}
          </span>
          <span className={styles.rowTime}>
            {fmtTime(notif.created_at)}
          </span>
        </div>
        <p className={styles.rowMsg}>
          {notif.message}
        </p>
        {notif.order_id != null && (
          <p className={styles.rowOrder}>
            → Order #{notif.order_id}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className={styles.rowActions}>
        {!notif.is_read && (
          <button
            onClick={() => onMarkRead(notif.id)}
            disabled={pending}
            title="Mark as read"
            className={`${styles.actBtn} ${styles.actCheck}`}
          >
            ✓
          </button>
        )}
        <button
          onClick={() => onDelete(notif.id)}
          disabled={pending}
          title="Delete"
          className={`${styles.actBtn} ${styles.actDel}`}
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

  if (listState.status === 'loading') return <NotifSkeleton />

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={styles.pageHead}>
          <div className={styles.headLeft}>
            <h1>Notifications</h1>
            {unread != null && unread > 0 && (
              <span className={styles.unreadBadge}>{unread}</span>
            )}
          </div>
          {hasUnread && (
            <button onClick={handleMarkAll} disabled={markingAll} className={styles.markAllBtn}>
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className={styles.filterRow}>
          {/* Category pills */}
          <div className={styles.catPills}>
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
                className={`${styles.catPill} ${filterCat === opt.value ? styles.catPillSel : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Read/unread toggle */}
          <div className={styles.readToggle}>
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
                className={`${styles.readBtn} ${filterRead === opt.value ? styles.readBtnSel : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {listState.status === 'error' && (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Failed to load notifications</p>
            <p className={styles.errorMsg}>{listState.message}</p>
          </div>
        )}

        {listState.status === 'success' && (
          <>
            {listState.resp.data.length === 0 ? (
              <div className={styles.listCard}>
                <div className={styles.emptyState}>
                  <p>
                    {filterRead === 'unread'
                      ? 'No unread notifications.'
                      : filterCat
                      ? `No ${CAT_CONFIG[filterCat].label.toLowerCase()} notifications.`
                      : 'No notifications yet.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className={styles.listCard}>
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
              <div className={styles.pager}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={styles.pagerBtn}
                >
                  ← Previous
                </button>
                <span className={styles.pagerInfo}>
                  Page {pagination.page} of {pagination.pages}
                  <span> · {pagination.total} total</span>
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className={styles.pagerBtn}
                >
                  Next →
                </button>
              </div>
            )}

            {/* Unread breakdown (shown when viewing "All") */}
            {filterRead === 'all' && listState.resp.unread_counts.total > 0 && (
              <div className={styles.breakdownCard}>
                <p className={styles.breakdownLabel}>
                  Unread by category
                </p>
                <div className={styles.breakdownChips}>
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
                        className={`${styles.breakdownChip} ${CAT_CONFIG[key].pill}`}
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
