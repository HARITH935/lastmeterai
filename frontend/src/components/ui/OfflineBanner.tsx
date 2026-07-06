import { useEffect, useState } from 'react'

/**
 * Fixed banner shown when the browser goes offline. Reassures the user that
 * the app still works with last-saved data (served by the service worker).
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline  = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] bg-amber-500 text-white text-center text-xs font-semibold py-2 px-4 shadow-lg">
      ⚠ You're offline — showing last saved data. Changes will sync when you reconnect.
    </div>
  )
}
