const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const jwt = require('jsonwebtoken')
const { z } = require('zod')

dotenv.config()

const app = express()
app.use(express.json())

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: false,
  }),
)

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

let dbMode = 'mock' // 'mock' | 'prisma'
let prisma = null

// -----------------------
// Mock data store
// -----------------------
const mockStore = (() => {
  const now = new Date()
  const users = [
    {
      user_id: 1001,
      role: 'coach',
      email: 'admin@fitness.demo',
      display_name: 'Admin Sam',
      is_paid: false,
      paid_until: null,
    },
    {
      user_id: 2001,
      role: 'athlete',
      email: 'athlete_unpaid@fitness.demo',
      display_name: 'User (Free)',
      is_paid: false,
      paid_until: null,
    },
    {
      user_id: 2002,
      role: 'athlete',
      email: 'athlete_paid@fitness.demo',
      display_name: 'User (Premium)',
      is_paid: true,
      paid_until: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
  ]

  // "queue position" is the decision we model for the athlete.
  const automated_decisions = [
    {
      decision_id: 3001,
      athlete_user_id: 2001,
      decision_type: 'queue_position',
      queue_position: 7,
      decision_payload: {
        recommendedWorkoutUnlocked: false,
        recommendedWorkouts: ['Interval cardio', 'Core + mobility'],
        premiumOptions: ['Heart-rate guided intervals', 'Macro-calibrated weekly plan'],
        planSummary: 'Starter fat-loss plan with two core sessions this week.',
        weeklySchedule: [
          { day: 'Monday', workout: 'Interval cardio', durationMin: 25, intensity: 'Moderate' },
          { day: 'Wednesday', workout: 'Core + mobility', durationMin: 30, intensity: 'Low' },
          { day: 'Friday', workout: 'Interval cardio', durationMin: 20, intensity: 'Moderate' },
        ],
        premiumScheduleExtras: [
          { day: 'Saturday', workout: 'Heart-rate guided intervals', durationMin: 30, intensity: 'Moderate-High' },
        ],
        nudge: 'Join the next session to improve consistency.',
        inputSnapshot: { age: 24, sex: 'female', heightCm: 165, weightKg: 68, sessionsPerWeek: 3 },
        fairness_note:
          'Recommendations prioritize your stated goals and training profile. Demographic assumptions are not used.',
      },
      created_at: now.toISOString(),
    },
    {
      decision_id: 3002,
      athlete_user_id: 2002,
      decision_type: 'queue_position',
      queue_position: 3,
      decision_payload: {
        recommendedWorkoutUnlocked: true,
        recommendedWorkouts: ['10-min mobility', '30-min strength', '5-min cooldown'],
        premiumOptions: ['Periodized progression block', 'Adaptive recovery day optimizer'],
        planSummary: 'Balanced premium plan with progression and recovery management.',
        weeklySchedule: [
          { day: 'Monday', workout: '30-min strength', durationMin: 30, intensity: 'Moderate' },
          { day: 'Tuesday', workout: '10-min mobility', durationMin: 10, intensity: 'Low' },
          { day: 'Thursday', workout: '30-min strength', durationMin: 35, intensity: 'Moderate-High' },
          { day: 'Saturday', workout: '5-min cooldown', durationMin: 15, intensity: 'Low' },
        ],
        premiumScheduleExtras: [
          { day: 'Sunday', workout: 'Adaptive recovery day optimizer', durationMin: 25, intensity: 'Low' },
        ],
        nudge: 'You are on track. Keep your streak going.',
        inputSnapshot: { age: 29, sex: 'male', heightCm: 178, weightKg: 80, sessionsPerWeek: 5 },
        fairness_note:
          'Recommendations prioritize your stated goals and training profile. Demographic assumptions are not used.',
      },
      created_at: now.toISOString(),
    },
  ]

  const appeals = []
  const explanations = []
  let nextAppealId = 4001
  let nextExplanationId = 5001
  let nextDecisionId = 3003

  return {
    users,
    automated_decisions,
    appeals,
    explanations,
    nextAppealId: () => nextAppealId++,
    nextExplanationId: () => nextExplanationId++,
    nextDecisionId: () => nextDecisionId++,
  }
})()

async function tryInitPrisma() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    try {
      const { PrismaClient } = require('@prisma/client')
      prisma = new PrismaClient()
      // If DB/table doesn't exist, this will throw and we fall back.
      await prisma.user.findFirst()
      dbMode = 'prisma'
      console.log('[server] Connected to MySQL via Prisma')
      return
    } catch (e) {
      console.warn('[server] Prisma init failed, using mock mode:', e.message)
      dbMode = 'mock'
    }
  } else {
    dbMode = 'mock'
  }
}

