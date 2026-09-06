import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { readings, windowReadings, type WindowName } from '../src/readings'

test.use({ timezoneId: 'America/New_York' })
async function open(page: Page, hour = 8) {
  await page.clock.setFixedTime(new Date(`2026-09-06T${String(hour).padStart(2, '0')}:00:00-04:00`))
  await page.goto('./')
  await page.getByRole('button', { name: 'Check in now', exact: true }).click()
}
async function complete(page: Page, window: WindowName, skip?: string) {
  for (const id of windowReadings[window]) {
    await expect(page.getByRole('heading', { name: `${readings[id].label}.`, exact: true })).toBeVisible()
    if (id === skip) await page.getByRole('button', { name: 'Skip this one', exact: true }).click()
    else await page.locator('.phrase-choice').nth(2).click()
  }
  await expect(page.getByRole('heading', { name: 'A moment noticed.' })).toBeVisible()
}
async function backup(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON backup', exact: true }).click()
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
}

for (const [window, hour] of [['morning', 8], ['afternoon', 14], ['evening', 21]] as const) {
  test(`${window} completes its full phrase flow and returns a fixed reading`, async ({ page }, testInfo) => {
    await open(page, hour)
    await expect(page.locator('.phrase-choice')).toHaveCount(5)
    if (window === 'morning') await page.screenshot({ path: testInfo.outputPath('checkin-phrases.png'), fullPage: true })
    await complete(page, window)
    await expect(page.getByTestId('result-score')).toHaveText('50')
    await expect(page.locator('.answer-row')).toHaveCount(windowReadings[window].length)
    await expect(page.locator('.result-summary')).toContainText('Calculated · equal weights')
    const data = await backup(page)
    expect(data.records.checkins).toHaveLength(1)
    expect(data.records.checkins[0].window).toBe(window)
    expect(Object.keys(data.records.checkins[0].answers)).toHaveLength(windowReadings[window].length)
    expect(data.records.checkins[0].activeDurationMs).toBeGreaterThan(0)
    if (window === 'morning') expect(data.records.checkins[0].answers.sleepHours).toBe(2)
    await page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath('checkin-result.png'), fullPage: true })
    await page.getByRole('button', { name: 'Back to today', exact: true }).click()
    await expect(page.getByTestId('score')).toHaveText('50')
    await expect(page.locator('.scale-marker')).toHaveAttribute('style', 'left: 50%;')
    await expect(page.locator('.context-chips')).toContainText('Ready to eat')
    await page.screenshot({ path: testInfo.outputPath('home-recorded.png'), fullPage: true })
  })
}

test('partial answers do not replace a full reading; correction and deletion update real records', async ({ page }) => {
  await open(page)
  await complete(page, 'morning')
  const first = (await backup(page)).records.checkins[0]
  await page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }).click()
  await page.getByRole('button', { name: 'Back to today', exact: true }).click()
  await page.clock.setFixedTime(new Date('2026-09-06T14:00:00-04:00'))
  await page.reload()
  await page.getByRole('button', { name: 'Check in now', exact: true }).click()
  await complete(page, 'afternoon', 'focus')
  await expect(page.getByTestId('result-score')).toHaveText('—')
  await expect(page.locator('.result-summary')).toContainText('Not logged: focus.')
  await page.getByRole('button', { name: 'Back to today', exact: true }).click()
  await expect(page.getByTestId('score')).toHaveText('50')
  await expect(page.locator('.reading-explanation')).toContainText('Last complete')
  await page.getByRole('button', { name: 'Your check-ins', exact: true }).click()
  await page.locator('.record-row').last().click()
  await page.locator('.answer-row').filter({ hasText: 'Focus' }).click()
  await page.locator('.phrase-choice').nth(4).click()
  await expect(page.locator('.phrase-choice').nth(4)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.phrase-choice.picked')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save correction', exact: true }).click()
  await expect(page.getByTestId('result-score')).toHaveText('58')
  const revised = (await backup(page)).records.checkins.find((record: { id: string }) => record.id === first.id)
  expect(revised.observedAt).toBe(first.observedAt)
  expect(revised.createdAt).toBe(first.createdAt)
  expect(revised.answers.focus).toBe(4)
  await page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }).click()
  await page.getByRole('button', { name: 'Delete this check-in', exact: true }).click()
  await page.getByRole('button', { name: 'Delete check-in', exact: true }).click()
  await expect(page.locator('.record-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.locator('.reading-state')).toHaveText('Incomplete')
  const remaining = (await backup(page)).records.checkins
  expect(remaining).toHaveLength(1)
  expect(remaining[0].answers.focus).toBeUndefined()
})

test('check-ins save offline without transmitting records and survive reopening', async ({ page, context }) => {
  const requests: { method: string; origin: string; body: string | null }[] = []
  page.on('request', request => requests.push({ method: request.method(), origin: new URL(request.url()).origin, body: request.postData() }))
  await open(page, 21)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await complete(page, 'evening')
  await page.reload()
  await expect(page.getByTestId('score')).toHaveText('50')
  const data = await backup(page)
  expect(data.records.checkins).toHaveLength(1)
  expect(requests.every(request => request.method === 'GET' && request.body === null && request.origin === 'http://127.0.0.1:41983')).toBe(true)
})

test('draft survives internal navigation; unanswered questions create no record', async ({ page }) => {
  await open(page, 21)
  await page.locator('.phrase-choice').nth(2).click()
  await expect(page.getByRole('heading', { name: 'Irritation.', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click()
  const data = await backup(page)
  expect(data.records.checkins).toHaveLength(0)
  await page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Irritation.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Leave check-in', exact: true }).click()
  await page.getByRole('button', { name: 'Discard unsaved choices', exact: true }).click()
  await page.getByRole('button', { name: 'Check in now', exact: true }).click()
  for (const id of windowReadings.evening) {
    await expect(page.getByRole('heading', { name: `${readings[id].label}.`, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Skip this one', exact: true }).click()
  }
  await expect(page.getByRole('alert')).toContainText('Nothing recorded')
  expect((await backup(page)).records.checkins).toHaveLength(0)
})

test('check-in, results and record controls meet accessibility and large-text layout checks', async ({ page }, testInfo) => {
  await open(page, 21)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  const style = await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('checkin-large-text.png'), fullPage: true })
  await style.evaluate(element => element.parentNode?.removeChild(element))
  await complete(page, 'evening')
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Delete this check-in', exact: true }).click()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
})

test('a rejected check-in write leaves unsaved choices available to retry', async ({ page }) => {
  await open(page, 21)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'checkins') { IDBObjectStore.prototype.put = original; throw new DOMException('Synthetic storage rejection', 'QuotaExceededError') }
      return original.apply(this, args)
    }
  })
  for (const id of windowReadings.evening) {
    await expect(page.getByRole('heading', { name: `${readings[id].label}.`, exact: true })).toBeVisible()
    await page.locator('.phrase-choice').nth(2).click()
  }
  await expect(page.getByRole('alert')).toContainText('choices are still here')
  await page.getByRole('button', { name: 'Save what I’ve answered', exact: true }).click()
  await expect(page.getByTestId('result-score')).toHaveText('50')
  expect((await backup(page)).records.checkins).toHaveLength(1)
})
