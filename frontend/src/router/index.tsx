import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Shell } from '../components/layout/Shell'
import { ProtectedRoute } from './ProtectedRoute'
import { Landing } from '../pages/Landing'
import { Login } from '../pages/Login'
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
import { Analytics } from '../pages/Analytics'
import { PowerBI } from '../pages/PowerBI'
import { OrderDetail } from '../pages/OrderDetail'
import { Track } from '../pages/Track'
import { RouteError } from '../components/layout/RouteError'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Landing />,
    errorElement: <RouteError />,
  },
  {
    path: '/login',
    element: <Login />,
    errorElement: <RouteError />,
  },
  {
    path: '/track/:token',
    element: <Track />,
    errorElement: <RouteError />,
  },
  {
    errorElement: <RouteError />,
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
      { path: '/orders/:id',        element: <OrderDetail /> },
      { path: '/earnings',          element: <Earnings /> },
      { path: '/reports',           element: <Reports /> },
      { path: '/analytics',         element: <Analytics /> },
      { path: '/power-bi',          element: <PowerBI /> },
      { path: '/agents',            element: <Agents /> },
      { path: '/notifications',     element: <Notifications /> },
      { path: '/profile',           element: <Profile /> },
      { path: '/settings',          element: <Settings /> },
      { path: '/customer-insights', element: <CustomerInsights /> },
      { path: '/area-intelligence', element: <AreaIntelligence /> },
    ],
  },
  // Catch-all → login
  { path: '*', element: <Navigate to="/login" replace /> },
])
