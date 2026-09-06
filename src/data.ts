import Dexie, { type Table } from 'dexie'

export const DIRECTION_LIMIT = 280
export interface DirectionRecord {
  id: 'direction'
  text: string
  createdAt: string
  updatedAt: string
}

export class LifeDatabase extends Dexie {
  directions!: Table<DirectionRecord, string>

  constructor(name = 'my-life-in-motion') {
    super(name)
    this.version(1).stores({ directions: 'id' })
  }
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

export function exportJson(record?: DirectionRecord): string {
  return JSON.stringify({
    app: 'my-life-in-motion',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records: { directions: record ? [record] : [] },
    privateDataIncluded: false,
  }, null, 2)
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/u.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function exportCsv(record?: DirectionRecord): string {
  const header = 'type,text,created_at,updated_at\r\n'
  return record ? header + ['direction', record.text, record.createdAt, record.updatedAt].map(csvCell).join(',') + '\r\n' : header
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
