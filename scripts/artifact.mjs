import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export const sha256 = value => createHash('sha256').update(value).digest('hex')
export const manifestName = 'artifact-manifest.json'

export async function inventory(directory, relative = '') {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not deployable: ${name}`)
    if (entry.isDirectory()) files.push(...await inventory(directory, name))
    else if (name !== manifestName) {
      const content = await readFile(path.join(directory, name))
      files.push({ path: name, bytes: content.length, sha256: sha256(content) })
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

export function manifestDigest({ version, commit, files }) {
  return sha256(JSON.stringify({ version, commit, files }))
}

export async function verifyDirectory(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, manifestName), 'utf8'))
  if (manifest.artifactDigest !== manifestDigest(manifest)) throw new Error('Artifact manifest digest does not match.')
  const files = await inventory(directory)
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Artifact files changed after the build was frozen.')
  const build = JSON.parse(await readFile(path.join(directory, 'build.json'), 'utf8'))
  if (build.version !== manifest.version || build.commit !== manifest.commit) throw new Error('Build identity does not match the artifact.')
  return manifest
}
