import { Fragment, useEffect, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getAllOrders, getAgentOrders, updateOrderStatus, bulkCreateOrders, createOrder,
  type OrderListItem, type OrderListResponse, type BulkCreateResponse,
} from '../api/orders'
import { VALID_AREAS as AREAS } from '../api/analytics'
import styles from './Orders.module.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES   = ['pending', 'in_transit', 'delivered', 'failed', 'postponed']
const RISK_LEVELS = ['low', 'medium', 'high']

// Area centroid coordinates — auto-fills lat/lon on manual entry so a manager
// doesn't need to know exact GPS coordinates. Must match backend
// analytics_service.AREA_COORDS exactly.
const AREA_COORDS: Record<string, [number, number]> = {
  'Anna Nagar':     [13.0850, 80.2101],
  'T Nagar':        [13.0418, 80.2341],
  'Velachery':      [12.9815, 80.2180],
  'Adyar':          [13.0063, 80.2574],
  'Porur':          [13.0358, 80.1567],
  'Mylapore':       [13.0339, 80.2619],
  'Nungambakkam':   [13.0604, 80.2418],
  'Guindy':         [13.0067, 80.2206],
  'Tambaram':       [12.9249, 80.1000],
  'Sholinganallur': [12.9010, 80.2279],
  'Thiruvanmiyur':  [12.9830, 80.2594],
  'Besant Nagar':   [13.0002, 80.2666],
  'Kilpauk':        [13.0827, 80.2367],
  'Egmore':         [13.0732, 80.2609],
  'Vadapalani':     [13.0503, 80.2121],
  'Koyambedu':      [13.0694, 80.1948],
  'Ambattur':       [13.1143, 80.1548],
  'Perambur':       [13.1179, 80.2419],
  'Chromepet':      [12.9516, 80.1462],
  'Saidapet':       [13.0212, 80.2219],
}

const STATUS_PILL: Record<string, string> = {
  pending:    styles.pillPending,
  in_transit: styles.pillIn_transit,
  delivered:  styles.pillDelivered,
  failed:     styles.pillFailed,
  postponed:  styles.pillPostponed,
}

const RISK_PILL: Record<string, string> = {
  low:    styles.pillLow,
  medium: styles.pillMedium,
  high:   styles.pillHigh,
}

// Mirrors backend _AGENT_TRANSITIONS
const AGENT_TRANSITIONS: Record<string, ('delivered' | 'failed' | 'postponed')[]> = {
  pending:    ['postponed'],
  in_transit: ['delivered', 'failed', 'postponed'],
  postponed:  [],
  delivered:  [],
  failed:     [],
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtWindow(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1)
}

function extractMsg(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return fallback
}

// ── Shared UI atoms ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.pill} ${STATUS_PILL[status] ?? styles.pillPostponed}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return <span className={styles.pillNone}>—</span>
  return (
    <span className={`${styles.pill} ${RISK_PILL[risk] ?? styles.pillPostponed}`}>
      {risk}
    </span>
  )
}

function FilterSelect({
  value, onChange, children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={styles.filterSelect}>
      {children}
    </select>
  )
}

function PageSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div className={styles.skeleton}>
          <div className={styles.skelBlock} style={{ height: 40, width: 200 }} />
          <div className={styles.skelBlock} style={{ height: 48 }} />
          <div className={styles.skelBlock} style={{ height: 288 }} />
        </div>
      </div>
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div className={styles.errorCard}>
          <p className={styles.title}>Failed to load orders</p>
          <p className={styles.msg}>{message}</p>
        </div>
      </div>
    </div>
  )
}

// ── Manual order entry ────────────────────────────────────────────────────────

