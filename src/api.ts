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

let apiRetryListener: ((message: string | null) => void) | null = null

export function setApiRetryListener(listener: ((message: string | null) => void) | null) {
  apiRetryListener = listener
}

function apiUrl(path: string) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL}${path}`
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const retryDelaysMs = [10000, 20000]

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const res = await fetch(apiUrl(path), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      })

      const shouldRetryByStatus = [502, 503, 504].includes(res.status)
      if (!res.ok) {
        if (shouldRetryByStatus && attempt < retryDelaysMs.length) {
          const nextDelay = retryDelaysMs[attempt]
          apiRetryListener?.(`Server is waking up, retrying in ${Math.round(nextDelay / 1000)}–20s...`)
          await wait(nextDelay)
          continue
        }
        apiRetryListener?.(null)
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text || res.statusText}`)
      }

      apiRetryListener?.(null)
      return (await res.json()) as T
    } catch (err: any) {
      const isNetworkError = String(err?.message || '').toLowerCase().includes('failed to fetch')
      if (isNetworkError && attempt < retryDelaysMs.length) {
        const nextDelay = retryDelaysMs[attempt]
        apiRetryListener?.(`Server is waking up, retrying in ${Math.round(nextDelay / 1000)}–20s...`)
        await wait(nextDelay)
        continue
      }

      apiRetryListener?.(null)
      if (isNetworkError) {
        throw new Error('Server is waking up. Please wait 10–20 seconds and try again.')
      }
      throw err
    }
  }

  // Safety fallback.
  apiRetryListener?.(null)
  throw new Error('Server is waking up. Please wait 10–20 seconds and try again.')
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

