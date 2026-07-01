interface MetricCardProps {
  label: string
  value: string | number
  accent?: string
}

export function MetricCard({ label, value, accent }: MetricCardProps) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold text-slate-900 ${accent ?? ''}`}>{value}</span>
    </div>
  )
}
