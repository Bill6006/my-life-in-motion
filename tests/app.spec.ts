import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

const syntheticDirection = 'Make space for reading and a little time outdoors.'
async function settings(page: Page) { await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click() }
async function save(page: Page, text = syntheticDirection) {
  await page.getByLabel('My direction', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Save my direction', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Saved on this device.')
}

test('empty home has a labelled scale, no invented reading and only built navigation', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Here, today.' })).toBeVisible()
  await expect(page.getByText('Not logged yet', { exact: true })).toBeVisible()
  await expect(page.getByLabel('No reading yet')).toHaveText('—')
  await expect(page.getByLabel('Reading scale bands').getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Set my direction' })).toBeVisible()
  await expect(page.getByText('Check-ins aren’t open yet; no reminders are set.', { exact: false })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('home-empty.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('direction survives reload, can be corrected, and deletion is real', async ({ page }, testInfo) => {
  await page.goto('./')
  await settings(page)
  await save(page)
  await page.reload()
  await expect(page.getByLabel('My direction', { exact: true })).toHaveValue(syntheticDirection)
  await save(page, 'A revised synthetic direction, in my own words.')
  await page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByText('A revised synthetic direction, in my own words.', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('home-synthetic-direction.png'), fullPage: true })
  await settings(page)
  await page.getByRole('button', { name: 'Remove my direction', exact: true }).click()
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await expect(page.getByLabel('My direction', { exact: true })).toHaveValue('A revised synthetic direction, in my own words.')
  await page.getByRole('button', { name: 'Remove my direction', exact: true }).click()
  await page.getByRole('button', { name: 'Remove direction', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Direction removed')
  await page.reload()
  await expect(page.getByLabel('My direction', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Remove my direction', exact: true })).toHaveCount(0)
})

test('exports contain saved data, not an unsaved draft, and send no record over the network', async ({ page }) => {
  const requests: { url: string; method: string; body: string | null }[] = []
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }))
  await page.goto('./')
  await settings(page)
  await save(page)
  await page.getByLabel('My direction', { exact: true }).fill('An unsaved synthetic draft.')
  const jsonPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON backup', exact: true }).click()
  const jsonDownload = await jsonPromise
  const backup = JSON.parse(await readFile((await jsonDownload.path())!, 'utf8'))
  expect(backup.records.directions[0].text).toBe(syntheticDirection)
  expect(backup.privateDataIncluded).toBe(false)
  const csvPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV export', exact: true }).click()
  const csv = await readFile((await (await csvPromise).path())!, 'utf8')
  expect(csv).toContain(syntheticDirection)
  expect(csv).not.toContain('unsaved synthetic')
  expect(requests.every(request => request.method === 'GET' && request.body === null && new URL(request.url).origin === 'http://127.0.0.1:41983')).toBe(true)
})

test('installed assets and saved direction reopen offline', async ({ page, context }) => {
  await page.goto('./#/settings')
  await save(page)
  await expect(page.getByText('Ready to open offline', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByLabel('My direction', { exact: true })).toHaveValue(syntheticDirection)
  await save(page, 'A synthetic direction saved while offline.')
  await page.reload()
  await expect(page.getByLabel('My direction', { exact: true })).toHaveValue('A synthetic direction saved while offline.')
  await page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByText('Not logged yet', { exact: true })).toBeVisible()
})

test('the install manifest has a scoped start URL and real Android icons', async ({ request }) => {
  const response = await request.get('manifest.webmanifest')
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest.start_url).toBe('/my-life-in-motion/')
  expect(manifest.scope).toBe('/my-life-in-motion/')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    expect(response.ok()).toBe(true)
    expect((await response.body()).subarray(1, 4).toString()).toBe('PNG')
  }
})

test('phone screens, dialogs and large text remain accessible', async ({ page }, testInfo) => {
  await page.goto('./')
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'About the reading', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'About the reading', exact: true })).toBeFocused()
  await settings(page)
  await save(page)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('settings-synthetic-direction.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('settings-large-text.png'), fullPage: true })
})

test('storage failure stays explicit without inventing a replacement record', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, 'open', { value() { throw new DOMException('Unavailable for this test', 'SecurityError') } })
  })
  await page.goto('./#/settings')
  await expect(page.getByRole('alert')).toContainText('couldn’t open your local record')
  await expect(page.getByRole('button', { name: 'Save my direction', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'JSON backup', exact: true })).toBeDisabled()
})

test('displayed version equals the frozen build and offline assets carry that version', async ({ page, request }) => {
  const build = await (await request.get('build.json')).json()
  const manifest = await (await request.get('artifact-manifest.json')).json()
  expect(build.version).toBe(manifest.version)
  expect(build.commit).toBe(manifest.commit)
  await page.goto('./#/settings')
  await expect(page.getByTestId('build-version')).toHaveText(build.version)
})
