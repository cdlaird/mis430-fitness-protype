import { useEffect, useMemo, useState } from 'react'
import { Api, type Appeal, type AutomatedDecision, type User, type UserRole } from './api'

type Page =
  | { name: 'login' }
  | { name: 'athlete' }
  | { name: 'coach' }
  | { name: 'appealDetail'; appealId: number; backTo: 'user' | 'admin' }

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: '11px 14px',
        borderRadius: 14,
        border: '1px solid rgba(0,0,0,0.08)',
        background: '#111827',
        color: '#fff',
        cursor: 'pointer',
        fontWeight: 700,
        boxShadow: '0 10px 30px rgba(0,0,0,0.07)',
        ...(props.style || {}),
      }}
    />
  )
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 18, padding: 16, background: '#fff', boxShadow: '0 18px 50px rgba(0,0,0,0.05)' }}>
      <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 14, letterSpacing: '-0.01em' }}>{props.title}</div>
      {props.children}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'login' })

  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<string>('unknown')
  const [error, setError] = useState<string | null>(null)

  const [decision, setDecision] = useState<AutomatedDecision | null>(null)
  const [myAppeals, setMyAppeals] = useState<Appeal[]>([])
  const [coachInbox, setCoachInbox] = useState<Appeal[]>([])

  const isAuthed = Boolean(token && user)
  const role: UserRole | null = user?.role ?? null

  const canSubmitAppeal = useMemo(() => {
    return role === 'athlete' && decision?.decision_id != null
  }, [role, decision?.decision_id])

  async function refreshAll() {
    if (!token) return
    setError(null)
    const me = await Api.me(token)
    setUser(me.user)
    setMode(me.mode)

    if (me.user.role === 'athlete') {
      const latest = await Api.latestDecision(token)
      setDecision(latest.decision)
      const appeals = await Api.myAppeals(token)
      setMyAppeals(appeals.appeals)
    } else {
      const inbox = await Api.coachInbox(token)
      setCoachInbox(inbox.appeals)
    }
  }

  useEffect(() => {
    Api.health()
      .then((h) => setMode(h.mode))
      .catch(() => setMode('unknown'))
  }, [])

  useEffect(() => {
    if (!token) return
    refreshAll().catch((e) => setError(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function demoLogin(nextRole: UserRole, isPaid?: boolean) {
    setError(null)
    try {
      const res = await Api.demoLogin(nextRole, isPaid)
      setToken(res.token)
      setUser(res.user)
      if (nextRole === 'athlete') setPage({ name: 'athlete' })
      else setPage({ name: 'coach' })
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function toggleMockPayment(activate: boolean) {
    if (!token) return
    setError(null)
    try {
      const res = await Api.mockPaymentActivate(token, activate)
      setUser(res.user)
      const latest = await Api.latestDecision(token)
      setDecision(latest.decision)
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function submitAppeal(appealContent: string) {
    if (!token || !decision) return
    setError(null)
    try {
      await Api.createAppeal(token, decision.decision_id, appealContent)
      const appeals = await Api.myAppeals(token)
      setMyAppeals(appeals.appeals)
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function generatePlan(input: {
    goal: 'fat_loss' | 'strength' | 'endurance'
    experience: 'beginner' | 'intermediate' | 'advanced'
    sessionsPerWeek: number
    age: number
    sex: 'female' | 'male'
    heightCm: number
    weightKg: number
    notes?: string
  }) {
    if (!token) return
    setError(null)
    try {
      const res = await Api.generateDecision(token, input)
      setDecision(res.decision)
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  const containerStyle: React.CSSProperties = {
    padding: '18px 14px 110px',
    maxWidth: 540,
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    color: '#111',
    background: 'linear-gradient(180deg, #ffffff 0%, rgba(124,58,237,0.06) 100%)',
    minHeight: '100svh',
  }

  return (
    <div style={containerStyle}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingTop: 4 }}>
        <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-0.02em' }}>Fitness Transparency</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#666' }}>API mode: {mode}</span>
          {isAuthed ? (
            <Button
              onClick={() => {
                setToken(null)
                setUser(null)
                setDecision(null)
                setMyAppeals([])
                setCoachInbox([])
                setPage({ name: 'login' })
              }}
              style={{ background: '#fff', color: '#111' }}
            >
              Log out
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid #f1c0c0', background: '#fff5f5', borderRadius: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
            {error}
          </div>
        </div>
      ) : null}

      {page.name === 'login' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="User Demo Login">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button onClick={() => demoLogin('athlete', false)}>Login as Free User</Button>
              <Button onClick={() => demoLogin('athlete', true)} style={{ background: '#0a7' }}>
                Login as Premium User
              </Button>
            </div>
          </Card>

          <Card title="Admin Demo Login">
            <Button onClick={() => demoLogin('coach')}>Login as Admin</Button>
            <p style={{ marginTop: 10, color: '#444' }}>Admins review appeals and write explanations.</p>
          </Card>
        </div>
      ) : null}

      {page.name === 'athlete' && role === 'athlete' && token && user ? (
        <AthleteDashboard
          user={user}
          decision={decision}
          appeals={myAppeals}
          onRefresh={() => refreshAll().catch((e) => setError(String(e?.message || e)))}
          onMockPayToggle={toggleMockPayment}
          onGeneratePlan={(input) => generatePlan(input)}
          onSubmitAppeal={submitAppeal}
          onOpenAppeal={(appealId) => setPage({ name: 'appealDetail', appealId, backTo: 'user' })}
          canSubmitAppeal={canSubmitAppeal}
        />
      ) : null}

      {page.name === 'coach' && role === 'coach' && token && user ? (
        <CoachDashboard
          user={user}
          inbox={coachInbox}
          onRefresh={() => refreshAll().catch((e) => setError(String(e?.message || e)))}
          onOpenAppeal={(appealId) => setPage({ name: 'appealDetail', appealId, backTo: 'admin' })}
        />
      ) : null}

      {page.name === 'appealDetail' && token ? (
        <AppealDetail
          token={token}
          appealId={page.appealId}
          backTo={page.backTo}
          onBack={() => {
            if (page.backTo === 'user') setPage({ name: 'athlete' })
            else setPage({ name: 'coach' })
          }}
          onResolved={() => refreshAll().catch((e) => setError(String(e?.message || e)))}
        />
      ) : null}
    </div>
  )
}

function AthleteDashboard(props: {
  user: User
  decision: AutomatedDecision | null
  appeals: Appeal[]
  onRefresh: () => void
  onMockPayToggle: (activate: boolean) => void
  onGeneratePlan: (input: {
    goal: 'fat_loss' | 'strength' | 'endurance'
    experience: 'beginner' | 'intermediate' | 'advanced'
    sessionsPerWeek: number
    age: number
    sex: 'female' | 'male'
    heightCm: number
    weightKg: number
    notes?: string
  }) => void | Promise<void>
  onSubmitAppeal: (content: string) => void
  onOpenAppeal: (appealId: number) => void
  canSubmitAppeal: boolean
}) {
  const [appealText, setAppealText] = useState('')
  const [showExplanationDetails, setShowExplanationDetails] = useState(false)

  const [goal, setGoal] = useState<'fat_loss' | 'strength' | 'endurance'>('fat_loss')
  const [experience, setExperience] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner')
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(3)
  const [age, setAge] = useState<number>(24)
  const [sex, setSex] = useState<'female' | 'male'>('female')
  const [heightFt, setHeightFt] = useState<number>(5)
  const [heightIn, setHeightIn] = useState<number>(7)
  const [weightLb, setWeightLb] = useState<number>(150)
  const [notes, setNotes] = useState<string>('')

  const workouts: string[] = Array.isArray(props.decision?.decision_payload?.recommendedWorkouts)
    ? props.decision!.decision_payload.recommendedWorkouts
    : []
  const unlocked = Boolean(props.decision?.decision_payload?.recommendedWorkoutUnlocked)
  const nudge = String(props.decision?.decision_payload?.nudge || '')
  const fairnessNote = String(props.decision?.decision_payload?.fairness_note || '')
  const premiumOptions: string[] = Array.isArray(props.decision?.decision_payload?.premiumOptions)
    ? props.decision!.decision_payload.premiumOptions
    : []
  const weeklySchedule: Array<{ day: string; workout: string; durationMin: number; intensity: string }> = Array.isArray(
    props.decision?.decision_payload?.weeklySchedule,
  )
    ? props.decision!.decision_payload.weeklySchedule
    : []
  const premiumScheduleExtras: Array<{ day: string; workout: string; durationMin: number; intensity: string }> = Array.isArray(
    props.decision?.decision_payload?.premiumScheduleExtras,
  )
    ? props.decision!.decision_payload.premiumScheduleExtras
    : []
  const planSummary = String(props.decision?.decision_payload?.planSummary || '')
  const inputSnapshot = props.decision?.decision_payload?.inputSnapshot || null
  const snapshotHeightInches =
    inputSnapshot && Number.isFinite(inputSnapshot.heightCm) ? Math.round(inputSnapshot.heightCm / 2.54) : null
  const snapshotFt =
    snapshotHeightInches != null ? Math.floor(snapshotHeightInches / 12) : null
  const snapshotIn =
    snapshotHeightInches != null ? snapshotHeightInches % 12 : null
  const snapshotLb =
    inputSnapshot && Number.isFinite(inputSnapshot.weightKg) ? Math.round(inputSnapshot.weightKg * 2.20462) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
      <Card title="Build Your Plan">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>{props.user.display_name}</div>
          <span
            style={{
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 999,
              background: props.user.is_paid ? '#e6fff3' : '#fff3e6',
            }}
          >
            {props.user.is_paid ? 'Premium' : 'Free'}
          </span>
          <Button onClick={props.onRefresh} style={{ background: '#fff', color: '#111' }}>
            Refresh
          </Button>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Input your info</div>

          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
            Goal
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as any)}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
            >
              <option value="fat_loss">Fat loss</option>
              <option value="strength">Strength</option>
              <option value="endurance">Endurance</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
            Experience
            <select
              value={experience}
              onChange={(e) => setExperience(e.target.value as any)}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
            Sessions per week
            <input
              type="number"
              min={1}
              max={7}
              value={sessionsPerWeek}
              onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
              Age
              <input
                type="number"
                min={13}
                max={90}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
              Sex
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as any)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
              Height (ft)
              <input
                type="number"
                min={3}
                max={8}
                value={heightFt}
                onChange={(e) => setHeightFt(Number(e.target.value))}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
              Height (in)
              <input
                type="number"
                min={0}
                max={11}
                value={heightIn}
                onChange={(e) => setHeightIn(Number(e.target.value))}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
            Weight (lb)
            <input
              type="number"
              min={70}
              max={550}
              value={weightLb}
              onChange={(e) => setWeightLb(Number(e.target.value))}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#444' }}>
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd', resize: 'vertical' }}
              placeholder="e.g., knee feels a bit sore"
            />
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              onClick={() =>
                props.onGeneratePlan({
                  goal,
                  experience,
                  sessionsPerWeek: Math.max(1, Math.min(7, Number.isFinite(sessionsPerWeek) ? sessionsPerWeek : 3)),
                  age: Math.max(13, Math.min(90, Number.isFinite(age) ? age : 24)),
                  sex,
                  heightCm: Math.max(
                    120,
                    Math.min(
                      230,
                      Math.round(((Math.max(3, Math.min(8, Number.isFinite(heightFt) ? heightFt : 5)) * 12 + Math.max(0, Math.min(11, Number.isFinite(heightIn) ? heightIn : 7))) * 2.54)),
                    ),
                  ),
                  weightKg: Math.max(
                    30,
                    Math.min(250, Math.round((Math.max(70, Math.min(550, Number.isFinite(weightLb) ? weightLb : 150)) / 2.20462) * 10) / 10),
                  ),
                  notes: notes.trim() || undefined,
                })
              }
              style={{ background: '#7c3aed' }}
            >
              Get Recommendation
            </Button>
            <Button onClick={() => props.onMockPayToggle(!props.user.is_paid)} style={{ background: '#fff', color: '#111' }}>
              {props.user.is_paid ? 'Switch to Free' : 'Unlock Premium (mock)'}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Your Recommendation">
        {props.decision ? (
          <>
            <div style={{ fontSize: 14 }}>
              {planSummary ? (
                <div>
                  Plan: <span style={{ color: '#444' }}>{planSummary}</span>
                </div>
              ) : null}
              {nudge ? (
                <div style={{ marginTop: 8 }}>
                  Nudge: <span style={{ color: '#444' }}>{nudge}</span>
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Recommended workouts (included)</div>
              {workouts.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {workouts.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: '#444' }}>No workouts available yet.</div>
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Weekly workout schedule</div>
              {weeklySchedule.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {weeklySchedule.map((item) => (
                    <div
                      key={`${item.day}-${item.workout}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '96px 1fr auto',
                        gap: 8,
                        alignItems: 'center',
                        border: '1px solid #ececec',
                        borderRadius: 10,
                        padding: 10,
                        background: '#fafafa',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.day}</div>
                      <div style={{ fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{item.workout}</div>
                        <div style={{ color: '#666' }}>{item.intensity}</div>
                      </div>
                      <div style={{ fontSize: 12, color: '#444' }}>{item.durationMin} min</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#444' }}>No schedule generated yet.</div>
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Premium options ({unlocked ? 'unlocked' : 'locked'})</div>
              {unlocked ? (
                premiumOptions.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {premiumOptions.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#444' }}>No premium options yet.</div>
                )
              ) : (
                <div style={{ color: '#444' }}>Upgrade to Premium (mock) to unlock additional advanced workouts and plan options.</div>
              )}
              {unlocked && premiumScheduleExtras.length ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Premium schedule extras</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {premiumScheduleExtras.map((item) => (
                      <div
                        key={`${item.day}-${item.workout}-premium`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '96px 1fr auto',
                          gap: 8,
                          alignItems: 'center',
                          border: '1px solid #ececec',
                          borderRadius: 10,
                          padding: 10,
                          background: '#f3f8ff',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{item.day}</div>
                        <div style={{ fontSize: 13 }}>
                          <div style={{ fontWeight: 600 }}>{item.workout}</div>
                          <div style={{ color: '#666' }}>{item.intensity}</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#444' }}>{item.durationMin} min</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {fairnessNote ? (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 14, background: '#f5f3ff', color: '#3b2b6a' }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Transparency note</div>
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>{fairnessNote}</div>
              </div>
            ) : null}

            <div style={{ marginTop: 10 }}>
              <Button onClick={() => setShowExplanationDetails((s) => !s)} style={{ background: '#fff', color: '#111' }}>
                {showExplanationDetails ? 'Hide Explanation Details' : 'View Explanation Details'}
              </Button>
            </div>

            {showExplanationDetails ? (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 14, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>How this recommendation was generated</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Goal and training experience are used to select the plan type.</li>
                  <li>Sessions per week and age influence queue position.</li>
                  <li>Height/weight and notes are used to tune plan context.</li>
                  <li>Premium status unlocks additional advanced options.</li>
                </ul>
                {inputSnapshot ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
                    Input snapshot: age {inputSnapshot.age}, {inputSnapshot.sex},{' '}
                    {snapshotFt != null && snapshotIn != null ? `${snapshotFt}'${snapshotIn}"` : `${inputSnapshot.heightCm} cm`},{' '}
                    {snapshotLb != null ? `${snapshotLb} lb` : `${inputSnapshot.weightKg} kg`},{' '}
                    {inputSnapshot.sessionsPerWeek} sessions/week.
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ color: '#444' }}>No decision loaded yet.</div>
        )}
      </Card>

      <Card title="Submit an Appeal">
        <p style={{ marginTop: 0, color: '#444' }}>
          Appeal a decision you believe is unfair or unclear. Admins will respond with a plain-language explanation.
        </p>
        <textarea
          value={appealText}
          onChange={(e) => setAppealText(e.target.value)}
          rows={6}
          placeholder="Explain what seems unfair or unclear (min 10 characters)."
          style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <Button
            disabled={!props.canSubmitAppeal || appealText.trim().length < 10}
            onClick={() => {
              props.onSubmitAppeal(appealText.trim())
              setAppealText('')
            }}
            style={{ opacity: !props.canSubmitAppeal || appealText.trim().length < 10 ? 0.5 : 1 }}
          >
            Submit Appeal
          </Button>
        </div>
      </Card>

      <Card title="Your Appeals">
        {props.appeals.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {props.appeals.map((a) => (
              <div key={a.appeal_id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>Appeal #{a.appeal_id}</div>
                  <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: '#f5f5f5' }}>
                    {a.status}
                  </span>
                  <Button
                    onClick={() => props.onOpenAppeal(a.appeal_id)}
                    style={{ marginLeft: 'auto', background: '#fff', color: '#111' }}
                  >
                    View
                  </Button>
                </div>
                <div style={{ marginTop: 8, color: '#444' }}>{truncate(a.appeal_content, 120)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#444' }}>No appeals yet.</div>
        )}
      </Card>
    </div>
  )
}

function CoachDashboard(props: { user: User; inbox: Appeal[]; onRefresh: () => void; onOpenAppeal: (id: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
      <Card title="Admin Inbox">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>{props.user.display_name}</div>
          <Button onClick={props.onRefresh} style={{ marginLeft: 'auto', background: '#fff', color: '#111' }}>
            Refresh
          </Button>
        </div>
        <div style={{ marginTop: 12 }}>
          {props.inbox.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {props.inbox.map((a) => (
                <div key={a.appeal_id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 700 }}>Appeal #{a.appeal_id}</div>
                    <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: '#f5f5f5' }}>
                      {a.status}
                    </span>
                    <Button
                      onClick={() => props.onOpenAppeal(a.appeal_id)}
                      style={{ marginLeft: 'auto', background: '#111', color: '#fff' }}
                    >
                      Review
                    </Button>
                  </div>
                  <div style={{ marginTop: 8, color: '#444' }}>{truncate(a.appeal_content, 160)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#444' }}>No appeals in inbox.</div>
          )}
        </div>
      </Card>
    </div>
  )
}

function AppealDetail(props: {
  token: string
  appealId: number
  backTo: 'user' | 'admin'
  onBack: () => void
  onResolved: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [appeal, setAppeal] = useState<Appeal | null>(null)
  const [explanation, setExplanation] = useState<any>(null)

  const [tier, setTier] = useState<'basic' | 'enhanced'>('basic')
  const [explanationText, setExplanationText] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    Api.getAppeal(props.token, props.appealId)
      .then((res) => {
        if (!mounted) return
        setAppeal(res.appeal)
        setExplanation(res.explanation)
      })
      .catch((e) => mounted && setError(String(e?.message || e)))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [props.token, props.appealId])

  async function resolve() {
    setError(null)
    try {
      const res = await Api.resolveAppeal(props.token, props.appealId, explanationText.trim(), tier)
      setAppeal(res.appeal)
      setExplanation(res.explanation)
      props.onResolved()
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
      <Card title={`Appeal #${props.appealId}`}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button onClick={props.onBack} style={{ background: '#fff', color: '#111' }}>
            Back
          </Button>
          <div style={{ fontSize: 12, color: '#666' }}>
            View as: {props.backTo === 'user' ? 'User' : 'Admin'}
          </div>
        </div>

        {loading ? <div style={{ marginTop: 10 }}>Loading...</div> : null}
        {error ? <div style={{ marginTop: 10, color: '#b00' }}>{error}</div> : null}

        {appeal ? (
          <>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Status</div>
              <div style={{ fontWeight: 700 }}>{appeal.status}</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Appeal content</div>
              <div style={{ whiteSpace: 'pre-wrap', color: '#222' }}>{appeal.appeal_content}</div>
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Explanation</div>
              {explanation ? (
                <div style={{ whiteSpace: 'pre-wrap', color: '#222' }}>{explanation.explanation_content}</div>
              ) : props.backTo === 'admin' ? (
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, color: '#666' }}>
                      Tier:{' '}
                      <select value={tier} onChange={(e) => setTier(e.target.value as any)} style={{ marginLeft: 6 }}>
                        <option value="basic">basic</option>
                        <option value="enhanced">enhanced</option>
                      </select>
                    </label>
                  </div>
                  <textarea
                    value={explanationText}
                    onChange={(e) => setExplanationText(e.target.value)}
                    rows={7}
                    placeholder="Write a plain-language explanation (min 10 characters)."
                    style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd', marginTop: 10 }}
                  />
                  <div style={{ marginTop: 10 }}>
                    <Button disabled={explanationText.trim().length < 10} onClick={resolve} style={{ opacity: explanationText.trim().length < 10 ? 0.5 : 1 }}>
                      Resolve Appeal
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#444' }}>No explanation yet.</div>
              )}
            </div>
          </>
        ) : null}
      </Card>
    </div>
  )
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

