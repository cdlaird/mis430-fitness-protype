export type UserRole = 'athlete' | 'coach'

export type User = {
  user_id: number
  role: UserRole
  email: string
  display_name: string
  is_paid: boolean
  paid_until: string | null
}

export type AutomatedDecision = {
  decision_id: number
  decision_type: string
  queue_position: number | null
  decision_payload: any
  created_at: string
}

export type GenerateDecisionInput = {
  goal: 'fat_loss' | 'strength' | 'endurance'
  experience: 'beginner' | 'intermediate' | 'advanced'
  sessionsPerWeek: number
  age: number
  sex: 'female' | 'male'
  heightCm: number
  weightKg: number
  notes?: string
}

export type Appeal = {
  appeal_id: number
  athlete_user_id: number
  decision_id: number
  appeal_content: string
  status: 'submitted' | 'assigned' | 'resolved'
  assigned_coach_user_id: number | null
  created_at: string
  updated_at: string
}

export type Explanation = {
  explanation_id: number
  appeal_id: number
  coach_user_id: number
  transparency_tier: 'basic' | 'enhanced'
  explanation_content: string
  created_at: string
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || ''

function apiUrl(path: string) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL}${path}`
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }
  return (await res.json()) as T
}

export function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const Api = {
  health: () => api<{ ok: true; mode: string }>('/api/health'),

  demoLogin: (role: UserRole, isPaid?: boolean) =>
    api<{ token: string; user: User }>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role, isPaid }),
    }),

  me: (token: string) => api<{ user: User; mode: string }>('/api/me', { headers: authHeader(token) }),

  latestDecision: (token: string) =>
    api<{ decision: AutomatedDecision }>('/api/decisions/latest', { headers: authHeader(token) }),

  generateDecision: (token: string, input: GenerateDecisionInput) =>
    api<{ decision: AutomatedDecision }>('/api/decisions/generate', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify(input),
    }),

  myAppeals: (token: string) =>
    api<{ appeals: Appeal[] }>('/api/appeals/me', { headers: authHeader(token) }),

  coachInbox: (token: string) =>
    api<{ appeals: Appeal[] }>('/api/appeals/inbox', { headers: authHeader(token) }),

  getAppeal: (token: string, appealId: number) =>
    api<{ appeal: Appeal; explanation: Explanation | null }>(`/api/appeals/${appealId}`, {
      headers: authHeader(token),
    }),

  createAppeal: (token: string, decisionId: number, appealContent: string) =>
    api<{ appeal: Appeal }>('/api/appeals', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ decisionId, appealContent }),
    }),

  resolveAppeal: (token: string, appealId: number, explanationContent: string, transparencyTier: 'basic' | 'enhanced') =>
    api<{ appeal: Appeal; explanation: Explanation }>(`/api/appeals/${appealId}/resolve`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ explanationContent, transparencyTier }),
    }),

  mockPaymentActivate: (token: string, activate: boolean) =>
    api<{ user: User; mode: string }>('/api/payments/mock-activate', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ activate }),
    }),
}

