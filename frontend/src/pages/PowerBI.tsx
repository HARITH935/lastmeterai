// Power BI embed page.
//
// Set VITE_POWERBI_EMBED_URL (Vercel env + local .env.local) to the "Publish to
// web" link from Power BI Service. When it's set, the dashboard renders in an
// iframe; when it's not, this page shows step-by-step setup instructions so it
// never looks broken.

const EMBED_URL: string = import.meta.env.VITE_POWERBI_EMBED_URL ?? ''

function SetupGuide() {
  const steps = [
    ['Get your data', 'Open the Analytics page in this app and click “Download all (4 CSVs)”. Those files are your data source.'],
    ['Sign in to Power BI', 'Go to app.powerbi.com and sign in (use a college / work email — personal Gmail is often rejected).'],
    ['Build a report', 'Upload a CSV, then drag fields onto the canvas to make charts. Save the report.'],
    ['Publish to web', 'In Power BI: File → Embed report → Publish to web (public). Copy the link it gives you.'],
    ['Add the link here', 'Set VITE_POWERBI_EMBED_URL to that link in Vercel (and .env.local), then redeploy. This page will show your dashboard.'],
  ]
  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Power BI Dashboard</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5">
        Not connected yet. Follow these steps to embed your Power BI report here.
      </p>

      <ol className="space-y-3">
        {steps.map(([title, body], i) => (
          <li key={i} className="card dark:bg-slate-900 dark:border-slate-800 flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 card border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Note: “Publish to web” makes the report publicly viewable by anyone with the link —
          fine for a demo or college project, not for private data.
        </p>
      </div>
    </div>
  )
}

export function PowerBI() {
  if (!EMBED_URL) return <SetupGuide />

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="px-4 md:px-6 py-3 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Power BI Dashboard</h1>
      </div>
      <div className="flex-1 bg-slate-100 dark:bg-slate-950">
        <iframe
          title="Power BI report"
          src={EMBED_URL}
          className="w-full h-full border-0"
          allowFullScreen
        />
      </div>
    </div>
  )
}
