import { Fragment, useEffect, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getAllOrders, getAgentOrders, updateOrderStatus, bulkCreateOrders,
  type OrderListItem, type OrderListResponse, type BulkCreateResponse,
} from '../api/orders'

// ── Constants ──────────────────────────────────────────────────────────────────

const AREAS      = ['Anna Nagar', 'T Nagar', 'Velachery', 'Adyar', 'Porur']
const STATUSES   = ['pending', 'in_transit', 'delivered', 'failed', 'postponed']
const RISK_LEVELS = ['low', 'medium', 'high']

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-700',
  in_transit: 'bg-blue-50 text-blue-700',
  delivered:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-700',
  postponed:  'bg-slate-100 text-slate-600',
}

const RISK_BADGE: Record<string, string> = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  high:   'bg-red-50 text-red-700',
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
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return <span className="text-slate-300 text-xs">—</span>
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_BADGE[risk] ?? 'bg-slate-100 text-slate-600'}`}>
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
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
    >
      {children}
    </select>
  )
}

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="animate-pulse bg-slate-200 rounded-xl h-10 w-48" />
      <div className="animate-pulse bg-slate-200 rounded-xl h-12" />
      <div className="animate-pulse bg-slate-200 rounded-xl h-72" />
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm font-semibold text-red-600">Failed to load orders</p>
        <p className="text-xs text-red-500 mt-1">{message}</p>
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

const VALID_AREAS_B     = ['Anna Nagar', 'T Nagar', 'Velachery', 'Adyar', 'Porur']
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
  if (!VALID_AREAS_B.includes(data.area))     errors.push(`area: ${VALID_AREAS_B.join(' | ')}`)
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
    'Raj Kumar', '+91-9876543210', '45 Main Street', 'Anna Nagar',
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Bulk Order Upload</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'upload'  ? 'Upload a CSV file to create multiple orders at once' :
               step === 'preview' ? `${rows.length} rows parsed · ${validCount} valid · ${invalidCount} invalid` :
               'Upload complete'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none dark:hover:text-slate-300">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <>
              {/* Template row */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <div>
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Download CSV Template</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Correct column order with a sample row</p>
                </div>
                <button
                  onClick={downloadCSVTemplate}
                  className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors shrink-0"
                >
                  ⬇ Template
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
                className={`border-2 border-dashed rounded-2xl py-14 text-center transition-colors ${
                  dragOver
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Drop your CSV here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">Max 200 rows · UTF-8 encoded</p>
                <label className="mt-4 inline-block cursor-pointer text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 px-4 py-2 rounded-lg transition-colors">
                  Browse File
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
                </label>
              </div>

              {/* Column guide */}
              <div className="text-xs text-slate-500 space-y-1.5">
                <p className="font-semibold text-slate-700 dark:text-slate-300">Columns (in order):</p>
                <p className="font-mono bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-[10px] leading-relaxed break-all">
                  {BULK_COLS.join(', ')}
                </p>
                <p>Areas: {VALID_AREAS_B.join(' · ')}</p>
                <p>Package: small · medium · large &nbsp;|&nbsp; Window: morning · afternoon · evening</p>
                <p>Deadline: ISO e.g. <span className="font-mono">2026-07-10T10:00:00</span> &nbsp;|&nbsp; is_urgent: true or false</p>
              </div>
            </>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 'preview' && (
            <>
              {invalidCount > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <span className="text-amber-500 mt-0.5">⚠</span>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>{invalidCount} invalid row{invalidCount !== 1 ? 's' : ''}</strong> will be skipped.
                    {validCount > 0
                      ? ` Proceeding will create ${validCount} valid order${validCount !== 1 ? 's' : ''}.`
                      : ' Fix the CSV and re-upload.'}
                  </p>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      {['#', 'Customer', 'Address', 'Area', 'Package', 'Window', '₹', ''].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr
                        key={row.rowNum}
                        className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                          row.errors.length ? 'bg-red-50 dark:bg-red-950/20' : ''
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-400">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200 max-w-[100px] truncate">{row.data.customer_name}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">{row.data.customer_address}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.data.area}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.data.package_size}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.data.time_window}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.data.payment_amount}</td>
                        <td className="px-3 py-2 text-center">
                          {row.errors.length === 0
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span title={row.errors.join('; ')} className="text-red-500 cursor-help font-bold">✗</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.some(r => r.errors.length > 0) && (
                <div className="space-y-1">
                  {rows.filter(r => r.errors.length > 0).map(r => (
                    <p key={r.rowNum} className="text-[10px] text-red-600 dark:text-red-400">
                      Row {r.rowNum}: {r.errors.join(' · ')}
                    </p>
                  ))}
                </div>
              )}

              {submitErr && <p className="text-xs font-semibold text-red-600">{submitErr}</p>}
            </>
          )}

          {/* ── Step 3: Results ── */}
          {step === 'results' && results && (
            <>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="card">
                  <p className="text-3xl font-bold text-green-600">{results.created}</p>
                  <p className="text-xs text-slate-500 mt-1">Created</p>
                </div>
                <div className="card">
                  <p className="text-3xl font-bold text-red-500">{results.total - results.created}</p>
                  <p className="text-xs text-slate-500 mt-1">Failed</p>
                </div>
                <div className="card">
                  <p className="text-3xl font-bold text-slate-700 dark:text-slate-300">{results.total}</p>
                  <p className="text-xs text-slate-500 mt-1">Submitted</p>
                </div>
              </div>

              {results.created > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <span className="text-green-600">✓</span>
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                    {results.created} order{results.created !== 1 ? 's' : ''} created with AI risk assessment. Refreshing list…
                  </p>
                </div>
              )}

              {results.results.some(r => r.status === 'error') && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Row errors:</p>
                  {results.results.filter(r => r.status === 'error').map(r => (
                    <p key={r.row} className="text-[10px] text-red-600 dark:text-red-400">
                      Row {r.row}: {Object.values(r.errors ?? {}).join(' · ')}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          {step === 'preview' && (
            <button
              onClick={() => { setStep('upload'); setRows([]) }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              ← Re-upload
            </button>
          )}
          <div className="flex-1" />
          {step === 'upload' && (
            <button onClick={onClose} className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-4 py-2">
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <button
              onClick={handleUpload}
              disabled={busy || validCount === 0}
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg transition-colors"
            >
              {busy ? 'Creating…' : `Upload ${validCount} Order${validCount !== 1 ? 's' : ''}`}
            </button>
          )}
          {step === 'results' && (
            <button
              onClick={onClose}
              className="text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 px-6 py-2 rounded-lg transition-colors"
            >
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
    return <span className="ml-1 text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (dataState.status === 'loading') return <PageSkeleton />
  if (dataState.status === 'error')   return <ErrorCard message={dataState.message} />

  const { data, pagination } = dataState.result

  return (
    <div className="p-4 md:p-6 space-y-4">
      {showBulk && (
        <BulkUploadModal
          accessToken={accessToken}
          onClose={() => setShowBulk(false)}
          onSuccess={() => { setShowBulk(false); setRefreshKey(k => k + 1) }}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          All Orders
          <span className="ml-2 text-sm font-normal text-slate-400">({pagination.total})</span>
        </h1>
        <button
          onClick={() => setShowBulk(true)}
          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          ⬆ Bulk Upload
        </button>
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Order # or customer…"
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-40 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <button
            onClick={commitSearch}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            Search
          </button>
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
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Mobile card list (< md) */}
      <div className="md:hidden space-y-3">
        {data.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-sm text-slate-400">No orders match the current filters.</p>
          </div>
        ) : data.map(order => (
          <Fragment key={`m-${order.id}`} >
            <div className="card p-0 overflow-hidden">
              <div
                onClick={() => setExpandedId(id => id === order.id ? null : order.id)}
                className="p-4 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800">{order.order_number}</span>
                      {order.is_urgent && (
                        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1 rounded">URGENT</span>
                      )}
                      <StatusBadge status={order.status} />
                      <RiskBadge risk={order.risk_level} />
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5 truncate">{order.customer_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {order.area} · {order.agent_name ?? 'Unassigned'} · {fmtWindow(order.time_window)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Deadline: {fmtDate(order.deadline)}</p>
                  </div>
                  <span className="text-slate-300 text-xs shrink-0 pt-1">
                    {expandedId === order.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>
              {expandedId === order.id && (
                <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Address</p>
                      <p className="text-slate-700">{order.customer_address}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Phone</p>
                      <p className="text-slate-700">{order.customer_phone ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Package</p>
                      <p className="text-slate-700">{fmtWindow(order.package_size)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Payment</p>
                      <p className="text-slate-700">₹{order.payment_amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Decision</p>
                      <p className="text-slate-700">{order.decision ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Risk Score</p>
                      <p className="text-slate-700">{order.risk_score ?? '—'}</p>
                    </div>
                    {order.failure_reason && (
                      <div className="col-span-2">
                        <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Failure Reason</p>
                        <p className="text-red-600">{order.failure_reason}</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    View full detail →
                  </button>
                </div>
              )}
            </div>
          </Fragment>
        ))}
      </div>

      {/* Desktop table (≥ md) */}
      <div className="card overflow-hidden p-0 hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Order #</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Customer</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Area</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Agent</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th
                  className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                  onClick={() => toggleSort('risk_score')}
                >
                  Risk {sortIcon('risk_score')}
                </th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Window</th>
                <th
                  className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                  onClick={() => toggleSort('deadline')}
                >
                  Deadline {sortIcon('deadline')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-slate-400 py-12">
                    No orders match the current filters.
                  </td>
                </tr>
              ) : data.map(order => (
                <Fragment key={order.id}>
                  {/* Main row */}
                  <tr
                    onClick={() => setExpandedId(id => id === order.id ? null : order.id)}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{order.order_number}</span>
                      {order.is_urgent && (
                        <span className="ml-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1 rounded">
                          URGENT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate">{order.customer_name}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{order.area}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{order.agent_name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3"><RiskBadge risk={order.risk_level} /></td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtWindow(order.time_window)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(order.deadline)}</td>
                  </tr>

                  {/* Expanded inline detail */}
                  {expandedId === order.id && (
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Address</p>
                            <p className="text-slate-700">{order.customer_address}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Phone</p>
                            <p className="text-slate-700">{order.customer_phone ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Package</p>
                            <p className="text-slate-700">{fmtWindow(order.package_size)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Payment</p>
                            <p className="text-slate-700">₹{order.payment_amount.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Decision</p>
                            <p className="text-slate-700">{order.decision ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Risk Score</p>
                            <p className="text-slate-700">{order.risk_score ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Created</p>
                            <p className="text-slate-700">{fmtDate(order.created_at)}</p>
                          </div>
                          {order.failure_reason && (
                            <div className="col-span-2">
                              <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Failure Reason</p>
                              <p className="text-red-600">{order.failure_reason}</p>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => navigate(`/orders/${order.id}`)}
                          className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
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
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing {data.length} of {pagination.total} orders
          {pagination.pages > 1 && ` · Page ${pagination.page} of ${pagination.pages}`}
        </span>
        {pagination.pages > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={pagination.page >= pagination.pages}
              className="px-3 py-1.5 font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
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
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Order History</h1>
        <p className="text-xs text-slate-400 mt-0.5">{user?.area}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterSelect value={status} onChange={v => setStatus(v)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </FilterSelect>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400"
          />
          {dateFrom && (
            <button
              onClick={() => setDateFrom('')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        {orders.length} order{orders.length !== 1 ? 's' : ''}
      </p>

      {orders.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm text-slate-400">No orders match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const transitions = AGENT_TRANSITIONS[order.status] ?? []
            const isExpanded  = actionId === order.id
            const needsReason = actionStatus === 'failed' || actionStatus === 'postponed'

            return (
              <div key={order.id} className="card p-0 overflow-hidden">
                {/* Main row */}
                <div className="flex items-start justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{order.order_number}</span>
                      {order.is_urgent && (
                        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded">
                          URGENT
                        </span>
                      )}
                      <StatusBadge status={order.status} />
                      <RiskBadge risk={order.risk_level} />
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{order.customer_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmtWindow(order.time_window)} · Deadline {fmtDate(order.deadline)}
                    </p>
                    {order.failure_reason && (
                      <p className="text-xs text-red-500 mt-0.5">Reason: {order.failure_reason}</p>
                    )}
                  </div>

                  {transitions.length > 0 && (
                    <button
                      onClick={() => isExpanded ? closeAction() : openAction(order.id)}
                      className="shrink-0 ml-3 text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      {isExpanded ? 'Cancel' : 'Update'}
                    </button>
                  )}
                </div>

                {/* Action panel */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mark as</p>

                    <div className="flex gap-2 flex-wrap">
                      {transitions.map(t => (
                        <button
                          key={t}
                          onClick={() => setActionStatus(t)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                            actionStatus === t
                              ? 'border-blue-500 text-blue-600 bg-blue-50'
                              : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                          }`}
                        >
                          {fmtWindow(t)}
                        </button>
                      ))}
                    </div>

                    {actionStatus && needsReason && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          Reason <span className="text-red-500">*</span>
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
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 resize-none"
                        />
                      </div>
                    )}

                    {actionError && (
                      <p className="text-xs text-red-600">{actionError}</p>
                    )}

                    {actionStatus && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => void submitAction()}
                          disabled={submitting || (needsReason && !failureReason.trim())}
                          className="text-xs font-semibold px-4 py-1.5 text-white rounded-lg disabled:opacity-40 transition-opacity"
                          style={{ backgroundColor: '#2563EB' }}
                        >
                          {submitting ? 'Updating…' : 'Confirm'}
                        </button>
                        <button
                          onClick={closeAction}
                          disabled={submitting}
                          className="text-xs font-semibold px-4 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                        >
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
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Orders() {
  const { user, access_token } = useAuth()

  if (user?.role === 'agent') return <AgentOrders accessToken={access_token!} />
  return <ManagerOrders accessToken={access_token!} />
}
