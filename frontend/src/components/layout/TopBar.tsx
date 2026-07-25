import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import { useTheme } from '../../contexts/ThemeContext'
import { pageTitle } from '../../router/nav'
import { BellIcon, ProfileIcon, SettingsIcon, LogoutIcon } from './navIcons'
import styles from './TopBar.module.css'

function SunIcon() {
  return (
    <svg data-spin viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg data-spin viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}

export function TopBar() {
  const { user, logout } = useAuth()
  const { unreadCount } = useSocket()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const title = pageTitle(location.pathname, user?.role)
  const initial = (user?.name ?? user?.username ?? '?').charAt(0).toUpperCase()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className={styles.topbar}>
      <p className={styles.title}>{title}</p>

      <div className={styles.right}>
        <Link to="/notifications" className={styles.iconBtn} title="Notifications" aria-label="Notifications">
          <BellIcon />
          {unreadCount > 0 && (
            <span className={styles.iconDot}>{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </Link>

        <button
          onClick={toggleTheme}
          className={styles.iconBtn}
          aria-label="Toggle dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <MoonIcon key="moon" /> : <SunIcon key="sun" />}
        </button>

        <div className={styles.divider} />

        <div className={styles.userMenu}>
          <button className={styles.userTrigger} onClick={() => setMenuOpen(o => !o)}>
            <div className={styles.userAvatar}>{initial}</div>
            <div className={styles.userText}>
              <p className={styles.userName}>{user?.name ?? user?.username}</p>
              <p className={styles.userRole}>{user?.role}</p>
            </div>
            <svg
              className={`${styles.chev} ${menuOpen ? styles.chevOpen : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />
              <div className={styles.dropdown}>
                <Link to="/profile" className={styles.ddItem} onClick={() => setMenuOpen(false)}>
                  <ProfileIcon /> Profile
                </Link>
                <Link to="/settings" className={styles.ddItem} onClick={() => setMenuOpen(false)}>
                  <SettingsIcon /> Settings
                </Link>
                <div className={styles.ddDivider} />
                <button className={`${styles.ddItem} ${styles.ddItemLogout}`} onClick={handleLogout}>
                  <LogoutIcon /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
