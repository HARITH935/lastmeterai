const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'
import { authFetch } from './authFetch'

export interface AgentAccount {
  id: number
  username: string
  role: 'manager' | 'agent'
  name: string
  phone: string | null
  area: string | null
  city: string
  is_active: boolean
  notification_prefs: Record<string, boolean>
  created_at: string
}

export interface CreateAgentInput {
  username: string
  password: string
  name: string
  area: string
  phone?: string
}

export async function listAgentAccounts(accessToken: string): Promise<AgentAccount[]> {
  const res = await authFetch(`${API_BASE}/api/agents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return (body.agents ?? []) as AgentAccount[]
}

export async function createAgentAccount(
  accessToken: string,
  input: CreateAgentInput,
): Promise<AgentAccount> {
  const res = await authFetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as AgentAccount
}

// Deactivate (is_active: false) or reactivate (is_active: true) an agent.
// Soft-delete only — preserves order/decision history; deactivated agents
// just can't log in. Throws if the agent still has PENDING/IN_TRANSIT orders.
export async function setAgentActive(
  accessToken: string,
  agentId: number,
  isActive: boolean,
): Promise<AgentAccount> {
  const res = await authFetch(`${API_BASE}/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ is_active: isActive }),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as AgentAccount
}
