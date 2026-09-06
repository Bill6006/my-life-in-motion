# My Life in Motion

A phone-first, installable personal space. The foundation release has a designed empty reading, a direction written by its owner, local editing/deletion/exports, and offline access. It contains no sample observations or recommendations.

Live app: https://bill6006.github.io/my-life-in-motion/

## Run locally

Use Node 22.12 or newer in the supported Node 22 line and npm. Install the lockfile with `npm ci`, then start with `npm run dev`. The base path is `/my-life-in-motion/`; the two built routes are the home view and `#/settings`.

## Validate a release

Run `npm run typecheck` and `npm test`, then `npm run build`. Install the test browser with `npx playwright install chromium`. Run `npm run test:e2e` against the frozen output and `npm run verify:artifact` afterward. A browser test deliberately alters a separate artifact copy and checks that verification rejects it.

The GitHub Actions workflow uploads that same tested output to Pages. The deployment job downloads it, verifies it, publishes it without a second build and compares every live file hash. `build.json` exposes the source commit and display version. `artifact-manifest.json` exposes per-file hashes and the aggregate digest. The action run summary records the digest and commit.

`release.json` controls the phase and revision; the commit suffix is injected at build time. Settings displays the running bundle’s version. Service-worker activation is explicit and disabled while a direction has unsaved changes.

## Local data

The `my-life-in-motion` IndexedDB database has one versioned direction record. No backend, account, analytics, remote fonts or record uploads are used. JSON is a versioned backup; CSV is readable and guards against spreadsheet formula execution. Clearing browser site storage removes the record. Devices have separate databases. Persistence is requested after a successful user save, and the app reports the browser’s answer accurately.

All automated test records are synthetic, created in isolated browser contexts. Test screenshots and reports are ignored by Git and retained only as CI test artifacts. Never commit personal records, exports, private plans or progress ledgers.

Inter is bundled locally under the SIL Open Font License; the built site includes `font-license.txt`.
