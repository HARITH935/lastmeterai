import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Input({ label, error, id, className = '', ...rest }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full px-3 py-2.5 border rounded-lg text-sm text-slate-900 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary ${
          error ? 'border-nogo bg-red-50' : 'border-slate-200 bg-white'
        } ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-nogo">{error}</p>}
    </div>
  )
}
