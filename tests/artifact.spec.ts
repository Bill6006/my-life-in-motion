import { expect, test } from '@playwright/test'
import { cp, appendFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

test('release verification rejects a file changed after tests', async ({}, testInfo) => {
  const directory = testInfo.outputPath('tampered-artifact')
  await mkdir(directory, { recursive: true })
  await cp('dist', directory, { recursive: true })
  execFileSync(process.execPath, ['scripts/verify-artifact.mjs', '--dir', directory])
  await appendFile(`${directory}/index.html`, '\n<!-- synthetic tamper check -->\n')
  expect(() => execFileSync(process.execPath, ['scripts/verify-artifact.mjs', '--dir', directory], { stdio: 'pipe' })).toThrow()
})
