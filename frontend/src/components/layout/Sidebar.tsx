import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { MANAGER_NAV_GROUPS, AGENT_NAV_GROUPS } from '../../router/nav'
import { NavGlyph } from './navIcons'
import styles from './Sidebar.module.css'

export function Sidebar() {
  const { user } = useAuth()
  const groups = user?.role === 'manager' ? MANAGER_NAV_GROUPS : AGENT_NAV_GROUPS

  return (
    <aside className={styles.sidebar}>
      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.brandMark}>L</div>
        <div className={styles.brandText}>
          <p className={styles.brandName}>LastMeter AI</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className={styles.navScroll}>
        {groups.map(group => (
          <div key={group.label} className={styles.navGroup}>
            <p className={styles.navGroupLabel}>{group.label}</p>
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                }
              >
                <NavGlyph icon={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
