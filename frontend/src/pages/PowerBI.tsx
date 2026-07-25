// Power BI embed page.
//
// Set VITE_POWERBI_EMBED_URL (Vercel env + local .env.local) to the "Publish to
// web" link from Power BI Service. When it's set, the dashboard renders in an
// iframe; when it's not, this page shows step-by-step setup instructions so it
// never looks broken.

import styles from './PowerBI.module.css'

const EMBED_URL: string = import.meta.env.VITE_POWERBI_EMBED_URL ?? ''

function SetupGuide() {
  const steps = [
    ['Get your data', 'Open the Analytics page in this app and click "Download all (4 CSVs)". Those files are your data source.'],
    ['Sign in to Power BI', 'Go to app.powerbi.com and sign in (use a college / work email — personal Gmail is often rejected).'],
    ['Build a report', 'Upload a CSV, then drag fields onto the canvas to make charts. Save the report.'],
    ['Publish to web', 'In Power BI: File → Embed report → Publish to web (public). Copy the link it gives you.'],
    ['Add the link here', 'Set VITE_POWERBI_EMBED_URL to that link in Vercel (and .env.local), then redeploy. This page will show your dashboard.'],
  ]
  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div className={styles.pageHead}>
          <h1>Power BI Dashboard</h1>
          <p className={styles.sub}>
            Not connected yet. Follow these steps to embed your Power BI report here.
          </p>
        </div>

        <div className={styles.steps}>
          {steps.map(([title, body], i) => (
            <div key={i} className={styles.step}>
              <span className={styles.stepNum}>{i + 1}</span>
              <div>
                <p className={styles.stepTitle}>{title}</p>
                <p className={styles.stepBody}>{body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.noteCard}>
          <p>
            Note: "Publish to web" makes the report publicly viewable by anyone with the link —
            fine for a demo or college project, not for private data.
          </p>
        </div>
      </div>
    </div>
  )
}

export function PowerBI() {
  if (!EMBED_URL) return <SetupGuide />

  return (
    <div className={styles.page}>
      <div className={styles.embedShell}>
        <div className={styles.embedHead}>
          <h1>Power BI Dashboard</h1>
        </div>
        <div className={styles.embedFrame}>
          <iframe
            title="Power BI report"
            src={EMBED_URL}
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}
