import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LifeDatabase, exportCsv, exportJson, readExport, readSnapshot, removeCheckin, saveCheckin } from './data'
import { calculateScore, core, readings, windowReadings, type Answers } from './readings'

const full: Answers = { mood: 4, energy: 3, focus: 2, stress: 1, overwhelm: 2, irritation: 3 }
describe('check-in records and calculations', () => {
  let db: LifeDatabase
  beforeEach(() => { db = new LifeDatabase(`checkin-test-${crypto.randomUUID()}`) })
  afterEach(async () => { vi.useRealTimers(); await db.delete() })

  it('keeps the fixed recipe, polarity, raw precision and missingness', () => {
    expect(calculateScore(full)).toBe(62.5)
    expect(calculateScore({ ...full, hunger: 4, confidence: 0, sleepHours: 0, motivation: 0 })).toBe(62.5)
    expect(calculateScore({ mood: 4, energy: 4, focus: 4, stress: 0, overwhelm: 0, irritation: 0 })).toBe(100)
    expect(calculateScore({ mood: 0, energy: 0, focus: 0, stress: 4, overwhelm: 4, irritation: 4 })).toBe(0)
    expect(calculateScore({ ...full, focus: 3 })).toBeCloseTo(66.6666666667)
    for (const id of core) { const missing = { ...full }; delete missing[id]; expect(calculateScore(missing)).toBeUndefined() }
  })
  it('defines 13/7/7 unique readings with five descriptive anchors each', () => {
    expect(Object.values(windowReadings).map(ids => ids.length)).toEqual([13, 7, 7])
    for (const ids of Object.values(windowReadings)) { expect(new Set(ids).size).toBe(ids.length); for (const id of core) expect(ids).toContain(id) }
    for (const definition of Object.values(readings)) { expect(new Set(definition.anchors).size).toBe(5); expect(definition.anchors.every(phrase => phrase.includes(' — '))).toBe(true) }
    expect(readings.sleepHours.anchors[2]).toContain('6 to under 7 hours')
  })
  it('migrates the deployed v1 database without changing the saved direction', async () => {
    const legacy = new Dexie(db.name)
    legacy.version(1).stores({ directions: 'id' })
    const direction = { id: 'direction', text: 'A synthetic migration record.', createdAt: '2025-01-01', updatedAt: '2025-01-01' }
    await legacy.table('directions').put(direction); legacy.close()
    await db.open()
    expect(await db.directions.get('direction')).toEqual(direction)
    expect(await db.checkins.count()).toBe(0)
  })
  it('keeps partial records separate, preserves observation time on correction, and recalculates after deletion', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-06T13:00:00Z'))
    const original = await saveCheckin({ id: 'complete', window: 'morning', answers: full, activeDurationMs: 1200 }, db)
    vi.setSystemTime(new Date('2026-09-06T18:00:00Z'))
    const partial = await saveCheckin({ id: 'partial', window: 'afternoon', answers: { mood: 0 }, activeDurationMs: 600 }, db)
    expect((await readSnapshot(db)).full?.id).toBe(original.id)
    expect((await readSnapshot(db)).latest?.id).toBe(partial.id)
    const corrected = await saveCheckin({ id: original.id, window: 'morning', answers: { mood: 4 }, activeDurationMs: 9999 }, db)
    expect(corrected.observedAt).toBe(original.observedAt)
    expect(corrected.createdAt).toBe(original.createdAt)
    expect(corrected.activeDurationMs).toBe(1200)
    expect(corrected.updatedAt).not.toBe(original.updatedAt)
    expect((await readSnapshot(db)).full).toBeUndefined()
    expect(await db.checkins.count()).toBe(2)
    await removeCheckin('partial', db)
    const backup = await readExport(db)
    expect(backup.checkins.map(record => record.id)).toEqual(['complete'])
    expect(JSON.parse(exportJson(backup.direction, backup.checkins)).records.checkins[0].answers).toEqual({ mood: 4 })
    const csv = exportCsv(undefined, backup.checkins)
    expect(csv).toContain('"Calculated","score"'); expect(csv).toContain('"Incomplete",""')
    expect(csv).not.toContain('"answer","complete","morning","focus"')
  })
  it('rejects invalid or empty answers and preserves choices on storage failure', async () => {
    await expect(saveCheckin({ id: 'empty', window: 'morning', answers: {}, activeDurationMs: 0 }, db)).rejects.toThrow()
    await expect(saveCheckin({ id: 'invalid', window: 'afternoon', answers: { sleepHours: 1 }, activeDurationMs: 0 }, db)).rejects.toThrow()
    const input = { id: 'full', window: 'morning' as const, answers: full, activeDurationMs: 12 }
    const saved = await saveCheckin(input, db)
    db.checkins.hook('updating', () => { throw new DOMException('Full', 'QuotaExceededError') })
    await expect(saveCheckin({ ...input, answers: { mood: 1 } }, db)).rejects.toThrow()
    expect(await db.checkins.get(saved.id)).toEqual(saved)
  })
})
