# My Life in Motion

A phone-first, installable personal space. The check-in release includes morning/afternoon/evening phrase flows, a fixed six-ingredient reading, dated context, immediate results and editable local records. It contains no sample observations or recommendations.

Live app: https://bill6006.github.io/my-life-in-motion/

## Run locally

Use Node 22.12 or newer in the supported Node 22 line and npm. Install the lockfile with `npm ci`, then start with `npm run dev`. The base path is `/my-life-in-motion/`; the two built routes are the home view and `#/settings`.

## Validate a release

Run `npm run typecheck` and `npm test`, then `npm run build`. Install the test browser with `npx playwright install chromium`. Run `npm run test:e2e` against the frozen output and `npm run verify:artifact` afterward. A browser test deliberately alters a separate artifact copy and checks that verification rejects it.

The GitHub Actions workflow uploads that same tested output to Pages. The deployment job downloads it, verifies it, publishes it without a second build and compares every live file hash. `build.json` exposes the source commit and display version. `artifact-manifest.json` exposes per-file hashes and the aggregate digest. The action run summary records the digest and commit.

`release.json` controls the phase and revision; the commit suffix is injected at build time. Settings displays the running bundle’s version. Service-worker activation is explicit and disabled while a direction or check-in has unsaved changes.

## Local data

The `my-life-in-motion` IndexedDB database upgrades its original direction store in place and adds check-in records in schema 2. Each observation retains its original timestamp, window, timezone, anchor-definition version and foreground answering duration. Corrections keep the observation time; deletion removes the answers; scores are derived from the remaining records. The score requires all six ingredients, with permanent equal weights and no silent carry-forward.

No backend, account, analytics, remote fonts or record uploads are used. JSON exports include versioned records and anchor definitions; CSV labels recorded answers and calculated scores separately and guards against spreadsheet formula execution. Clearing browser site storage removes the records. Devices have separate databases. Persistence is requested after a successful user save. Backup restore and rhythm settings belong to the next release; no scheduled reminders are active yet.

All automated test records are synthetic, created in isolated browser contexts. Test screenshots and reports are ignored by Git and retained only as CI test artifacts. Never commit personal records, exports, private plans or progress ledgers.

Inter is bundled locally under the SIL Open Font License; the built site includes `font-license.txt`.
