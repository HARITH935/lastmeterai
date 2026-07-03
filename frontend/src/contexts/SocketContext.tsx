import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { getNotifications } from '../api/notifications'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'

interface SocketContextValue {
  socket: Socket | null
  unreadCount: number
  setUnreadCount: (n: number) => void
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  unreadCount: 0,
  setUnreadCount: () => {},
})

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, access_token } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [socket, setSocket] = useState<Socket | null>(null)

  // Fetch initial unread count from REST API whenever the token changes.
  useEffect(() => {
    if (!access_token) {
      setUnreadCount(0)
      return
    }
    let cancelled = false
    getNotifications(access_token, { per_page: 1, page: 1 })
      .then(res => { if (!cancelled) setUnreadCount(res.unread_counts.total) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [access_token])

  // Socket connection — created when authenticated, destroyed on logout.
  useEffect(() => {
    if (!access_token || !user) return

    const s = io(API_BASE, {
      auth: { token: access_token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })
    setSocket(s)

    s.on('connected', (data: { user_id: number; role: string; room: string }) => {
      console.debug('[Socket] connected — room:', data.room)
    })

    s.on('new_notification', () => {
      setUnreadCount(prev => prev + 1)
    })

    s.on('disconnect', (reason) => {
      console.debug('[Socket] disconnected —', reason)
    })

    return () => {
      s.disconnect()
      setSocket(null)
    }
  }, [access_token, user])

  return (
    <SocketContext.Provider value={{ socket, unreadCount, setUnreadCount }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext)
}