function signToken(user) {
  return jwt.sign({ sub: user.user_id, role: user.role }, JWT_SECRET, { expiresIn: '12h' })
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.auth = { userId: payload.sub, role: payload.role }
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function mustBe(role) {
  return (req, res, next) => {
    if (req.auth?.role !== role) return res.status(403).json({ error: 'Forbidden' })
    next()
  }
}

function toMockUser(userId) {
  return mockStore.users.find((u) => u.user_id === userId) || null
}

// -----------------------
// Endpoints
// -----------------------
app.get('/api/health', (_req, res) => res.json({ ok: true, mode: dbMode }))

app.post('/api/auth/demo-login', (req, res) => {
  const bodySchema = z.object({
    role: z.enum(['athlete', 'coach']),
    // If role=athlete and isPaid is true, we pick the paid demo user.
    isPaid: z.boolean().optional(),
  })

  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { role, isPaid } = parsed.data
  const user =
    role === 'coach'
      ? mockStore.users.find((u) => u.role === 'coach')
      : mockStore.users.find((u) => u.role === 'athlete' && u.is_paid === Boolean(isPaid))

  if (!user) return res.status(400).json({ error: 'Demo user not found' })

  const token = signToken(user)
  return res.json({ token, user })
})

app.get('/api/me', requireAuth, (req, res) => {
  const user = toMockUser(req.auth.userId)
  if (!user) return res.status(404).json({ error: 'User not found (mock)' })
  return res.json({ user, mode: dbMode })
})

app.post('/api/payments/mock-activate', requireAuth, mustBe('athlete'), (req, res) => {
  const bodySchema = z.object({ activate: z.boolean() })
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const user = toMockUser(req.auth.userId)
  if (!user) return res.status(404).json({ error: 'User not found (mock)' })

  const { activate } = parsed.data
  if (activate) {
    user.is_paid = true
    user.paid_until = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
  } else {
    user.is_paid = false
    user.paid_until = null
  }

  return res.json({ user, mode: dbMode })
})

app.get('/api/decisions/latest', requireAuth, mustBe('athlete'), (req, res) => {
  const user = toMockUser(req.auth.userId)
  if (!user) return res.status(404).json({ error: 'User not found (mock)' })

  const decision = mockStore.automated_decisions
    .filter((d) => d.athlete_user_id === user.user_id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]

  if (!decision) return res.status(404).json({ error: 'No decision found' })

  // Payment gating: free users keep base workouts, premium unlocks extra options.
  const payload = { ...(decision.decision_payload || {}) }
  if (!user.is_paid) {
    payload.recommendedWorkoutUnlocked = false
  } else {
    payload.recommendedWorkoutUnlocked = true
  }

  return res.json({
    decision: {
      decision_id: decision.decision_id,
      queue_position: decision.queue_position,
      decision_type: decision.decision_type,
      decision_payload: payload,
      created_at: decision.created_at,
    },
  })
})

app.post('/api/decisions/generate', requireAuth, mustBe('athlete'), (req, res) => {
  const user = toMockUser(req.auth.userId)
  if (!user) return res.status(404).json({ error: 'User not found (mock)' })

  const bodySchema = z.object({
    goal: z.enum(['fat_loss', 'strength', 'endurance']),
    experience: z.enum(['beginner', 'intermediate', 'advanced']),
    sessionsPerWeek: z.number().min(1).max(7),
    age: z.number().int().min(13).max(90),
    sex: z.enum(['female', 'male']),
    heightCm: z.number().min(120).max(230),
    weightKg: z.number().min(30).max(250),
    notes: z.string().max(500).optional(),
  })

  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { goal, experience, sessionsPerWeek, age, sex, heightCm, weightKg } = parsed.data

  // Mock queue position: more frequent training tends to place the user earlier.
  const base = 10 - sessionsPerWeek
  const expDelta = experience === 'advanced' ? -1 : experience === 'intermediate' ? 0 : 1
  const ageDelta = age >= 45 ? 1 : 0
  const queuePosition = Math.max(1, Math.min(10, Math.round(base + expDelta + ageDelta)))

  const workoutTemplates = {
    fat_loss: {
      unlocked: ['Interval cardio', 'Core + mobility'],
      premium: ['Heart-rate guided intervals', 'Macro-calibrated weekly plan'],
      summary: 'Focus on sustainable calorie burn and consistency.',
      nudge: 'Consistency beats intensity. Aim to hit your weekly sessions.',
    },
    strength: {
      unlocked: ['Progressive strength circuit', 'Upper/lower split'],
      premium: ['Periodized progression block', 'Volume auto-adjustment guidance'],
      summary: 'Prioritize compound lifts and progressive overload.',
      nudge: 'Progress your lifts gradually and track what feels stable.',
    },
    endurance: {
      unlocked: ['Zone 2 cardio', 'Cadence drills'],
      premium: ['Threshold interval progression', 'Adaptive recovery day optimizer'],
      summary: 'Build aerobic base first, then layer in speed work.',
      nudge: 'Keep a steady pace. Your plan adapts as you build stamina.',
    },
  }

  const chosen = workoutTemplates[goal]
  const unlocked = Boolean(user.is_paid)
  const scheduleDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const baseDuration = goal === 'strength' ? 35 : goal === 'endurance' ? 40 : 30
  const weeklySchedule = Array.from({ length: sessionsPerWeek }, (_, i) => {
    const day = scheduleDays[Math.floor((i * 7) / sessionsPerWeek)]
    const workout = chosen.unlocked[i % chosen.unlocked.length]
    return {
      day,
      workout,
      durationMin: Math.max(20, baseDuration + (experience === 'advanced' ? 10 : experience === 'intermediate' ? 5 : 0) - (age >= 50 ? 5 : 0)),
      intensity: experience === 'advanced' ? 'Moderate-High' : experience === 'intermediate' ? 'Moderate' : 'Low-Moderate',
    }
  })
  const premiumScheduleExtras = [
    {
      day: 'Sunday',
      workout: chosen.premium[0],
      durationMin: goal === 'endurance' ? 45 : 30,
      intensity: 'Moderate',
    },
  ]

  const payload = {
    recommendedWorkoutUnlocked: unlocked,
    // Always include the workouts so that upgrading later can unlock them without regenerating.
    recommendedWorkouts: chosen.unlocked,
    premiumOptions: chosen.premium,
    planSummary: chosen.summary,
    weeklySchedule,
    premiumScheduleExtras,
    nudge: chosen.nudge,
    inputSnapshot: { age, sex, heightCm, weightKg, sessionsPerWeek },
    fairness_note:
      'We generate recommendations from your stated goals and activity level. We do not use demographic assumptions or sensitive body history.',
  }

  const decision = {
    decision_id: mockStore.nextDecisionId(),
    athlete_user_id: user.user_id,
    decision_type: 'queue_position',
    queue_position: queuePosition,
    decision_payload: payload,
    created_at: new Date().toISOString(),
  }

  mockStore.automated_decisions.push(decision)
  return res.status(201).json({
    decision: {
      decision_id: decision.decision_id,
      queue_position: decision.queue_position,
      decision_type: decision.decision_type,
      decision_payload: decision.decision_payload,
      created_at: decision.created_at,
    },
  })
})

app.post('/api/appeals', requireAuth, mustBe('athlete'), (req, res) => {
  const bodySchema = z.object({
    decisionId: z.number(),
    appealContent: z.string().min(10).max(2000),
  })
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { decisionId, appealContent } = parsed.data
  const user = toMockUser(req.auth.userId)
  if (!user) return res.status(404).json({ error: 'User not found (mock)' })

  const decision = mockStore.automated_decisions.find((d) => d.decision_id === decisionId)
  if (!decision) return res.status(404).json({ error: 'Decision not found' })
  if (decision.athlete_user_id !== user.user_id) return res.status(403).json({ error: 'Forbidden' })

  const appeal = {
    appeal_id: mockStore.nextAppealId(),
    athlete_user_id: user.user_id,
    decision_id: decisionId,
    appeal_content: appealContent,
    status: 'submitted',
    assigned_coach_user_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  mockStore.appeals.push(appeal)
  return res.status(201).json({ appeal })
})

app.get('/api/appeals/me', requireAuth, mustBe('athlete'), (req, res) => {
  const user = toMockUser(req.auth.userId)
  if (!user) return res.status(404).json({ error: 'User not found (mock)' })

  const myAppeals = mockStore.appeals
    .filter((a) => a.athlete_user_id === user.user_id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return res.json({ appeals: myAppeals })
})

app.get('/api/appeals/inbox', requireAuth, mustBe('coach'), (req, res) => {
  const coach = toMockUser(req.auth.userId)
  if (!coach) return res.status(404).json({ error: 'Coach not found (mock)' })

  const inbox = mockStore.appeals
    .filter((a) => a.status === 'submitted' || a.assigned_coach_user_id === coach.user_id || a.status === 'assigned')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return res.json({ appeals: inbox })
})

app.get('/api/appeals/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const appeal = mockStore.appeals.find((a) => a.appeal_id === id)
  if (!appeal) return res.status(404).json({ error: 'Not found' })

  const isAthleteOwner = appeal.athlete_user_id === req.auth.userId
  const isCoach = req.auth.role === 'coach'

  // Admins should be able to open any appeal from the inbox, even before assignment.
  if (!isAthleteOwner && !isCoach) return res.status(403).json({ error: 'Forbidden' })

  const explanation = mockStore.explanations.find((e) => e.appeal_id === id) || null
  return res.json({ appeal, explanation })
})

app.post('/api/appeals/:id/resolve', requireAuth, mustBe('coach'), (req, res) => {
  const id = Number(req.params.id)
  const bodySchema = z.object({
    explanationContent: z.string().min(10).max(4000),
    transparencyTier: z.enum(['basic', 'enhanced']).optional(),
  })
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const appeal = mockStore.appeals.find((a) => a.appeal_id === id)
  if (!appeal) return res.status(404).json({ error: 'Appeal not found' })
  if (appeal.status === 'resolved') return res.status(400).json({ error: 'Already resolved' })

  const coach = toMockUser(req.auth.userId)
  if (!coach) return res.status(404).json({ error: 'Coach not found (mock)' })

  // Assign to this coach and resolve.
  appeal.assigned_coach_user_id = coach.user_id
  appeal.status = 'resolved'
  appeal.updated_at = new Date().toISOString()

  const explanation = {
    explanation_id: mockStore.nextExplanationId(),
    appeal_id: id,
    coach_user_id: coach.user_id,
    transparency_tier: parsed.data.transparencyTier || 'basic',
    explanation_content: parsed.data.explanationContent,
    created_at: new Date().toISOString(),
  }
  mockStore.explanations.push(explanation)

  return res.json({ appeal, explanation })
})

// Simple error handler
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})

;(async () => {
  await tryInitPrisma()
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT} (mode=${dbMode})`)
  })
})()