function CreateOrderModal({
  accessToken,
  onClose,
  onSuccess,
}: {
  accessToken: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [customerName, setCustomerName]       = useState('')
  const [customerPhone, setCustomerPhone]     = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [area, setArea]                       = useState<string>(AREAS[0])
  const [residenceType, setResidenceType]     = useState('apartment')
  const [packageSize, setPackageSize]         = useState('medium')
  const [timeWindow, setTimeWindow]           = useState('morning')
  const [deadline, setDeadline]               = useState('')
  const [paymentAmount, setPaymentAmount]     = useState('')
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const [lat, lon] = AREA_COORDS[area] ?? [13.0827, 80.2707]
      await createOrder(accessToken, {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        customer_address: customerAddress.trim(),
        area,
        latitude: lat,
        longitude: lon,
        residence_type: residenceType,
        package_size: packageSize,
        time_window: timeWindow,
        deadline: new Date(deadline).toISOString(),
        payment_amount: Number(paymentAmount),
      })
      onSuccess()
    } catch (err) {
      setError(extractMsg(err, 'Failed to create order.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h2>Add Order</h2>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Customer name</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} required className={styles.formInput} />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Phone (optional)</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="10-digit number" className={styles.formInput} />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Address</label>
            <input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} required className={styles.formInput} />
          </div>
          <div className={styles.formGrid2}>
            <div>
              <label className={styles.formLabel}>Area</label>
              <select value={area} onChange={e => setArea(e.target.value)} className={styles.formInput}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.formLabel}>Residence</label>
              <select value={residenceType} onChange={e => setResidenceType(e.target.value)} className={styles.formInput}>
                <option value="apartment">Apartment</option>
                <option value="independent">Independent</option>
              </select>
            </div>
          </div>
          <div className={styles.formGrid2}>
            <div>
              <label className={styles.formLabel}>Package size</label>
              <select value={packageSize} onChange={e => setPackageSize(e.target.value)} className={styles.formInput}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div>
              <label className={styles.formLabel}>Time window</label>
              <select value={timeWindow} onChange={e => setTimeWindow(e.target.value)} className={styles.formInput}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </div>
          </div>
          <div className={styles.formGrid2}>
            <div>
              <label className={styles.formLabel}>Deadline</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                required
                className={styles.formInput}
              />
            </div>
            <div>
              <label className={styles.formLabel}>Payment (₹)</label>
              <input
                type="number" min="0" step="0.01"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                required
                className={styles.formInput}
              />
            </div>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={styles.confirmBtn}>
              {saving ? 'Creating…' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Bulk Upload ────────────────────────────────────────────────────────────────

const BULK_COLS = [
  'customer_name', 'customer_phone', 'customer_address', 'area',
  'residence_type', 'package_size', 'time_window', 'deadline',
  'payment_amount', 'latitude', 'longitude', 'is_urgent',
] as const

const VALID_RESIDENCE_B = ['apartment', 'independent']
const VALID_PACKAGES_B  = ['small', 'medium', 'large']
const VALID_WINDOWS_B   = ['morning', 'afternoon', 'evening']

interface ParsedRow {
  rowNum: number
  data: Record<string, string>
  errors: string[]
}

function parseCSVText(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/).filter(l => l.trim())) {
    const cells: string[] = []
    let cell = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cell += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) {
        cells.push(cell.trim()); cell = ''
      } else {
        cell += ch
      }
    }
    cells.push(cell.trim())
    rows.push(cells)
  }
  return rows
}

function validateBulkRow(data: Record<string, string>, rowNum: number): ParsedRow {
  const errors: string[] = []
  if (!data.customer_name?.trim())           errors.push('customer_name required')
  if (!data.customer_address?.trim())         errors.push('customer_address required')
  const phone = data.customer_phone?.trim()
  if (phone && (!/^\d+$/.test(phone) || phone.length < 10 || phone.length > 15))
    errors.push('customer_phone: 10–15 digits only (no + or -)')
  if (!AREAS.includes(data.area))     errors.push(`area: ${AREAS.join(' | ')}`)
  if (!VALID_RESIDENCE_B.includes(data.residence_type)) errors.push('residence_type: apartment | independent')
  if (!VALID_PACKAGES_B.includes(data.package_size))    errors.push('package_size: small | medium | large')
  if (!VALID_WINDOWS_B.includes(data.time_window))      errors.push('time_window: morning | afternoon | evening')
  if (isNaN(new Date(data.deadline).getTime()))          errors.push('deadline: invalid datetime')
  const amt = Number(data.payment_amount)
  if (isNaN(amt) || amt <= 0)                errors.push('payment_amount: positive number')
  const lat = Number(data.latitude)
  if (isNaN(lat) || lat < -90 || lat > 90)   errors.push('latitude: -90 to 90')
  const lon = Number(data.longitude)
  if (isNaN(lon) || lon < -180 || lon > 180) errors.push('longitude: -180 to 180')
  return { rowNum, data, errors }
}

