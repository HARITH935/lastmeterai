export interface NavItem {
  label: string
  path: string
}

export const MANAGER_NAV: NavItem[] = [
  { label: 'Home',              path: '/dashboard' },
  { label: 'Map',               path: '/map' },
  { label: 'AI Chat',           path: '/chat' },
  { label: 'All Orders',        path: '/orders' },
  { label: 'Reports',           path: '/reports' },
  { label: 'Agents',            path: '/agents' },
  { label: 'Notifications',     path: '/notifications' },
  { label: 'Profile',           path: '/profile' },
  { label: 'Settings',          path: '/settings' },
  { label: 'Customer Insights', path: '/customer-insights' },
  { label: 'Area Intelligence', path: '/area-intelligence' },
]

export const AGENT_NAV: NavItem[] = [
  { label: 'Home',          path: '/dashboard' },
  { label: 'Map',           path: '/map' },
  { label: 'AI Chat',       path: '/chat' },
  { label: 'Order History', path: '/orders' },
  { label: 'Earnings',      path: '/earnings' },
  { label: 'Notifications', path: '/notifications' },
  { label: 'Profile',       path: '/profile' },
  { label: 'Settings',      path: '/settings' },
]
