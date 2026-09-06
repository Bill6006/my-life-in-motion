import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { manifestDigest, manifestName, sha256, verifyDirectory } from './artifact.mjs'

const args = process.argv.slice(2)
const dirIndex = args.indexOf('--dir')
const directory = path.resolve(dirIndex >= 0 ? args[dirIndex + 1] : 'dist')
try {
  const expected = await verifyDirectory(directory)
  if (args.includes('--live')) {
    const base = process.env.LIVE_URL ?? 'https://bill6006.github.io/my-life-in-motion/'
    async function fetchFile(file) {
      const url = new URL(file, base)
      url.searchParams.set('verify', expected.commit)
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    }
    const live = JSON.parse((await fetchFile(manifestName)).toString('utf8'))
    if (live.artifactDigest !== expected.artifactDigest || manifestDigest(live) !== expected.artifactDigest) throw new Error('Live manifest differs from the tested artifact.')
    for (let start = 0; start < expected.files.length; start += 4) {
      await Promise.all(expected.files.slice(start, start + 4).map(async file => {
        const body = await fetchFile(file.path)
        if (body.length !== file.bytes || sha256(body) !== file.sha256) throw new Error(`Live bytes differ: ${file.path}`)
      }))
    }
    console.log(`Live verification passed: ${expected.version} (${expected.files.length} files).`)
  } else console.log(`Artifact unchanged: ${expected.version} (${expected.files.length} files).`)
  console.log(`SHA-256: ${expected.artifactDigest}`)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${args.includes('--live') ? 'Live files verified' : 'Frozen artifact verified'}: **${expected.version}**\n\nArtifact SHA-256: \`${expected.artifactDigest}\`\n\nSource commit: \`${expected.commit}\`\n`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
