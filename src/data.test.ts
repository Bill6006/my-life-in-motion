import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LifeDatabase, exportCsv, exportJson, normaliseDirection, readDirection, removeDirection, saveDirection } from './data'

describe('the local record', () => {
  let db: LifeDatabase
  beforeEach(() => { db = new LifeDatabase(`test-${crypto.randomUUID()}`) })
  afterEach(async () => { await db.delete() })

  it('starts without invented records and retains absence in exports', async () => {
    expect(await readDirection(db)).toBeUndefined()
    expect(JSON.parse(exportJson()).records.directions).toEqual([])
    expect(exportCsv().trim().split('\r\n')).toHaveLength(1)
    expect(JSON.parse(exportJson()).records.checkins).toEqual([])
    expect(await db.directions.count()).toBe(0)
  })

  it('persists and corrects one direction while preserving its creation date', async () => {
    await db.directions.put({ id: 'direction', text: 'A synthetic first direction.', createdAt: '2025-01-01T12:00:00.000Z', updatedAt: '2025-01-01T12:00:00.000Z' })
    const corrected = await saveDirection('  A synthetic\n revised direction.  ', db)
    expect(corrected.text).toBe('A synthetic revised direction.')
    expect(corrected.createdAt).toBe('2025-01-01T12:00:00.000Z')
    expect(corrected.updatedAt).not.toBe(corrected.createdAt)
    expect(await readDirection(db)).toEqual(corrected)
    expect(await db.directions.count()).toBe(1)
    expect(await saveDirection(corrected.text, db)).toEqual(corrected)
  })

  it('removes the record from subsequent reads and exports', async () => {
    await saveDirection('A synthetic direction to remove.', db)
    await removeDirection(db)
    expect(await readDirection(db)).toBeUndefined()
    expect(await db.directions.count()).toBe(0)
    expect(JSON.parse(exportJson(await readDirection(db))).records.directions).toEqual([])
  })

  it('leaves a saved record intact when a replacement write is rejected', async () => {
    const original = await saveDirection('An existing synthetic direction.', db)
    db.directions.hook('updating', () => { throw new DOMException('Storage is full', 'QuotaExceededError') })
    await expect(saveDirection('A replacement that cannot be saved.', db)).rejects.toThrow()
    expect(await readDirection(db)).toEqual(original)
  })

  it('rejects blank and oversized directions without creating data', async () => {
    await expect(saveDirection(' \n ', db)).rejects.toThrow()
    await expect(saveDirection('x'.repeat(281), db)).rejects.toThrow()
    expect(await db.directions.count()).toBe(0)
    expect(normaliseDirection('cafe\u0301')).toBe('café')
  })

  it('exports versioned JSON and neutralises spreadsheet formulas in CSV', async () => {
    const record = await saveDirection('=HYPERLINK("https://example.invalid", "synthetic")', db)
    const backup = JSON.parse(exportJson(record))
    expect(backup.schemaVersion).toBe(2)
    expect(backup.privateDataIncluded).toBe(false)
    expect(backup.records.directions).toEqual([record])
    expect(exportCsv(record)).toContain('"\'=HYPERLINK(""https://example.invalid"", ""synthetic"")"')
  })
})
