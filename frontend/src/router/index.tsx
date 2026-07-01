import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Shell } from '../components/layout/Shell'
import { ProtectedRoute } from './ProtectedRoute'
import { Login } from '../pages/Login'
import { Placeholder } from '../pages/Placeholder'
import { Dashboard } from '../pages/Dashboard'
import { Map } from '../pages/Map'
import { Chat } from '../pages/Chat'
import { Orders } from '../pages/Orders'
import { Reports } from '../pages/Reports'
import { Agents } from '../pages/Agents'
import { Earnings } from '../pages/Earnings'
import { Notifications } from '../pages/Notifications'
import { Settings } from '../pages/Settings'
import { Profile } from '../pages/Profile'
import { CustomerInsights } from '../pages/CustomerInsights'
import { AreaIntelligence } from '../pages/AreaIntelligence'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    element: (
      <ProtectedRoute>
        <Shell />
      </ProtectedRoute>
    ),
    children: [
      { path: '/dashboard',         element: <Dashboard /> },
      { path: '/map',               element: <Map /> },
      { path: '/chat',              element: <Chat /> },
      { path: '/orders',            element: <Orders /> },
      { path: '/earnings',          element: <Earnings /> },
      { path: '/reports',           element: <Reports /> },
      { path: '/agents',            element: <Agents /> },
      { path: '/notifications',     element: <Notifications /> },
      { path: '/profile',           element: <Profile /> },
      { path: '/settings',          element: <Settings /> },
      { path: '/customer-insights', element: <CustomerInsights /> },
      { path: '/area-intelligence', element: <AreaIntelligence /> },
      // Root redirect
      { path: '/',                  element: <Navigate to="/dashboard" replace /> },
    ],
  },
  // Catch-all → login
  { path: '*', element: <Navigate to="/login" replace /> },
])
