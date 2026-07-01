import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import { MANAGER_NAV, AGENT_NAV } from '../../router/nav'

export function BottomTabs() {
  const { user } = useAuth()
  const { unreadCount } = useSocket()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const navItems = user?.role === 'manager' ? MANAGER_NAV : AGENT_NAV
  const mainItems = navItems.slice(0, 4)
  const overflowItems = navItems.slice(4)

  const isMoreRouteActive = overflowItems.some(i => location.pathname === i.path)
  const overflowHasNotif  = overflowItems.some(i => i.path === '/notifications')
  const moreBadge         = overflowHasNotif && unreadCount > 0

  return (
    <>
      {/* Backdrop — closes drawer when tapping outside */}
      {moreOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
      )}

      {/* Overflow drawer — positioned above the nav bar */}
      {moreOpen && (
        <div className="fixed bottom-16 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg">
          {overflowItems.map(item => (
            <button
              key={item.path}
              onClick={() => { setMoreOpen(false); navigate(item.path) }}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-60" />
              {item.label}
              {item.path === '/notifications' && unreadCount > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
        {mainItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center flex-1 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
              }`
            }
          >
            <span className="relative w-1.5 h-1.5 rounded-full bg-current mb-1">
              {item.path === '/notifications' && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            <span className="truncate max-w-[56px] text-center leading-tight">{item.label}</span>
          </NavLink>
        ))}

        {/* More — 5th slot; reveals overflow items */}
        <button
          onClick={() => setMoreOpen(prev => !prev)}
          className={`relative flex flex-col items-center justify-center flex-1 py-2 text-xs font-medium transition-colors ${
            isMoreRouteActive || moreOpen ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="relative w-1.5 h-1.5 rounded-full bg-current mb-1">
            {moreBadge && (
              <span className="absolute -top-1.5 -right-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          <span className="leading-tight">More</span>
        </button>
      </nav>
    </>
  )
}
