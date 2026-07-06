import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { router } from './router'
import { OfflineBanner } from './components/ui/OfflineBanner'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <RouterProvider router={router} />
            <OfflineBanner />
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
