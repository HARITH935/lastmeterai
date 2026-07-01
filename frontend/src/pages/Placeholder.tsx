interface PlaceholderProps {
  name: string
}

export function Placeholder({ name }: PlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-2xl">
        📋
      </div>
      <h1 className="text-xl font-semibold text-slate-800">{name}</h1>
      <p className="text-sm text-slate-400 mt-2 max-w-xs">
        This page will be built in a later milestone. Navigation is wired and routing works.
      </p>
    </div>
  )
}
