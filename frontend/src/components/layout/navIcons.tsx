import type { NavIcon } from '../../router/nav'

type IconProps = { className?: string }

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20h3.5a1 1 0 0 0 1-1v-9" />
    </Svg>
  )
}

function MapIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
      <path d="M9 4v14M15 6v14" />
    </Svg>
  )
}

function ChatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.1-3.4A7.96 7.96 0 0 1 4 12Z" />
      <path d="M9 11h6M9 14h4" />
    </Svg>
  )
}

function OrdersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" />
      <path d="M3.5 7v10l8.5 4 8.5-4V7" />
      <path d="M12 11v10" />
    </Svg>
  )
}

function ReportsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M8 12h8M8 15.5h8M8 8.5h5" />
    </Svg>
  )
}

function AnalyticsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </Svg>
  )
}

function PowerBiIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 3 5 13.5h6L11 21l8-10.5h-6L13 3Z" />
    </Svg>
  )
}

function AgentsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.8 14.2c2.2.4 3.9 2.6 3.9 5.3" />
    </Svg>
  )
}

function EarningsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.7 9.8c-.3-.9-1.3-1.5-2.7-1.5-1.7 0-2.8.8-2.8 2s1 1.7 2.8 2c1.8.3 2.8.9 2.8 2.1s-1.1 2.1-2.8 2.1c-1.4 0-2.4-.6-2.7-1.5" />
    </Svg>
  )
}

export function BellIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" />
    </Svg>
  )
}

export function ProfileIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="3.7" />
      <path d="M4.5 20c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" />
    </Svg>
  )
}

export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.8 1.8 0 0 0 .36 1.98l.06.06a2.18 2.18 0 1 1-3.08 3.08l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V20a2.18 2.18 0 1 1-4.36 0v-.09a1.8 1.8 0 0 0-1.17-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06a2.18 2.18 0 1 1-3.08-3.08l.06-.06a1.8 1.8 0 0 0 .36-1.98 1.8 1.8 0 0 0-1.65-1.1H2a2.18 2.18 0 1 1 0-4.36h.09a1.8 1.8 0 0 0 1.65-1.17 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2.18 2.18 0 1 1 3.08-3.08l.06.06a1.8 1.8 0 0 0 1.98.36H8.5a1.8 1.8 0 0 0 1.1-1.65V2a2.18 2.18 0 1 1 4.36 0v.09a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06a2.18 2.18 0 1 1 3.08 3.08l-.06.06a1.8 1.8 0 0 0-.36 1.98V8.5a1.8 1.8 0 0 0 1.65 1.1H22a2.18 2.18 0 1 1 0 4.36h-.09a1.8 1.8 0 0 0-1.65 1.1Z" />
    </Svg>
  )
}

function InsightsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.3-4.3" />
    </Svg>
  )
}

function RadarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12 18 7" />
    </Svg>
  )
}

export function LogoutIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h3" />
      <path d="M15.5 16.5 20 12l-4.5-4.5M20 12H9" />
    </Svg>
  )
}

const ICONS: Record<NavIcon, (p: IconProps) => React.ReactElement> = {
  home: HomeIcon,
  map: MapIcon,
  chat: ChatIcon,
  orders: OrdersIcon,
  reports: ReportsIcon,
  analytics: AnalyticsIcon,
  powerbi: PowerBiIcon,
  agents: AgentsIcon,
  earnings: EarningsIcon,
  bell: BellIcon,
  profile: ProfileIcon,
  settings: SettingsIcon,
  insights: InsightsIcon,
  radar: RadarIcon,
}

export function NavGlyph({ icon, className }: { icon: NavIcon; className?: string }) {
  const Icon = ICONS[icon]
  return <Icon className={className} />
}
