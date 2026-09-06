import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Compass, Download, House, Info, Moon, RefreshCw, Settings2, ShieldCheck, Smartphone, Sun, Sunrise, Trash2, WifiOff } from 'lucide-react'
import { DIRECTION_LIMIT, downloadFile, exportCsv, exportJson, readDirection, removeDirection, saveDirection, type DirectionRecord } from './data'
import { Dialog } from './Dialog'
import { usePwa } from './usePwa'

const bands = [
  ['0–19', 'Low reserve'], ['20–39', 'Stretched'], ['40–59', 'Mixed'],
  ['60–79', 'Steady'], ['80–100', 'Plenty in reserve'],
]
const windows = [
  { name: 'Morning', time: '7:00 AM', Icon: Sunrise },
  { name: 'Afternoon', time: '2:00 PM', Icon: Sun },
  { name: 'Evening', time: '9:00 PM', Icon: Moon },
]

function routeFromHash() { return window.location.hash.startsWith('#/settings') ? 'settings' : 'home' }

export function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [direction, setDirection] = useState<DirectionRecord>()
  const [draft, setDraft] = useState('')
  const [dirty, updateDirty] = useState(false)
  const dirtyRef = useRef(false)
  const setDirty = useCallback((value: boolean) => { dirtyRef.current = value; updateDirty(value) }, [])
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [formError, setFormError] = useState('')
  const [dialog, setDialog] = useState<'recipe' | 'remove' | null>(null)
  const [installHelp, setInstallHelp] = useState(false)
  const [persistent, setPersistent] = useState(false)
  const pwa = usePwa()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const record = await readDirection()
      setDirection(record)
      setDraft(record?.text ?? '')
      setDirty(false)
      setStorageError(false)
    } catch { setStorageError(true) }
    finally { setLoading(false) }
  }, [setDirty])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const listener = () => { setRoute(routeFromHash()); setFeedback(''); setFormError('') }
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
    document.title = route === 'settings' ? 'Settings · My Life in Motion' : 'My Life in Motion'
  }, [route])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersistent).catch(() => {})
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setFeedback(''); setFormError('')
    try {
      const record = await saveDirection(draft)
      setDirection(record); setDraft(record.text); setDirty(false)
      setFeedback('Saved on this device.')
      void navigator.storage?.persist?.().then(setPersistent).catch(() => {})
    } catch {
      setFormError('This browser couldn’t save your direction. Your unsaved line is still here. Please try again.')
    } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setFeedback(''); setFormError('')
    try {
      await removeDirection()
      setDirection(undefined); setDraft(''); setDirty(false); setDialog(null)
      setFeedback('Direction removed from this device.')
    } catch { setFormError('This browser couldn’t remove your direction. Please try again.'); setDialog(null) }
    finally { setBusy(false) }
  }

  async function exportRecord(extension: 'json' | 'csv') {
    setFeedback(''); setFormError('')
    try {
      const record = await readDirection()
      downloadFile(extension === 'json' ? exportJson(record) : exportCsv(record), extension)
      setFeedback(`${extension.toUpperCase()} download prepared from your saved record.`)
    } catch { setFormError('This browser couldn’t read your saved record for export. Please try again.') }
  }

  const savedDate = direction ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(direction.updatedAt)) : ''

  return <div className="app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header">
      <a href="#/" className="brand" aria-label="My Life in Motion home">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width="38" height="38" alt="" />
        <span>My Life<span className="brand-second">in Motion</span></span>
      </a>
      <span className="device-status">{pwa.online ? <ShieldCheck size={15} /> : <WifiOff size={15} />}<span>{pwa.online ? 'On this device' : 'You’re offline'}</span></span>
    </header>

    <main id="main" className="main">
      {storageError && <div className="notice" role="alert"><p>This browser couldn’t open your local record. No saved data has been replaced.</p><button className="text-button" onClick={() => void load()}>Try again <RefreshCw size={15} /></button></div>}
      {pwa.updateReady && <div className="notice update-notice"><p>{dirty ? 'An update is ready. Save your direction first.' : 'A new version is ready. Your record stays here.'}</p><button className="text-button" disabled={dirty} onClick={() => void pwa.update()}>Update app <RefreshCw size={15} /></button></div>}

      {route === 'home' ? <>
        <div className="page-heading"><div><p className="eyebrow date">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}</p><h1 tabIndex={-1}>Here, today<span className="accent">.</span></h1><p className="page-intro">A place to notice. A direction to keep.</p></div><span className="heading-mark" aria-hidden="true"><Compass size={25} strokeWidth={1.25} /></span></div>

        <div className="home-grid">
          <section className="card reading-card" aria-labelledby="reading-title">
            <div className="card-top"><h2 id="reading-title" className="eyebrow">Your current reading</h2><button className="icon-button muted" aria-label="About the reading" onClick={() => setDialog('recipe')}><Info size={18} /></button></div>
            <div className="empty-reading"><span className="reading-number" aria-label="No reading yet">—</span><p className="reading-state">Not logged yet</p><p className="reading-explanation">Your first check-in will put a marker on the scale.</p></div>
            <div className="reading-scale" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <ol className="band-legend" aria-label="Reading scale bands">{bands.map(([range, label]) => <li key={range}><span className="band-range">{range}</span><span>{label}</span></li>)}</ol>
            <p className="card-footnote">A reading, never a verdict.</p>
          </section>

          <section className="card direction-card" aria-labelledby="direction-title" aria-busy={loading}>
            <div className="card-top"><h2 id="direction-title" className="eyebrow">Your direction</h2><Compass className="accent" size={20} strokeWidth={1.5} /></div>
            {loading ? <div className="direction-content"><p className="direction-title">Opening your local record…</p></div> : storageError ? <div className="direction-content"><p className="direction-title">Your record stays yours.</p><p className="body-secondary">Try opening your local record again to see your direction.</p></div> : <div className="direction-content">
              <p className={`direction-title ${direction ? 'has-direction' : ''}`}>{direction?.text ?? 'Make room for what matters.'}</p>
              <p className="body-secondary">{direction ? `In your words · saved ${savedDate}` : 'Keep one line here, in your own words. Something you can return to.'}</p>
              <a href="#/settings" className={direction ? 'text-button direction-action' : 'primary-button direction-action'}>{direction ? 'Edit my direction' : 'Set my direction'}<ArrowRight size={18} /></a>
            </div>}
            <div className="direction-caption"><span className="small-rule" /><span>No deadline. Yours to change.</span></div>
          </section>

          <section className="card rhythm-card" aria-labelledby="rhythm-title">
            <div className="card-top"><h2 id="rhythm-title" className="eyebrow">A little rhythm</h2><span className="quiet-label">Coming next</span></div>
            <div className="checkin-windows">{windows.map(({ name, time, Icon }) => <div className="window" key={name}><Icon size={23} strokeWidth={1.4} /><h3>{name}</h3><span>{time}</span></div>)}</div>
            <p className="rhythm-note">A few words about how you are, three times a day. Check-ins aren’t open yet; no reminders are set.</p>
          </section>
        </div>
        <p className="home-footnote"><span aria-hidden="true" />One small place to begin.</p>
      </> : <>
        <div className="page-heading settings-heading"><div><a className="back-link" href="#/"><ArrowLeft size={15} /> Today</a><h1 tabIndex={-1}>Make it yours<span className="accent">.</span></h1><p className="page-intro">A direction to keep. A record you control.</p></div></div>
        <div className="settings-grid">
          <section className="card settings-direction" aria-labelledby="settings-direction-title">
            <div className="card-top"><h2 id="settings-direction-title" className="eyebrow">Your direction</h2><Compass size={20} className="accent" strokeWidth={1.5} /></div>
            <h3 className="section-title">One line to come back to.</h3><p className="body-secondary">Where would you like to be heading? Use your own words. You can change them anytime.</p>
            <form onSubmit={event => void save(event)}>
              <label className="input-label" htmlFor="direction">My direction</label>
              <textarea id="direction" name="direction" rows={3} maxLength={DIRECTION_LIMIT} value={draft} placeholder="Write a direction in your own words." disabled={loading || storageError || busy} aria-describedby="direction-hint" onChange={event => { setDraft(event.target.value); setDirty(event.target.value !== (direction?.text ?? '')); setFeedback(''); setFormError('') }} />
              <div className="input-meta" id="direction-hint"><span>{dirty ? 'Changes waiting to be saved' : 'One line, in your own words'}</span><span>{draft.length} / {DIRECTION_LIMIT}</span></div>
              <button className="primary-button save-button" type="submit" disabled={!draft.trim() || busy || loading || storageError}>{busy ? 'Saving…' : 'Save my direction'}<Check size={18} /></button>
            </form>
            <div className="feedback-slot"><p role="status" className="feedback">{feedback}</p>{formError && <p role="alert" className="form-error">{formError}</p>}</div>
            {direction && <button className="text-button remove-button" disabled={busy} onClick={() => setDialog('remove')}><Trash2 size={16} /> Remove my direction</button>}
          </section>

          <div className="settings-side">
            <section className="card privacy-card" aria-labelledby="privacy-title"><div className="utility-icon"><ShieldCheck size={23} strokeWidth={1.5} /></div><h2 id="privacy-title" className="section-title">Your record stays here.</h2><p className="body-secondary">Your direction lives in this browser, on this device. No account, uploads or tracking.</p><p className="storage-note">{persistent ? 'Browser persistence is enabled. Clearing site data still removes your record.' : 'Clearing browser storage removes your record. Keep a download if you want a copy.'}</p><div className="export-actions"><button className="secondary-button" disabled={loading || storageError} onClick={() => void exportRecord('json')}><Download size={16} /> JSON backup</button><button className="secondary-button" disabled={loading || storageError} onClick={() => void exportRecord('csv')}><Download size={16} /> CSV export</button></div><p className="small-copy">Exports contain your saved direction and its dates. Unsaved changes stay out.</p></section>

            <section className="card install-card" aria-labelledby="install-title"><div className="install-icon"><Smartphone size={24} strokeWidth={1.5} /></div><div><h2 id="install-title" className="section-title">Keep it close.</h2><p className="body-secondary">{pwa.installed ? 'You’re using the installed app.' : 'Add My Life to your home screen for a space of its own.'}</p><p className="offline-status"><span className={pwa.offlineReady ? 'ready-dot' : 'pending-dot'} />{pwa.offlineReady ? 'Ready to open offline' : 'Preparing offline access'}</p>{!pwa.installed && <button className="text-button" onClick={() => { if (pwa.canInstall) void pwa.install().catch(() => setInstallHelp(true)); else setInstallHelp(value => !value) }}>{pwa.canInstall ? 'Install app' : installHelp ? 'Hide install steps' : 'Show install steps'}<ArrowUpRight size={16} /></button>}{installHelp && !pwa.installed && <p className="install-help">In Chrome on Android, open the browser menu, choose <strong>Add to Home screen</strong>, then <strong>Install</strong>. Reopening the app in the same browser keeps the same record.</p>}</div></section>
          </div>
        </div>
        <footer className="build-footer"><span>MY LIFE IN MOTION</span><span className="version" data-testid="build-version">{__BUILD_VERSION__}</span></footer>
      </>}
    </main>

    <nav className="bottom-nav" aria-label="Main navigation"><a href="#/" aria-current={route === 'home' ? 'page' : undefined}><House size={20} strokeWidth={1.7} /><span>Today</span></a><a href="#/settings" aria-current={route === 'settings' ? 'page' : undefined}><Settings2 size={20} strokeWidth={1.7} /><span>Settings</span></a></nav>

    <Dialog open={dialog !== null} title={dialog === 'remove' ? 'Remove your direction?' : 'A reading, never a verdict.'} onClose={() => setDialog(null)}>
      {dialog === 'remove' ? <><p className="body-secondary">This removes your saved line from this device. You can write another whenever you like.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Keep it</button><button className="primary-button" disabled={busy} onClick={() => void remove()}>Remove direction</button></div></> : <><p className="body-secondary">The reading will be a calculation from six things you describe: mood, energy, focus, stress, overwhelm and irritation. Each gets an equal share, permanently.</p><p className="body-secondary">The scale’s words describe a moment. They aren’t an assessment of you. Until you record a complete check-in, there’s no number or marker here.</p><div className="recipe-note"><Info size={18} /><span>Check-ins are coming next.</span></div></>}
    </Dialog>
  </div>
}
