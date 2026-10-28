const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'
import { authFetch } from './authFetch'

export interface RagSource {
  citation:    string
  description: string
}

export interface RagQueryResponse {
  answer:          string
  route:           'policy_lookup' | 'historical_lookup' | 'live_decision_explanation'
  filters_applied: Record<string, string | number>
  sources:         RagSource[]
  tokens_used:     number | null
}

export async function sendRagQuery(
  accessToken: string,
  query: string,
): Promise<RagQueryResponse> {
  const res = await authFetch(`${API_BASE}/api/rag/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query }),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as RagQueryResponse
}
