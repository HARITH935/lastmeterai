import { useRouteError, useNavigate } from 'react-router-dom'

/**
 * Router errorElement — catches any render/loader crash on a route so the app
 * shows a friendly recovery card instead of a raw white-screen stack trace.
 */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const message =
    error instanceof Error ? error.message :
    typeof error === 'string' ? error :
    'An unexpected error occurred while loading this page.'

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 text-center">
        <p className="text-4xl mb-3">😕</p>
        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">Something went wrong</h1>
        <p className="text-xs text-slate-400 mt-2 break-words">{message}</p>
        <div className="flex gap-2 justify-center mt-6">
          <button
            onClick={() => { navigate('/dashboard'); setTimeout(() => window.location.reload(), 50) }}
            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
