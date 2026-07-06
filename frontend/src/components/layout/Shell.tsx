import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomTabs } from './BottomTabs'
import { ToastStack } from './ToastStack'

export function Shell() {
  return (
    <div className="flex h-full bg-surface dark:bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 dark:bg-slate-950">
        <Outlet />
      </main>

      {/* Mobile bottom tabs */}
      <BottomTabs />

      {/* Toast notifications */}
      <ToastStack />
    </div>
  )
}
