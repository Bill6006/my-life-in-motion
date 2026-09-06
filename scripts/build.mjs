import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { build } from 'vite'
import sharp from 'sharp'
import { inventory, manifestDigest, manifestName } from './artifact.mjs'

const release = JSON.parse(await readFile('release.json', 'utf8'))
let commit = process.env.GITHUB_SHA
if (!commit) {
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { commit = 'local' }
}
if (process.env.CI && !/^[a-f0-9]{40}$/.test(commit)) throw new Error('CI builds require an exact source commit.')
const version = `${release.phase}-R${release.revision}-${commit.slice(0, 7)}`
process.env.APP_BUILD_VERSION = version
process.env.APP_BUILD_COMMIT = commit

await mkdir('public/icons', { recursive: true })
for (const size of [192, 512]) await sharp('public/icon.svg').resize(size).png().toFile(`public/icons/icon-${size}.png`)
// The mark remains inside the central safe area; the maskable background fills the canvas.
await sharp(Buffer.from((await readFile('public/icon.svg', 'utf8')).replace('rx="24"', 'rx="0"'))).resize(512).png().toFile('public/icons/maskable-512.png')

await build()
await writeFile('dist/font-license.txt', await readFile('node_modules/@fontsource-variable/inter/LICENSE'))
await writeFile('dist/build.json', JSON.stringify({ version, commit, phase: release.phase, revision: release.revision }, null, 2) + '\n')
const manifest = { version, commit, files: await inventory('dist') }
await writeFile(`dist/${manifestName}`, JSON.stringify({ ...manifest, artifactDigest: manifestDigest(manifest) }, null, 2) + '\n')
console.log(`Frozen build: ${version}\nArtifact digest: ${manifestDigest(manifest)}`)