function downloadCSVTemplate() {
  const sample = [
    'Raj Kumar', '9876543210', '45 Main Street', 'Anna Nagar',
    'apartment', 'medium', 'morning', '2026-07-10T10:00:00',
    '250.00', '13.0827', '80.2707', 'false',
  ]
  const csv = `${BULK_COLS.join(',')}\n${sample.join(',')}\n`
  const a   = document.createElement('a')
  a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'lastmeter_bulk_template.csv'
  a.click()
}

function BulkUploadModal({
  accessToken, onClose, onSuccess,
}: {
  accessToken: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [step,     setStep]     = useState<'upload' | 'preview' | 'results'>('upload')
  const [rows,     setRows]     = useState<ParsedRow[]>([])
  const [results,  setResults]  = useState<BulkCreateResponse | null>(null)
  const [busy,     setBusy]     = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)

  function processFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const [, ...dataLines] = parseCSVText(text) // skip header
      if (!dataLines.length) return
      const parsed = dataLines.map((cells, i) => {
        const data: Record<string, string> = {}
        BULK_COLS.forEach((col, j) => { data[col] = cells[j] ?? '' })
        return validateBulkRow(data, i + 2)
      })
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function handleUpload() {
    const valid = rows.filter(r => r.errors.length === 0)
    if (!valid.length) return
    setBusy(true)
    setSubmitErr(null)
    try {
      const orders = valid.map(r => ({
        customer_name:    r.data.customer_name,
        customer_phone:   r.data.customer_phone || null,
        customer_address: r.data.customer_address,
        area:             r.data.area,
        residence_type:   r.data.residence_type,
        package_size:     r.data.package_size,
        time_window:      r.data.time_window,
        deadline:         r.data.deadline,
        payment_amount:   Number(r.data.payment_amount),
        latitude:         Number(r.data.latitude),
        longitude:        Number(r.data.longitude),
        is_urgent:        r.data.is_urgent === 'true',
      }))
      const res = await bulkCreateOrders(accessToken, orders)
      setResults(res)
      setStep('results')
      if (res.created > 0) setTimeout(onSuccess, 1200)
    } catch {
      setSubmitErr('Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const validCount   = rows.filter(r => r.errors.length === 0).length
  const invalidCount = rows.length - validCount

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.modalWide}`}>

        {/* Header */}
        <div className={styles.bulkHead}>
          <div>
            <h2>Bulk Order Upload</h2>
            <p className={styles.bulkSub}>
              {step === 'upload'  ? 'Upload a CSV file to create multiple orders at once' :
               step === 'preview' ? `${rows.length} rows parsed · ${validCount} valid · ${invalidCount} invalid` :
               'Upload complete'}
            </p>
          </div>
          <button onClick={onClose} className={styles.modalClose}>×</button>
        </div>

        {/* Body */}
        <div className={styles.bulkBody}>

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <>
              <div className={styles.templateBox}>
                <div>
                  <p className={styles.title}>Download CSV Template</p>
                  <p className={styles.desc}>Correct column order with a sample row</p>
                </div>
                <button onClick={downloadCSVTemplate} className={styles.templateBtn}>
                  ⬇ Template
                </button>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneOver : ''}`}
              >
                <p className={styles.icon}>📋</p>
                <p className={styles.title}>Drop your CSV here or click to browse</p>
                <p className={styles.desc}>Max 200 rows · UTF-8 encoded</p>
                <label className={styles.browseBtn}>
                  Browse File
                  <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
                </label>
              </div>

              <div className={styles.colGuide}>
                <p className={styles.lbl}>Columns (in order):</p>
                <p className={styles.colsMono}>{BULK_COLS.join(', ')}</p>
                <p>Areas: {AREAS.join(' · ')}</p>
                <p>Package: small · medium · large &nbsp;|&nbsp; Window: morning · afternoon · evening</p>
                <p>Deadline: ISO e.g. <span className={styles.mono}>2026-07-10T10:00:00</span> &nbsp;|&nbsp; is_urgent: true or false</p>
              </div>
            </>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 'preview' && (
            <>
              {invalidCount > 0 && (
                <div className={styles.warnBox}>
                  <span>⚠</span>
                  <p className={styles.txt}>
                    <strong>{invalidCount} invalid row{invalidCount !== 1 ? 's' : ''}</strong> will be skipped.
                    {validCount > 0
                      ? ` Proceeding will create ${validCount} valid order${validCount !== 1 ? 's' : ''}.`
                      : ' Fix the CSV and re-upload.'}
                  </p>
                </div>
              )}

              <div className={styles.previewWrap}>
                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      {['#', 'Customer', 'Address', 'Area', 'Package', 'Window', '₹', ''].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.rowNum} className={row.errors.length ? styles.rowInvalid : ''}>
                        <td className={styles.dim}>{row.rowNum}</td>
                        <td>{row.data.customer_name}</td>
                        <td className={styles.muted}>{row.data.customer_address}</td>
                        <td className={styles.muted}>{row.data.area}</td>
                        <td className={styles.muted}>{row.data.package_size}</td>
                        <td className={styles.muted}>{row.data.time_window}</td>
                        <td className={styles.muted}>{row.data.payment_amount}</td>
                        <td style={{ textAlign: 'center' }}>
                          {row.errors.length === 0
                            ? <span className={styles.checkOk}>✓</span>
                            : <span title={row.errors.join('; ')} className={styles.checkBad}>✗</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.some(r => r.errors.length > 0) && (
                <div>
                  {rows.filter(r => r.errors.length > 0).map(r => (
                    <p key={r.rowNum} className={styles.rowErrText}>
                      Row {r.rowNum}: {r.errors.join(' · ')}
                    </p>
                  ))}
                </div>
              )}

              {submitErr && <p className={styles.formError}>{submitErr}</p>}
            </>
          )}

          {/* ── Step 3: Results ── */}
          {step === 'results' && results && (
            <>
              <div className={styles.resultGrid}>
                <div className={styles.resultCard}>
                  <p className={`${styles.num} ${styles.numGood}`}>{results.created}</p>
                  <p className={styles.lbl}>Created</p>
                </div>
                <div className={styles.resultCard}>
                  <p className={`${styles.num} ${styles.numBad}`}>{results.total - results.created}</p>
                  <p className={styles.lbl}>Failed</p>
                </div>
                <div className={styles.resultCard}>
                  <p className={`${styles.num} ${styles.numNeutral}`}>{results.total}</p>
                  <p className={styles.lbl}>Submitted</p>
                </div>
              </div>

              {results.created > 0 && (
                <div className={styles.successBox}>
                  <span>✓</span>
                  <p className={styles.txt}>
                    {results.created} order{results.created !== 1 ? 's' : ''} created with AI risk assessment. Refreshing list…
                  </p>
                </div>
              )}

              {results.results.some(r => r.status === 'error') && (
                <div>
                  <p className={styles.muted} style={{ fontSize: '0.76rem', fontWeight: 600, marginBottom: 4 }}>Row errors:</p>
                  {results.results.filter(r => r.status === 'error').map(r => (
                    <p key={r.row} className={styles.rowErrText}>
                      Row {r.row}: {Object.values(r.errors ?? {}).join(' · ')}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.bulkFooter}>
          {step === 'preview' && (
            <button onClick={() => { setStep('upload'); setRows([]) }} className={styles.reuploadLink}>
              ← Re-upload
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === 'upload' && (
            <button onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <button onClick={() => void handleUpload()} disabled={busy || validCount === 0} className={styles.confirmBtn}>
              {busy ? 'Creating…' : `Upload ${validCount} Order${validCount !== 1 ? 's' : ''}`}
            </button>
          )}
          {step === 'results' && (
            <button onClick={onClose} className={styles.confirmBtn}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MANAGER ORDERS ─────────────────────────────────────────────────────────────

type SortBy = 'created_at' | 'deadline' | 'risk_score' | 'payment_amount'

function ManagerOrders({ accessToken }: { accessToken: string }) {
  const navigate = useNavigate()
  // Filter state
  const [searchInput, setSearchInput] = useState('')
  const [search,      setSearch]      = useState('')
  const [area,        setArea]        = useState('')
  const [status,      setStatus]      = useState('')
  const [riskLevel,   setRiskLevel]   = useState('')
  const [sortBy,      setSortBy]      = useState<SortBy>('created_at')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [page,        setPage]        = useState(1)
  const [refreshKey,  setRefreshKey]  = useState(0)
  const [showBulk,    setShowBulk]    = useState(false)
  const [showCreate,  setShowCreate]  = useState(false)

  // Data state
  const [dataState, setDataState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; result: OrderListResponse }
  >({ status: 'loading' })

  // Expanded row for inline detail view
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setDataState({ status: 'loading' })

    getAllOrders(accessToken, {
      search:    search || undefined,
      area:      area || undefined,
      status:    status || undefined,
      riskLevel: riskLevel || undefined,
      sortBy, sortDir, page,
      perPage: 20,
    })
      .then(result => { if (!cancelled) setDataState({ status: 'success', result }) })
      .catch((err: unknown) => {
        if (!cancelled) setDataState({ status: 'error', message: extractMsg(err, 'Unable to load orders.') })
      })

    return () => { cancelled = true }
  }, [accessToken, search, area, status, riskLevel, sortBy, sortDir, page, refreshKey])

  function commitSearch() {
    setSearch(searchInput.trim())
    setPage(1)
  }

  function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitSearch()
  }

  function changeFilter(setter: (v: string) => void, v: string) {
    setter(v)
    setPage(1)
  }

  function toggleSort(field: SortBy) {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  function sortIcon(field: SortBy) {
    if (sortBy !== field) return null
    return <span className={styles.sortArrow}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (dataState.status === 'loading') return <PageSkeleton />
  if (dataState.status === 'error')   return <ErrorCard message={dataState.message} />

  const { data, pagination } = dataState.result

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {showCreate && (
          <CreateOrderModal
            accessToken={accessToken}
            onClose={() => setShowCreate(false)}
            onSuccess={() => { setShowCreate(false); setRefreshKey(k => k + 1) }}
          />
        )}

        {showBulk && (
          <BulkUploadModal
            accessToken={accessToken}
            onClose={() => setShowBulk(false)}
            onSuccess={() => { setShowBulk(false); setRefreshKey(k => k + 1) }}
          />
        )}

        <div className={styles.pageHead}>
          <h1>
            All Orders
            <span className={styles.count}>({pagination.total})</span>
          </h1>
          <div className={styles.headActions}>
            <button onClick={() => setShowCreate(true)} className={styles.btnGold}>
              + Add Order
            </button>
            <button onClick={() => setShowBulk(true)} className={styles.btnGhost}>
              ⬆ Bulk Upload
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          <div className={styles.searchWrap}>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Order # or customer…"
            />
            <button onClick={commitSearch}>Search</button>
          </div>

          <FilterSelect value={area} onChange={v => changeFilter(setArea, v)}>
            <option value="">All Areas</option>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </FilterSelect>

          <FilterSelect value={status} onChange={v => changeFilter(setStatus, v)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </FilterSelect>

          <FilterSelect value={riskLevel} onChange={v => changeFilter(setRiskLevel, v)}>
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
          </FilterSelect>

          {(search || area || status || riskLevel) && (
            <button
              onClick={() => {
                setSearchInput(''); setSearch(''); setArea('')
                setStatus(''); setRiskLevel(''); setPage(1)
              }}
              className={styles.clearLink}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Mobile card list (< md) */}
        <div className={styles.mobileList}>
          {data.length === 0 ? (
            <div className={styles.emptyState}>No orders match the current filters.</div>
          ) : data.map(order => (
            <div key={`m-${order.id}`} className={styles.mCard}>
              <div
                onClick={() => setExpandedId(id => id === order.id ? null : order.id)}
                className={styles.mCardHead}
              >
                <div className={styles.mCardTop}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={styles.mCardChips}>
                      <span className={styles.orderNo}>{order.order_number}</span>
                      {order.is_urgent && <span className={styles.urgentTag}>URGENT</span>}
                      <StatusBadge status={order.status} />
                      <RiskBadge risk={order.risk_level} />
                    </div>
                    <p className={styles.mCardCust}>{order.customer_name}</p>
                    <p className={styles.mCardMeta}>
                      {order.area} · {order.agent_name ?? 'Unassigned'} · {fmtWindow(order.time_window)}
                    </p>
                    <p className={styles.mCardMeta}>Deadline: {fmtDate(order.deadline)}</p>
                  </div>
                  <span className={styles.mCardChevron}>{expandedId === order.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedId === order.id && (
                <div className={styles.mCardDetail}>
                  <div className={styles.detailGrid}>
                    <div>
                      <p className={styles.detailLabel}>Address</p>
                      <p className={styles.detailVal}>{order.customer_address}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Phone</p>
                      <p className={styles.detailVal}>{order.customer_phone ?? '—'}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Package</p>
                      <p className={styles.detailVal}>{fmtWindow(order.package_size)}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Payment</p>
                      <p className={styles.detailVal}>₹{order.payment_amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Decision</p>
                      <p className={styles.detailVal}>{order.decision ?? '—'}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Risk Score</p>
                      <p className={styles.detailVal}>{order.risk_score ?? '—'}</p>
                    </div>
                    {order.failure_reason && (
                      <div className={styles.full}>
                        <p className={styles.detailLabel}>Failure Reason</p>
                        <p className={styles.detailValFail}>{order.failure_reason}</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => navigate(`/orders/${order.id}`)} className={styles.viewLink}>
                    View full detail →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop table (≥ md) */}
        <div className={styles.tableCard}>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th className={styles.sortable} onClick={() => toggleSort('risk_score')}>
                    Risk {sortIcon('risk_score')}
                  </th>
                  <th>Window</th>
                  <th className={styles.sortable} onClick={() => toggleSort('deadline')}>
                    Deadline {sortIcon('deadline')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.emptyState}>
                      No orders match the current filters.
                    </td>
                  </tr>
                ) : data.map(order => (
                  <Fragment key={order.id}>
                    {/* Main row */}
                    <tr
                      onClick={() => setExpandedId(id => id === order.id ? null : order.id)}
                      className={styles.dataRow}
                    >
                      <td>
                        <span className={styles.orderNo}>{order.order_number}</span>
                        {order.is_urgent && <span className={styles.urgentTag}>URGENT</span>}
                      </td>
                      <td>{order.customer_name}</td>
                      <td className={styles.muted}>{order.area}</td>
                      <td className={styles.muted}>{order.agent_name ?? '—'}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td><RiskBadge risk={order.risk_level} /></td>
                      <td className={styles.muted}>{fmtWindow(order.time_window)}</td>
                      <td className={styles.muted}>{fmtDate(order.deadline)}</td>
                    </tr>

                    {/* Expanded inline detail */}
                    {expandedId === order.id && (
                      <tr className={styles.detailRow}>
                        <td colSpan={8}>
                          <div className={styles.detailGrid}>
                            <div>
                              <p className={styles.detailLabel}>Address</p>
                              <p className={styles.detailVal}>{order.customer_address}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Phone</p>
                              <p className={styles.detailVal}>{order.customer_phone ?? '—'}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Package</p>
                              <p className={styles.detailVal}>{fmtWindow(order.package_size)}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Payment</p>
                              <p className={styles.detailVal}>₹{order.payment_amount.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Decision</p>
                              <p className={styles.detailVal}>{order.decision ?? '—'}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Risk Score</p>
                              <p className={styles.detailVal}>{order.risk_score ?? '—'}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Created</p>
                              <p className={styles.detailVal}>{fmtDate(order.created_at)}</p>
                            </div>
                            {order.failure_reason && (
                              <div className={styles.full}>
                                <p className={styles.detailLabel}>Failure Reason</p>
                                <p className={styles.detailValFail}>{order.failure_reason}</p>
                              </div>
                            )}
                          </div>
                          <button onClick={() => navigate(`/orders/${order.id}`)} className={styles.viewLink}>
                            View full detail →
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className={styles.pager}>
          <span>
            Showing {data.length} of {pagination.total} orders
            {pagination.pages > 1 && ` · Page ${pagination.page} of ${pagination.pages}`}
          </span>
          {pagination.pages > 1 && (
            <div className={styles.pagerBtns}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pagination.page <= 1}>
                Previous
              </button>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={pagination.page >= pagination.pages}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── AGENT ORDERS ───────────────────────────────────────────────────────────────

function AgentOrders({ accessToken }: { accessToken: string }) {
  const { user } = useAuth()

  // Filter state
  const [status,   setStatus]   = useState('')
  const [dateFrom, setDateFrom] = useState('')

  // Data state — orders held in state so status updates can patch them in place
  const [dataState, setDataState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; orders: OrderListItem[] }
  >({ status: 'loading' })

  // Per-order action panel state
  const [actionId,      setActionId]      = useState<number | null>(null)
  const [actionStatus,  setActionStatus]  = useState<'delivered' | 'failed' | 'postponed' | ''>('')
  const [failureReason, setFailureReason] = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [actionError,   setActionError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDataState({ status: 'loading' })

    getAgentOrders(accessToken, {
      status:   status || undefined,
      dateFrom: dateFrom ? new Date(dateFrom + 'T00:00:00').toISOString() : undefined,
      perPage:  100,
    })
      .then(res => { if (!cancelled) setDataState({ status: 'success', orders: res.data }) })
      .catch((err: unknown) => {
        if (!cancelled) setDataState({ status: 'error', message: extractMsg(err, 'Unable to load orders.') })
      })

    return () => { cancelled = true }
  }, [accessToken, status, dateFrom])

  function openAction(orderId: number) {
    setActionId(orderId)
    setActionStatus('')
    setFailureReason('')
    setActionError(null)
  }

  function closeAction() {
    setActionId(null)
    setActionStatus('')
    setFailureReason('')
    setActionError(null)
  }

  async function submitAction() {
    if (!actionId || !actionStatus) return

    const needsReason = actionStatus === 'failed' || actionStatus === 'postponed'
    if (needsReason && !failureReason.trim()) {
      setActionError('A reason is required for this status.')
      return
    }

    setSubmitting(true)
    setActionError(null)

    try {
      const updated = await updateOrderStatus(accessToken, actionId, {
        status: actionStatus,
        failure_reason: needsReason ? failureReason.trim() : null,
      })

      if (dataState.status === 'success') {
        setDataState({
          status: 'success',
          orders: dataState.orders.map(o =>
            o.id === actionId
              ? { ...o, status: updated.status as OrderListItem['status'], failure_reason: updated.failure_reason }
              : o
          ),
        })
      }
      closeAction()
    } catch (err: unknown) {
      setActionError(extractMsg(err, 'Status update failed. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (dataState.status === 'loading') return <PageSkeleton />
  if (dataState.status === 'error')   return <ErrorCard message={dataState.message} />

  const orders = dataState.orders

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div className={styles.pageHead}>
          <div>
            <h1>Order History</h1>
            <p className={styles.agentSub}>{user?.area}</p>
          </div>
        </div>

        {/* Filters */}
        <div className={styles.agentFilters}>
          <FilterSelect value={status} onChange={v => setStatus(v)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </FilterSelect>

          <div className={styles.dateField}>
            <label>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            {dateFrom && (
              <button onClick={() => setDateFrom('')} className={styles.clearLink}>
                Clear
              </button>
            )}
          </div>
        </div>

        <p className={styles.countLine}>
          {orders.length} order{orders.length !== 1 ? 's' : ''}
        </p>

        {orders.length === 0 ? (
          <div className={styles.emptyState}>No orders match the current filters.</div>
        ) : (
          <div className={styles.agentList}>
            {orders.map(order => {
              const transitions = AGENT_TRANSITIONS[order.status] ?? []
              const isExpanded  = actionId === order.id
              const needsReason = actionStatus === 'failed' || actionStatus === 'postponed'

              return (
                <div key={order.id} className={styles.agentCard}>
                  {/* Main row */}
                  <div className={styles.agentCardMain}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className={styles.top}>
                        <span className={styles.name}>{order.order_number}</span>
                        {order.is_urgent && <span className={styles.urgentTag}>URGENT</span>}
                        <StatusBadge status={order.status} />
                        <RiskBadge risk={order.risk_level} />
                      </div>
                      <p className={styles.cust}>{order.customer_name}</p>
                      <p className={styles.meta}>
                        {fmtWindow(order.time_window)} · Deadline {fmtDate(order.deadline)}
                      </p>
                      {order.failure_reason && (
                        <p className={styles.failMeta}>Reason: {order.failure_reason}</p>
                      )}
                    </div>

                    {transitions.length > 0 && (
                      <button
                        onClick={() => isExpanded ? closeAction() : openAction(order.id)}
                        className={styles.updateBtn}
                      >
                        {isExpanded ? 'Cancel' : 'Update'}
                      </button>
                    )}
                  </div>

                  {/* Action panel */}
                  {isExpanded && (
                    <div className={styles.actionPanel}>
                      <p className={styles.actionLabel}>Mark as</p>

                      <div className={styles.actionChips}>
                        {transitions.map(t => (
                          <button
                            key={t}
                            onClick={() => setActionStatus(t)}
                            className={`${styles.actionChip} ${actionStatus === t ? styles.actionChipSel : ''}`}
                          >
                            {fmtWindow(t)}
                          </button>
                        ))}
                      </div>

                      {actionStatus && needsReason && (
                        <div>
                          <label className={styles.reasonLabel}>
                            Reason <span className={styles.req}>*</span>
                          </label>
                          <textarea
                            value={failureReason}
                            onChange={e => setFailureReason(e.target.value)}
                            placeholder={
                              actionStatus === 'failed'
                                ? 'Why did this delivery fail?'
                                : 'Why is this being postponed?'
                            }
                            rows={2}
                            className={styles.reasonBox}
                          />
                        </div>
                      )}

                      {actionError && (
                        <p className={styles.actionError}>{actionError}</p>
                      )}

                      {actionStatus && (
                        <div className={styles.actionFooter}>
                          <button
                            onClick={() => void submitAction()}
                            disabled={submitting || (needsReason && !failureReason.trim())}
                            className={styles.confirmBtn}
                          >
                            {submitting ? 'Updating…' : 'Confirm'}
                          </button>
                          <button onClick={closeAction} disabled={submitting} className={styles.cancelBtn}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Orders() {
  const { user, access_token } = useAuth()

  if (user?.role === 'agent') return <AgentOrders accessToken={access_token!} />
  return <ManagerOrders accessToken={access_token!} />
}
