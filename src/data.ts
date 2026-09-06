import Dexie, { type Table } from 'dexie'
import { calculateScore, localDay, readings, windowReadings, type Answers, type WindowName } from './readings'

export const DIRECTION_LIMIT = 280
export interface DirectionRecord {
  id: 'direction'
  text: string
  createdAt: string
  updatedAt: string
}

export class LifeDatabase extends Dexie {
  directions!: Table<DirectionRecord, string>
  checkins!: Table<CheckInRecord, string>

  constructor(name = 'my-life-in-motion') {
    super(name)
    this.version(1).stores({ directions: 'id' })
    this.version(2).stores({ directions: 'id', checkins: 'id, observedAt, localDate, [localDate+window], [isComplete+observedAt]' })
  }
}

export interface CheckInRecord {
  id: string
  window: WindowName
  observedAt: string
  localDate: string
  timeZone: string
  createdAt: string
  updatedAt: string
  definitionVersion: 1
  recipeVersion: 1
  answers: Answers
  activeDurationMs: number
  isComplete: 0 | 1
}
export interface Snapshot { latest?: CheckInRecord; full?: CheckInRecord; today: CheckInRecord[]; context: CheckInRecord[] }
export async function readSnapshot(db = database): Promise<Snapshot> {
  return db.transaction('r', db.checkins, async () => {
    const [latest, full, today, context] = await Promise.all([
      db.checkins.orderBy('observedAt').last(),
      db.checkins.where('[isComplete+observedAt]').between([1, Dexie.minKey], [1, Dexie.maxKey]).last(),
      db.checkins.where('localDate').equals(localDay()).toArray(),
      db.checkins.orderBy('observedAt').reverse().limit(30).toArray(),
    ])
    return { latest, full, today, context }
  })
}
export async function saveCheckin(input: { id: string; window: WindowName; answers: Answers; activeDurationMs: number }, db = database): Promise<CheckInRecord> {
  if (!input.id || !windowReadings[input.window] || !Object.keys(input.answers).length) throw new Error('Choose at least one phrase to save.')
  for (const [id, value] of Object.entries(input.answers)) {
    if (!windowReadings[input.window].includes(id as keyof Answers) || !Number.isInteger(value) || value < 0 || value > 4) throw new Error('An answer is outside its definition.')
  }
  if (!Number.isFinite(input.activeDurationMs) || input.activeDurationMs < 0) throw new Error('Answering time is invalid.')
  return db.transaction('rw', db.checkins, async () => {
    const existing = await db.checkins.get(input.id)
    if (existing && existing.window !== input.window) throw new Error('A correction cannot change its window.')
    const now = new Date()
    const record: CheckInRecord = {
      id: input.id, window: input.window, answers: { ...input.answers },
      observedAt: existing?.observedAt ?? now.toISOString(), localDate: existing?.localDate ?? localDay(now),
      timeZone: existing?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: existing?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
      definitionVersion: 1, recipeVersion: 1, activeDurationMs: existing?.activeDurationMs ?? Math.round(input.activeDurationMs),
      isComplete: calculateScore(input.answers) === undefined ? 0 : 1,
    }
    await db.checkins.put(record)
    return record
  })
}
export async function readCheckins(limit = 25, db = database) { return db.checkins.orderBy('observedAt').reverse().limit(limit).toArray() }
export async function removeCheckin(id: string, db = database) { await db.checkins.delete(id) }
export async function readExport(db = database) {
  return db.transaction('r', db.directions, db.checkins, async () => ({ direction: await readDirection(db), checkins: await db.checkins.orderBy('observedAt').toArray() }))
}

export const database = new LifeDatabase()

export function normaliseDirection(value: string): string {
  const text = value.normalize('NFC').replace(/\s+/gu, ' ').trim()
  if (!text) throw new Error('Write a direction to save.')
  if (text.length > DIRECTION_LIMIT) throw new Error('Keep your direction within 280 characters.')
  return text
}

export async function readDirection(db = database): Promise<DirectionRecord | undefined> {
  return db.directions.get('direction')
}

export async function saveDirection(value: string, db = database): Promise<DirectionRecord> {
  const text = normaliseDirection(value)
  return db.transaction('rw', db.directions, async () => {
    const existing = await db.directions.get('direction')
    if (existing?.text === text) return existing
    const timestamp = new Date().toISOString()
    const record: DirectionRecord = {
      id: 'direction', text,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    await db.directions.put(record)
    return record
  })
}

export async function removeDirection(db = database): Promise<void> {
  await db.directions.delete('direction')
}

export function exportJson(record?: DirectionRecord, checkins: CheckInRecord[] = []): string {
  return JSON.stringify({
    app: 'my-life-in-motion',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    records: { directions: record ? [record] : [], checkins },
    definitions: { version: 1, readings, answerEncoding: 'Anchor index 0–4; sleep hours is a range, never an exact duration.', recipe: 'Version 1: equal mean of mood, energy, focus, reversed stress, reversed overwhelm, reversed irritation, coded 0/25/50/75/100. All six required.' },
    privateDataIncluded: false,
  }, null, 2)
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/u.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function exportCsv(record?: DirectionRecord, checkins: CheckInRecord[] = []): string {
  const rows: string[][] = [['kind', 'type', 'id', 'window', 'reading', 'text', 'anchor_index', 'calculated_score', 'observed_at', 'created_at', 'updated_at', 'local_date', 'time_zone', 'active_duration_ms', 'definition_version', 'recipe_version']]
  if (record) rows.push(['Recorded', 'direction', record.id, '', '', record.text, '', '', '', record.createdAt, record.updatedAt])
  for (const entry of checkins) {
    const tail = [entry.observedAt, entry.createdAt, entry.updatedAt, entry.localDate, entry.timeZone, String(entry.activeDurationMs), String(entry.definitionVersion), String(entry.recipeVersion)]
    for (const id of windowReadings[entry.window]) {
      const value = entry.answers[id]
      if (value !== undefined) rows.push(['Recorded', 'answer', entry.id, entry.window, id, readings[id].anchors[value], String(value), '', ...tail])
    }
    const score = calculateScore(entry.answers)
    rows.push(['Calculated', 'score', entry.id, entry.window, '', score === undefined ? 'Incomplete' : 'Equal weights', '', score === undefined ? '' : String(score), ...tail])
  }
  return rows.map(row => Array.from({ length: rows[0].length }, (_, i) => csvCell(row[i] ?? '')).join(',')).join('\r\n') + '\r\n'
}

export function downloadFile(contents: string, extension: 'json' | 'csv'): void {
  const mime = extension === 'json' ? 'application/json' : 'text/csv;charset=utf-8'
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `my-life-in-motion-${new Date().toISOString().slice(0, 10)}.${extension}`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
