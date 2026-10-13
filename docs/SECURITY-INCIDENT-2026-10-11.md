# Incident record — one leaked RPC key, and the four controls that missed it

**Devnet only. Written 11 October 2026.**

French version: [`SECURITY-INCIDENT-2026-10-11-FR.md`](SECURITY-INCIDENT-2026-10-11-FR.md).
The two are held together by `docs/outils/verifier-docs.mjs`, which fails on
any difference in fingerprint, URL, command or section count.

This document exists because the interesting part of a leak is never the leak:
it is *where it managed to hide*. Here it hid for three weeks in a place no
control in this repository could see, while every control reported success.

Every number below was measured, not estimated, and every command is
reproducible from a clone (section 7). **No value appears anywhere in this
file** — an exposed key is described by its `sha256` fingerprint and its
length only, the same discipline as `scripts/history-secret-scan.mjs`.

---

## 1. One paragraph

A devnet Helius API key, inherited from the initial project scaffold, was
being served **in clear text to every visitor** of the production site. The
repository had been clean of it for weeks, and every repository-level secret
check was green — truthfully. The key lived in the *deployment
configuration*, not in the code, and the build faithfully copied it into the
JavaScript it shipped.

| | |
|---|---|
| Where it was served | `https://buildpact-solana.vercel.app/assets/index-*.js` |
| In what form | `https://devnet.helius-rpc.com/?api-key=…` — one occurrence, 36-character key |
| How it is named here | fingerprint `e27f2e115ee5`, 36 chars |
| Was it still live? | **yes** — read-only `getHealth` probe: HTTP 200, `{"result":"ok"}` |
| The reservoir it came from | Vercel project variable `VITE_RPC_ENDPOINT` (Production **and** Preview) |
| Was it in the repository? | **no** — not in any git object, nor in either remote's history, nor in any of the 21 environment files on this machine |

---

## 2. Why every repository check was green — and why that proves nothing

| Control | What it actually verifies | Why it missed |
|---|---|---|
| `secret-scan.test.ts` | no secret in **tracked files** | the key was never in a tracked file |
| `history-secret-scan.mjs --profond` | all reachable blobs, binaries included — **1 095/1 095 read, 25.8 MiB, 0 findings** | not in history either; the history has since been rewritten |
| `rpc-proxy.test.ts` — "no file in `src/` reads a `VITE_RPC_*` variable" | the **read** path | true: the code had stopped reading it on 10 Oct (commit `80a48da`) |
| `rpc-proxy.test.ts` — "the shipped artifact carries no key-bearing endpoint" | the **locally built** `dist/` | true for that directory; production had been built from somewhere else |
| `check:prod` | which **commit** production serves | it never read the served bytes |

**The mechanism, in one sentence:** Vite inlines the value of every
`VITE_`-prefixed variable it evaluates at build time. The application stopped
*reading* the variable; the variable stayed *declared* on the platform. Two
green checks, both honest, both about the wrong half of the problem.

A control that inspects the read path does not see the declaration.

---

## 3. How it was found

The question was simply "is the key still there?". Each step answers it in a
way that cannot leak the value:

1. **All objects, orphans included** — `git cat-file --batch-all-objects --batch`,
   swept for `api-key=<20+ chars>` across 2 433 objects (including objects left
   unreachable by earlier history rewrites): one match, and it was a
   deliberate test fixture.
2. **Both remotes' history** — the literal searched across every remote ref:
   nothing.
3. **The disk** — every `.env*` file under `~/projects`, `~/.config`,
   `~/.agents` (21 files): none carried it.
4. **The deployment platform** — `vercel env ls` showed `VITE_RPC_ENDPOINT`
   present in Production *and* Preview; pulling it and comparing `sha256`
   against the fingerprint above identified it without printing it.
5. **The served artifact** — fetching the page and its 5 bundles and running
   this repository's own secret rules over them (`analyserBundle`): exactly one
   finding, the key.
6. **A read-only liveness probe** — `getHealth`: HTTP 200.

Steps 1–3 came back clean and steps 4–6 came back positive. That is the whole
incident in one line: **the repository was never the problem.**

---

## 4. What was done, and what is verified

