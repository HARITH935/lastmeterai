import { useToast, type Toast } from '../../contexts/ToastContext'

const TOAST_STYLES: Record<string, { bar: string; icon: string; label: string }> = {
  info:    { bar: 'bg-blue-500',  icon: 'ℹ',  label: 'text-blue-700' },
  success: { bar: 'bg-green-500', icon: '✓',  label: 'text-green-700' },
  warning: { bar: 'bg-amber-500', icon: '⚠',  label: 'text-amber-700' },
  error:   { bar: 'bg-red-500',   icon: '✕',  label: 'text-red-700' },
}

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast()
  const style = TOAST_STYLES[toast.type] ?? TOAST_STYLES.info

  return (
    <div className="flex items-start gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-4 py-3 min-w-[260px] max-w-[340px] animate-slide-in">
      <div className={`w-1 self-stretch rounded-full shrink-0 ${style.bar}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${style.label} dark:opacity-90`}>{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 text-xs shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

export function ToastStack() {
  const { toasts } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
