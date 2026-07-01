const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'
import { authFetch } from './authFetch'

export interface ChatMessageResponse {
  user_message_id:   number
  session_id:        string
  intent:            string
  intent_confidence: number
  threshold_applied: boolean
  context_data:      Record<string, unknown>
  reply:             string
  model_loaded:      boolean
}

export async function sendChatMessage(
  accessToken: string,
  message: string,
  sessionId?: string,
): Promise<ChatMessageResponse> {
  const payload: Record<string, string> = { message }
  if (sessionId) payload.session_id = sessionId

  const res = await authFetch(`${API_BASE}/api/chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as ChatMessageResponse
}
