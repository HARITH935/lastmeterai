export type NavIcon =
  | 'home' | 'map' | 'chat' | 'orders' | 'reports' | 'analytics' | 'powerbi'
  | 'agents' | 'earnings' | 'bell' | 'profile' | 'settings' | 'insights' | 'radar'

export interface NavItem {
  label: string
  path: string
  icon: NavIcon
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// Flat lists — used by BottomTabs (mobile) exactly as before, first 4 items
// become the visible tabs and the rest fold into the "More" drawer.
export const MANAGER_NAV: NavItem[] = [
  { label: 'Home',              path: '/dashboard',         icon: 'home' },
  { label: 'Map',               path: '/map',               icon: 'map' },
  { label: 'AI Chat',           path: '/chat',              icon: 'chat' },
  { label: 'All Orders',        path: '/orders',            icon: 'orders' },
  { label: 'Reports',           path: '/reports',           icon: 'reports' },
  { label: 'Analytics',         path: '/analytics',         icon: 'analytics' },
  { label: 'Power BI',          path: '/power-bi',          icon: 'powerbi' },
  { label: 'Agents',            path: '/agents',            icon: 'agents' },
  { label: 'Notifications',     path: '/notifications',     icon: 'bell' },
  { label: 'Profile',           path: '/profile',           icon: 'profile' },
  { label: 'Settings',          path: '/settings',          icon: 'settings' },
  { label: 'Customer Insights', path: '/customer-insights', icon: 'insights' },
  { label: 'Area Intelligence', path: '/area-intelligence', icon: 'radar' },
]

export const AGENT_NAV: NavItem[] = [
  { label: 'Home',          path: '/dashboard',     icon: 'home' },
  { label: 'Map',           path: '/map',           icon: 'map' },
  { label: 'AI Chat',       path: '/chat',          icon: 'chat' },
  { label: 'Order History', path: '/orders',        icon: 'orders' },
  { label: 'Earnings',      path: '/earnings',      icon: 'earnings' },
  { label: 'Notifications', path: '/notifications', icon: 'bell' },
  { label: 'Profile',       path: '/profile',       icon: 'profile' },
  { label: 'Settings',      path: '/settings',      icon: 'settings' },
]

// Grouped structure for the desktop Sidebar — navigation only. Notifications /
// Profile / Settings / Logout live in the TopBar's account menu instead, so
// they're deliberately excluded here.
export const MANAGER_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Home',    path: '/dashboard', icon: 'home' },
      { label: 'Map',     path: '/map',       icon: 'map' },
      { label: 'AI Chat', path: '/chat',      icon: 'chat' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'All Orders', path: '/orders', icon: 'orders' },
      { label: 'Agents',     path: '/agents',  icon: 'agents' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports',           path: '/reports',            icon: 'reports' },
      { label: 'Analytics',         path: '/analytics',           icon: 'analytics' },
      { label: 'Power BI',          path: '/power-bi',            icon: 'powerbi' },
      { label: 'Customer Insights', path: '/customer-insights',   icon: 'insights' },
      { label: 'Area Intelligence', path: '/area-intelligence',   icon: 'radar' },
    ],
  },
]

export const AGENT_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Home',    path: '/dashboard', icon: 'home' },
      { label: 'Map',     path: '/map',       icon: 'map' },
      { label: 'AI Chat', path: '/chat',      icon: 'chat' },
    ],
  },
  {
    label: 'Work',
    items: [
      { label: 'Order History', path: '/orders',   icon: 'orders' },
      { label: 'Earnings',      path: '/earnings',  icon: 'earnings' },
    ],
  },
]

// Page title shown in the TopBar — falls back to the matching flat-nav label,
// with a special case for the order detail sub-route.
export function pageTitle(pathname: string, role: 'manager' | 'agent' | undefined): string {
  if (pathname.startsWith('/orders/')) return 'Order Detail'
  const navItems = role === 'manager' ? MANAGER_NAV : AGENT_NAV
  return navItems.find(i => i.path === pathname)?.label ?? 'LastMeter AI'
}
