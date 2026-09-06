import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, Info, Moon, Pencil, Sun, Sunrise, Trash2, X } from 'lucide-react'
import { readCheckins, readSnapshot, removeCheckin, saveCheckin, type CheckInRecord, type Snapshot } from './data'
import { bands, calculateScore, contextIds, core, currentWindow, dateLabel, readings, scoreWord, titleCase, windowReadings, type Anchor, type Answers, type ReadingId, type WindowName } from './readings'
import { Dialog } from './Dialog'

type Session = { id: string; window: WindowName; answers: Answers; step: number; editing: boolean }
const windowIcons = { morning: Sunrise, afternoon: Sun, evening: Moon }

export function ScoreCard({ record, latest, onRecipe }: { record?: CheckInRecord; latest?: CheckInRecord; onRecipe: () => void }) {
  const score = record && calculateScore(record.answers)
  const incomplete = latest && calculateScore(latest.answers) === undefined
  return <section className="card reading-card" aria-labelledby="reading-title">
    <div className="card-top"><h2 id="reading-title" className="eyebrow">Your current reading</h2><button className="icon-button" aria-label="About the reading" onClick={onRecipe}><Info size={18} /></button></div>
    <div className="empty-reading">
      <span className="reading-number" data-testid="score" aria-label={score === undefined ? 'No reading yet' : `Calculated reading ${Math.round(score)} out of 100`}>{score === undefined ? '—' : Math.round(score)}</span>
      <p className="reading-state">{score === undefined ? incomplete ? 'Incomplete' : 'Not logged yet' : scoreWord(score)}</p>
      <p className="reading-explanation">{record ? `${incomplete ? 'Last complete' : 'Calculated'} · ${dateLabel(record.observedAt)}` : 'Your first full check-in puts a marker on the scale.'}</p>
    </div>
    <div className="scale-wrap"><div className="reading-scale" aria-hidden="true">{bands.map(([range]) => <span key={range} />)}</div>{score !== undefined && <i className="scale-marker" aria-hidden="true" style={{ left: `${Math.round(score)}%` }} />}</div>
    <ol className="band-legend" aria-label="Reading scale bands">{bands.map(([range, label]) => <li key={range}><span className="band-range">{range}</span><span>{label}</span></li>)}</ol>
    {incomplete && <p className="incomplete-note">Latest check-in incomplete · {dateLabel(latest.observedAt)}. Not logged: {core.filter(id => latest.answers[id] === undefined).map(id => readings[id].label.toLowerCase()).join(', ')}. Earlier answers have not been filled in.</p>}
    <p className="card-footnote">{score === undefined ? 'A reading, never a verdict.' : 'Calculated · six equal shares · a reading, never a verdict.'}</p>
  </section>
}

function ContextChips({ records }: { records: CheckInRecord[] }) {
  const items = contextIds.flatMap(id => {
    const source = records.find(record => record.answers[id] !== undefined)
    return source ? [{ id, source, phrase: readings[id].anchors[source.answers[id]!] }] : []
  })
  if (!items.length) return null
  return <section className="card context-card"><div className="card-top"><h2 className="eyebrow">Beside the reading</h2><span className="quiet-label">Recorded</span></div><p className="small-copy">Context has no weight in your score. Each chip keeps its own time.</p><div className="context-chips">{items.map(({ id, source, phrase }) => <div className="context-chip" key={id}><span>{readings[id].label}</span><strong>{phrase}</strong><time dateTime={source.observedAt}>{dateLabel(source.observedAt)}</time></div>)}</div></section>
}