| Action | State on 11 Oct 2026 |
|---|---|
| `VITE_RPC_ENDPOINT` removed from the Vercel project (Preview **and** Production) | done — re-listed with `vercel env ls`, both targets gone |
| Same variable + the legacy `VITE_REACT_APP_SOLANA_RPC_URL` removed from `.env.local` and `.env` | done, each replaced by a note explaining why the name is banned regardless of the value |
| New guard: `scripts/rpc-endpoint-guard.test.ts` refuses any `VITE_*` RPC endpoint **declared** in a local environment file — the files git ignores and `dist/` never shows | 4 test cases, including one asserting the detector is able to fail |
| `npm run check:soumission` now refuses *before probing* if such a declaration exists (`NE PAS DÉPOSER`, exit 1) | done; assertion in `pre-soumission.test.ts` updated from "reports" to "refuses" |
| `npm run check:prod` now downloads the page **and the bundles it references** and scans the served bytes; exit **3** means a secret-shaped value is being served | measured live: exit 3, naming the key by fingerprint only |
| CI | commit divergence stays informative; **exit 3 fails the job** — an exposed key is not a deployment lag |
| `analyserBundle()` — detector rule for minified bundles, calibrated on the 5 real served bundles | 3 findings for 1 real one → 1 finding, 0 false positives; the two `supabase-js` minified expressions that caused them are now explicit test cases |
| `npm run check:secret` — proves, by fingerprint, whether the relay's deployed upstream secret (`RPC_UPSTREAM_URL`) matches a local file, without printing the value | live-tested: divergent file → exit 1 with the exact repair command; missing file → exit 2 with step-by-step guidance |
| Production rebuilt from the same commit with the variable already gone — measured **before** and **after** on the served bytes | before: `assets/index-D_0cBmr-.js`, exit **3**, key served. after: `assets/index-B6Nb4E9p.js`, exit **1**, `✓ aucune valeur de forme secrète dans ce qui est servi` |
| `npm run check:parc` — sweeps **every** deployment of the project, not just production: it enumerates the fleet (`vercel ls`, pagination included), reads each page, groups by bundle name so an identical bundle is downloaded once, and fails with exit **3** if any served bundle carries a secret-shaped value | measured on the real fleet: 154 deployments enumerated, 63 distinct bundles, 99 serving a key of the two distinct ones. This is the question a single-URL check could not ask — and the one that found the second key. It needs the Vercel CLI and an authenticated project, so it is deliberately **not** in `npm test` nor in CI |
| The 99 keyed deployments removed from the Vercel project — measured **before** and **after** | before: 166 deployments enumerated, 99 serving a key. after: 55 enumerated, none serving one, `npm run check:parc` exit **0**; five sampled removed URLs answer **404**. Production was untouched throughout — HTTP **200**, same bundle `assets/index-B6Nb4E9p.js` |
| `npm run build` now ends with `scripts/build-guard.mjs`: the produced `dist/` is read file by file, and a secret-shaped value stops the build — **before** anything is sent anywhere | calibrated on the real `dist/`: 18 readable files, no finding. Planting a fake key under `dist/assets/` makes it fail (exit **3**, naming the file and the fingerprint) and it returns to green once removed. Same detection rules as everywhere else, so a false positive here would block every legitimate build |

`npm test` 340/340 · `typecheck` clean · `lint` 0 errors.

---

## 5. What is deliberately *not* claimed

- **Revoking is the only thing that kills a key.** Removing it from a
  repository, from an environment variable, or from history does not revoke
  it — and neither does rebuilding the site. Status on 11 October, measured
  with a read-only `getHealth` probe of the values actually served:
  `643570592694` → **HTTP 401, revoked**; `e27f2e115ee5` → **HTTP 200, still
  live**. One of the two remains, and it is the one in 98 deployments.
- **The old bundles are gone — and that too was measured.** All 166 deployments
  were enumerated and fetched: 99 served a page whose bundle carried a key,
  across 62 distinct bundles, back to 18 September. Those 99 have since been
  removed. Deleting them was never what closed the leak — **revoking did** —
  but it removed the last reachable copies of the bytes, which is worth having
  on its own.
- **That removal also destroyed the evidence that could measure a key.**
  Liveness was measured *from the served bundles*: `e27f2e115ee5` answered
  HTTP **200** at the last reading, taken before the copies were deleted. With
  no reachable copy left, that value can no longer be probed from here — it has
  to be confirmed in the provider's dashboard. A measurement that disappears
  with its own subject is a real limit, so it is written down rather than
  assumed away.
- **A second key was found while measuring, and it had never been reported.**
  Two distinct 36-character keys are served, and both answered a read-only
  `getHealth` probe with HTTP 200 on 11 October: `e27f2e115ee5`, the subject of
  this document, in 98 deployments, and `643570592694`, in one deployment from
  18 September. **Both must be revoked.** A one-key incident report would have
  left the other alive, and nothing in this repository would have shown it.
- **The Vercel project is not connected to a repository.** `vercel project
  inspect` shows no Git integration: deployments come from local or dashboard
  uploads. That is not a security flaw by itself, but it is the mechanism that
  made this incident possible — a build can carry a value the repository never
  contained, and no check that reads the repository can see it. It also means
  pushing to the repository does not update the site. Connecting it is a
  deployment decision, not a security one; until it is connected, nothing
  guarantees that what is online is what the repository says.
- **Unreachable objects on the remote cannot be enumerated** from a clone.
  The history was rewritten, so old objects may persist server-side until
  garbage collection. Harmless once revoked; unverifiable before.
- **The bundle detector has a stated blind spot.** An opaque identifier pasted
  under an innocent variable name (`const x = "…"`) is not detectable — a UUID
  does not look different from a hash. The detector catches keys in URLs,
  quoted literals under secret-looking names, known key formats, and
  Supabase `service_role` tokens. It does not claim more.
- **One rotation is still due**: the relay's own upstream key has never
  leaked, but it has been in place for weeks. `npm run check:secret` closes
  the verification gap that made such a rotation invisible in the first place.

---

## 6. The lesson worth more than the fix

The four controls that missed this were all well-built, and every one of them
tested a real property. The gap was not a weak check: it was a **missing
question**. Nobody had written the control that asks *"what bytes are we
actually serving, right now, to a stranger?"* — because the repository is
where we look, and the leak was not there.

That question is now asked by `npm run check:prod`, on every run, and it fails
loudly.

---

## 7. Reproduce, in six commands

```bash
npm run build                   # refuses to ship a secret-shaped value in dist/
npm run check:history:profond   # the repository and its whole history
npm run check:prod              # the bytes actually served (exit 3 = key served)
npm run check:parc              # the whole deployment fleet, not just production
npm run check:secret            # the deployed relay secret vs a local file, by fingerprint
npm test                        # the guards themselves, including their ability to fail
```
