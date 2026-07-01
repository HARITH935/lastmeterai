import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg'
}

const PADDING = { sm: 'p-3', md: 'p-4', lg: 'p-6' }

export function Card({ padding = 'md', className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl ${PADDING[padding]} ${className}`}
      style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06)' }}
      {...rest}
    >
      {children}
    </div>
  )
}
