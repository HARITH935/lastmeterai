import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import { MANAGER_NAV, AGENT_NAV } from '../../router/nav'

export function Sidebar() {
  const { user, logout } = useAuth()
  const { unreadCount } = useSocket()
  const navigate = useNavigate()
  const navItems = user?.role === 'manager' ? MANAGER_NAV : AGENT_NAV

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r border-slate-200 h-full">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-slate-100">
        <span className="text-lg font-bold text-primary tracking-tight">LastMeter AI</span>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{user?.name ?? user?.username}</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium rounded-lg mx-2 my-0.5 transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
            {item.label}
            {item.path === '/notifications' && unreadCount > 0 && (
              <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-nogo hover:bg-red-50 rounded-lg transition-colors"
        >
          <span>↩</span>
          Logout
        </button>
      </div>
    </aside>
  )
}