export function Journal({ active, disabled, onDraft, onRecipe, children }: { active: boolean; disabled: boolean; onDraft: (value: boolean) => void; onRecipe: () => void; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ today: [], context: [] })
  const [view, setView] = useState<'home' | 'records' | 'result'>('home')
  const [session, setSession] = useState<Session | null>(null)
  const [detail, setDetail] = useState<CheckInRecord>()
  const [records, setRecords] = useState<CheckInRecord[]>([])
  const [limit, setLimit] = useState(25)
  const [error, setError] = useState('')
  const [now, setNow] = useState(new Date())
  const [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<Anchor>()
  const lock = useRef(false)
  const duration = useRef(0)
  const started = useRef<number | null>(null)
  const transition = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const refresh = useCallback(async () => {
    try { setSnapshot(await readSnapshot()); setError('') }
    catch { setError('Your check-ins could not be opened. No records have been replaced.') }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const tick = () => { setNow(new Date()); void refresh() }
    const timer = window.setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [refresh])
  useEffect(() => { onDraft(!!session); return () => onDraft(false) }, [session, onDraft])
  useEffect(() => {
    function track() {
      if (started.current !== null) { duration.current += performance.now() - started.current; started.current = null }
      if (session && active && !document.hidden) started.current = performance.now()
    }
    track(); document.addEventListener('visibilitychange', track)
    return () => { document.removeEventListener('visibilitychange', track); if (started.current !== null) { duration.current += performance.now() - started.current; started.current = null } }
  }, [!!session, active])
  useEffect(() => () => clearTimeout(transition.current), [])
  useEffect(() => {
    if (!active) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.querySelector<HTMLElement>('.journal h1')?.focus({ preventScroll: true })
  }, [view, session?.step, session?.id, active])

  function start(window: WindowName, record?: CheckInRecord, id?: ReadingId) {
    duration.current = 0; setSelected(undefined); setError(''); lock.current = false
    onDraft(true)
    setSession({ id: record?.id ?? crypto.randomUUID(), window, answers: record ? { ...record.answers } : {}, step: id ? windowReadings[window].indexOf(id) : 0, editing: !!record })
  }
  async function persist(current: Session, answers = current.answers) {
    setBusy(true); setError(''); lock.current = true
    try {
      const elapsed = duration.current + (started.current === null ? 0 : performance.now() - started.current)
      const saved = await saveCheckin({ ...current, answers, activeDurationMs: elapsed })
      setDetail(saved); setView('result'); setSession(null); onDraft(false)
      void navigator.storage?.persist?.().catch(() => {})
      await refresh()
    } catch { setError('This browser could not save your check-in. Your choices are still here. Try saving again.'); setSession({ ...current, answers }); setSelected(undefined) }
    finally { setBusy(false); lock.current = false }
  }
  function answer(value?: Anchor) {
    if (!session || lock.current) return
    lock.current = true
    const id = windowReadings[session.window][session.step]
    const answers = { ...session.answers }
    if (value === undefined) delete answers[id]; else answers[id] = value
    setSelected(value)
    setSession({ ...session, answers })
    transition.current = setTimeout(() => {
      setSelected(undefined)
      if (session.editing) { lock.current = false; return }
      if (session.step === windowReadings[session.window].length - 1) {
        if (Object.keys(answers).length) void persist(session, answers)
        else { setError('Nothing recorded. Choose any phrase, or leave this check-in.'); lock.current = false }
      } else { setSession({ ...session, answers, step: session.step + 1 }); lock.current = false }
    }, value === undefined || session.step === windowReadings[session.window].length - 1 ? 0 : 110)
  }
  async function openRecords(count = 25) {
    setView('records'); setError(''); setLimit(count)
    try { setRecords(await readCheckins(count)) } catch { setError('The saved check-ins could not be opened. Try again.'); }
  }
  async function deleteRecord() {
    if (!detail) return
    setBusy(true)
    try { await removeCheckin(detail.id); setDeleting(false); setDetail(undefined); await refresh(); await openRecords() }
    catch { setError('This check-in could not be removed. Please try again.'); setDeleting(false) }
    finally { setBusy(false) }
  }

  const thisWindow = currentWindow(now)
  const ids = session ? windowReadings[session.window] : []
  const reading = session ? readings[ids[session.step]] : null
  const score = detail && calculateScore(detail.answers)
  return <div className="journal">
    {error && <div className="notice" role="alert"><p>{error}</p>{!session && <button className="text-button" onClick={() => void refresh()}>Try again</button>}</div>}
    {session && reading ? <div className="checkin-shell">
      <div className="flow-top"><span className="eyebrow">{titleCase(session.window)} · {session.editing ? 'Correction' : 'Check-in'}</span><button className="icon-button" aria-label="Leave check-in" onClick={() => setDiscard(true)} disabled={busy}><X size={22} /></button></div>
      <div className="flow-progress" role="img" aria-label={`Question ${session.step + 1} of ${ids.length}`}>{ids.map((id, i) => <span key={id} className={i === session.step ? 'current' : session.answers[id] !== undefined ? 'answered' : ''} />)}</div>
      <div className="question-heading"><p className="eyebrow">{session.step + 1} of {ids.length} · {core.includes(ids[session.step] as typeof core[number]) ? 'Reading ingredient' : 'Context only'}</p><h1 tabIndex={-1}>{reading.label}<span className="accent">.</span></h1><p>{reading.prompt}</p></div>
      <div className="phrase-choices" role="group" aria-label={reading.label}>{reading.anchors.map((phrase, index) => { const [word, description] = phrase.split(' — '); return <button className={`phrase-choice ${selected === index ? 'picked' : ''}`} aria-pressed={session.answers[ids[session.step]] === index} disabled={busy} key={phrase} onClick={() => answer(index as Anchor)}><span><strong>{word}</strong><span>{description}</span></span><span className="choice-dot" aria-hidden="true">{session.answers[ids[session.step]] === index && <Check size={16} />}</span></button> })}</div>
      <div className="flow-actions"><button className="text-button" disabled={session.step === 0 || busy} onClick={() => { if (lock.current) return; setSession({ ...session, step: session.step - 1 }) }}><ArrowLeft size={16} /> Back</button><button className="text-button muted" disabled={busy} onClick={() => answer()}>{session.editing ? 'Remove this answer' : 'Skip this one'}<ArrowRight size={16} /></button></div>
      <div className="flow-save"><p>{session.editing ? 'The original observation time stays the same.' : 'Pick what fits. Every question can be skipped.'}</p><button className="secondary-button" disabled={busy || !Object.keys(session.answers).length} onClick={() => { if (!lock.current) void persist(session) }}>{busy ? 'Saving on this device…' : session.editing ? 'Save correction' : 'Save what I’ve answered'}<Check size={16} /></button></div>
    </div> : view === 'home' ? <>
      <div className="page-heading"><div><p className="eyebrow date">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(now)}</p><h1 tabIndex={-1}>Here, today<span className="accent">.</span></h1><p className="page-intro">A place to notice. A direction to keep.</p></div></div>
      <div className="home-grid"><div className="home-reading-stack"><ScoreCard record={snapshot.full} latest={snapshot.latest} onRecipe={onRecipe} /><button className="primary-button checkin-cta" disabled={disabled || !!error} onClick={() => start(thisWindow)}>Check in now <ArrowRight size={19} /></button><p className="cta-caption">{titleCase(thisWindow)} · {windowReadings[thisWindow].length} quick choices · every one skippable</p></div>
        {children}
        <section className="card rhythm-card"><div className="card-top"><h2 className="eyebrow">Your day, in moments</h2><span className="quiet-label">Recorded</span></div><div className="checkin-windows">{(['morning', 'afternoon', 'evening'] as const).map(name => {
          const Icon = windowIcons[name]; const logged = snapshot.today.filter(record => record.window === name).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]
          return <div className={`window ${name === thisWindow ? 'current-window' : ''}`} key={name}><Icon size={23} strokeWidth={1.4} /><h3>{titleCase(name)}</h3>{logged ? <button className="window-record" onClick={() => { setDetail(logged); setView('result') }}>{logged.isComplete ? 'Recorded' : 'Incomplete'}<span>{new Date(logged.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></button> : <span>Not logged yet</span>}</div>
        })}</div><p className="rhythm-note">A quiet place for each part of the day. Nothing to catch up on. No reminders are set.</p><button className="text-button" disabled={disabled} onClick={() => void openRecords()}>Your check-ins <ArrowRight size={16} /></button></section>
      </div><ContextChips records={snapshot.context} />
    </> : view === 'records' ? <>
      <div className="page-heading"><div><button className="back-link text-button" onClick={() => setView('home')}><ArrowLeft size={15} /> Today</button><h1 tabIndex={-1}>Your check-ins<span className="accent">.</span></h1><p className="page-intro">Recorded moments. Yours to correct or remove.</p></div></div>
      <section className="card records-card">{records.length ? <><p className="eyebrow">Newest first · recorded</p><div className="record-list">{records.map(record => { const value = calculateScore(record.answers); return <button key={record.id} className="record-row" onClick={() => { setDetail(record); setView('result') }}><span><strong>{titleCase(record.window)}</strong><time dateTime={record.observedAt}>{dateLabel(record.observedAt)}</time></span><span className="record-value">{value === undefined ? 'Incomplete' : Math.round(value)}<ChevronRight size={17} /></span></button> })}</div>{records.length === limit && <button className="text-button" onClick={() => void openRecords(limit + 25)}>Show earlier check-ins <ArrowRight size={16} /></button>}</> : <><div className="utility-icon"><Sunrise size={23} /></div><h2 className="section-title">A place for your moments.</h2><p className="body-secondary">Not logged yet. A check-in gives you a reading to return to, with every phrase kept beside it.</p><button className="primary-button direction-action" onClick={() => start(thisWindow)}>Make a first check-in <ArrowRight size={16} /></button></>}</section>
    </> : detail ? <>
      <div className="page-heading"><div><button className="back-link text-button" onClick={() => setView('home')}><ArrowLeft size={15} /> Today</button><p className="eyebrow">{titleCase(detail.window)} · {dateLabel(detail.observedAt)}</p><h1 tabIndex={-1}>A moment noticed<span className="accent">.</span></h1><p className="page-intro"><CheckCheck size={18} className="accent" /> Saved on this device.</p></div></div>
      <div className="result-grid"><section className="card result-summary"><div className="card-top"><h2 className="eyebrow">Calculated · equal weights</h2><button className="icon-button" aria-label="About the reading" onClick={onRecipe}><Info size={18} /></button></div><div className="result-number" data-testid="result-score">{score === undefined ? '—' : Math.round(score)}</div><h2 className="section-title">{score === undefined ? 'Incomplete' : scoreWord(score)}</h2><p className="body-secondary">{score === undefined ? `Not logged: ${core.filter(id => detail.answers[id] === undefined).map(id => readings[id].label.toLowerCase()).join(', ')}. Your other phrases are saved; no earlier answers fill the gaps.` : 'Six things you described, given equal weight. A snapshot of this moment, never an assessment of you.'}</p><div className="result-payoff"><span className="eyebrow">What you recorded</span><p>{core.filter(id => detail.answers[id] !== undefined).map(id => `${readings[id].label}: ${readings[id].anchors[detail.answers[id]!].split(' — ')[0].toLowerCase()}`).join(' · ') || 'Your context is kept below, with its original words.'}</p></div><button className="primary-button direction-action" onClick={() => setView('home')}>Back to today <ArrowRight size={17} /></button></section>
      <section className="card answer-card"><div className="card-top"><h2 className="eyebrow">Your words</h2><span className="quiet-label">Recorded</span></div><p className="small-copy">Tap any reading to correct it. Unanswered stays unknown.</p><div className="answer-list">{windowReadings[detail.window].map(id => <button className="answer-row" key={id} onClick={() => start(detail.window, detail, id)}><span><span className="answer-label">{readings[id].label} {core.includes(id as typeof core[number]) ? '' : '· context'}</span><strong>{detail.answers[id] === undefined ? 'Not logged yet' : readings[id].anchors[detail.answers[id]!]}</strong></span><Pencil size={15} /></button>)}</div><p className="small-copy">Observed {dateLabel(detail.observedAt)}{detail.updatedAt !== detail.createdAt ? ` · corrected ${dateLabel(detail.updatedAt)}` : ''}. Answering time: {Math.round(detail.activeDurationMs / 1000)} seconds in the foreground.</p><button className="text-button remove-button" onClick={() => setDeleting(true)}><Trash2 size={16} /> Delete this check-in</button></section></div>
    </> : null}
    <Dialog open={discard} title="Leave this check-in?" onClose={() => setDiscard(false)}><p className="body-secondary">These unsaved choices will be removed. You can also return and save only what you have answered.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDiscard(false)}>Keep answering</button><button className="primary-button" onClick={() => { clearTimeout(transition.current); lock.current = false; setSession(null); onDraft(false); setDiscard(false); setError('') }}>Discard unsaved choices</button></div></Dialog>
    <Dialog open={deleting} title="Delete this check-in?" onClose={() => setDeleting(false)}><p className="body-secondary">This removes its answers and answering time from this device. The reading will be recalculated from the records that remain.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDeleting(false)}>Keep it</button><button className="primary-button" disabled={busy} onClick={() => void deleteRecord()}>Delete check-in</button></div></Dialog>
  </div>
}
