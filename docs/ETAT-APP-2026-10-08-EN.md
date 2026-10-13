# 🗺️ BUILDPACT — CURRENT STATE OF THE APP (reference document)

> **Verified on 2026-10-08** · Solana Devnet only
> This document **replaces** the August 2026 roadmaps as the reference: those describe
> the app BEFORE the premium shell and are kept as archives (see "Document map" below).
> Every value here was **read from the code or measured** on 2026-10-08, never copied
> from an earlier document.

---

## 1. What the app is today

An on-chain pact between builders: a project is published with its roles and shares,
other devs apply, the agreement is written on-chain, backers fund an escrow, and
distribution follows.

| | |
|---|---|
| App repository | `Azumizeus/noah-6a8f756412768ce6d61b9376-75mv` — branch `main` |
| Last Noah commit merged | `869f0b7` (AI Update: Supabase fallback) |
| `main` on 2026-10-08 | **`5a6d9f6`** — 12 commits above `869f0b7`, pushed |
| Anchor program | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` (devnet) |
| Protocol fee | 200 bps (2%) → `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH` |
| Former program (dead) | `266V7Jct9EVWPeHscDwBpL13251EMUyak7WR9QiT59kQ` — closed, unrecoverable |

---

## 2. Actual technical architecture

- **Front end**: Vite + React 19 + TypeScript + Tailwind. Entry point `src/main.tsx`,
  hash-based routing (`src/lib/router.ts`), one route per page.
- **Wallet**: `@solana/wallet-adapter` with three adapters —
  `SolanaMobileWalletAdapter` (Seed Vault / Seeker), Phantom, Solflare. The
  `appIdentity.uri` is derived from `window.location.origin`: an identity pinned to a
  stale Vercel URL would break MWA authorization (fixed).
- **On-chain**: Anchor program with `create_project`, `add_member`, `remove_member`,
  `approve`, `finalize`, `fund`, `distribute`, `close_project`, `update_description`.
  No mutable admin account: fees and the protocol wallet are compiled constants.
- **Off-chain**: Supabase (profiles, media, discussion, document vault, builder
  directory, translations) + Edge Functions (`push`, `contact`, `network-write`,
  `quest-write`, `update-profile`, `translate`, `vault`, `project-write`,
  `chat-moderate`, `open-roles`). Standing rule: **no unverified public write** —
  sensitive writes go through a wallet signature.

### Two skins coexist (acknowledged intermediate state)

| | Premium shell | Legacy `/v1` |
|---|---|---|
| Routes | `#/`, `#/marketplace`, `#/pacts`, `#/builders`, `#/treasury`, `#/network`, `#/profile`, `#/docs`, `#/about`, `#/create`, `#/pact/<pda>` | `#/v1` and `#/v1/*` |
| Default look | **light** | **dark** |
| Theming | 4 palettes × 2 modes (`data-appearance` + `data-appearance-mode`) | historical theme (`data-theme` / `data-mode`) |
| Purpose | default path | **safety net** during the migration |

⚠️ Rule not to break: never read `data-mode` in the premium shell, nor
`data-appearance` / `data-appearance-mode` in the legacy pages. The two systems have
opposite defaults.

---

## 3. What shipped on 2026-10-08

| What changed | State | What it changes for the user |
|---|---|---|
| An anti-mass-push guard is committed | ✅ | the 5-file maximum rule finally exists everywhere, not on one machine |
| The premium shell's **Settings** | ✅ | density, RPC, language, USD display, appearance — without going through `/v1/profile` |
| The legacy settings folded into those Settings | ✅ | notifications + push, image preview, privacy, CSV export |
| **Pact creation** in the new design | ✅ | the wizard is untouched: the new design dresses it, it does not rewrite it |
| **Consistent project cards** | ✅ | banner bounded, fallback gradient follows palette and mode |
| The **profile edited in the premium shell reaches the server** | ✅ | a changed pseudo, avatar or banner shows in the builder directory and on other devices |

The **how** of these changes — work-item numbering, commits, internal mechanisms — lives
in `PLAN-CHANTIERS-PREMIUM-2026-10-08.md`. This document says what changed, not how: a
commit hash or a CSS class name means nothing to a reader who is not inside the repo.

**The premium profile now writes to the server.** This is the day's most important fix,
and it does not look like a bug: the premium form asked for a wallet signature… then
**wrote to the browser only**. A pseudo or avatar changed on the premium side therefore
showed up neither in the builder directory nor on another device — only the legacy portal
really wrote. The signature it asked for was pointless afterwards: it carried a message
the server never verified. Saving now writes locally first (the card updates immediately
and stays readable offline), then sends the full profile to the `update-profile` Edge
Function with the canonical message it can verify. The remote profile is read back before
sending, so a field the premium form does not expose (bio, links, availability, theme
palette) is not erased in the process.

**Two fixes outside those changes, on 2026-10-08.** The background-style picker offered
three "HD" variants whose images were never committed: three console 404s on every
settings open, and empty thumbnails. The three options are removed; an already-stored
value falls back cleanly to the default, and a test now rejects any reference to a file
missing from `public/`. Separately, a **square** banner overflowed its thumbnail and hid
the title, description and figures, while the fallback gradient was hard-coded in three
places, hence theme-blind: both are fixed, with a test that sweeps every premium page.

---

## 4. What remains

| What remains | Reason |
|---|---|
| Phasing out `/v1` | **Needs a decision**: keep `/v1` as a debugging door, or remove it? The "Historique ↗" link in `PremiumNav` must move with it. |

Unblocked: pact creation now exists on both sides, so removing `/v1` no longer breaks the
main path.

**What would disappear is measured, not estimated.** `INVENTAIRE-V1-2026-10-08.md` (§ 5)
lists the **52 files** that exist only under `/v1` — pages, components of the same name,
and even `PactPublicPage`, absent from the previous lists. The count is not the point that
matters for the decision: **five functional families have no premium equivalent**. Removing
`/v1` is therefore not a mere reskin cleanup, even though the main path itself is already
covered on the premium side.

⚠️ One thing not to miss before deleting anything: `ImagePreviewSettings` shares the
`previewEnabled` state with `ThemeContext`, and `ImageHoverPreview` (mounted on the premium
side by `PostCard`) uses it. The component can go, **not** `ThemeContext`.

### Settings left to the legacy skin — a deliberate decision, not an oversight

`ThemeModeGrid` (legacy theme), `BackgroundSwitch` (page backdrop),
`GlowStrengthSwitch` (halo intensity). The premium shell has its own appearance system:
copying them would create two competing controls for the same intent. And the halo only
feeds legacy box-shadows — it would have **no visible effect** in the premium shell: a
button that lies.

---

## 5. Verify the app yourself

From `buildpact-75mv/`:

```bash
npm run typecheck     # tsc, must exit 0
npm test              # node --test suite, 66/66 on 2026-10-08
npm run build         # typecheck + vite build
npm run guard:push    # rejects a batch larger than 5 files
npm run guard:install # run ONCE per clone: installs the pre-push hook
```

Working rules:

- **At most 5 files per push** (enforced by the committed guard); explicit escape hatch:
  `ALLOW_MASS_PUSH=1`.
- **Two consecutive failures on the same problem → STOP and ask.**
- A project card is edited in `PremiumProjectCard`, **never** in the pages.

---

## 6. Known limitations, not glossed over

| Limitation | Verified detail |
|---|---|
| Signing flows not tested by an agent | Creating a pact, funding, distributing: all require a real wallet. None of these flows has been run by an agent; they were validated by hand by Noah. |
| Real push subscription never exercised locally | The infrastructure exists (`public/push-sw.js`, `supabase/functions/push`, migration `create_push_subscriptions`). Only the VAPID keypair is missing. A real subscription is **impossible** from an automation browser: `Notification.permission` is `denied` there, and no agent tool can grant it. |
| Two demo pacts have a polluted description | The on-chain `description` field literally starts with `[🤝 Les deux]`. This is **not** a display defect: it is the stored text. It can be fixed through `updateDescription` (`EditDescriptionModal`), i.e. with a signature. |
| Profile saving not exercised with a real wallet | The premium profile's remote write is covered by unit tests and by the Edge Function contract (identical to the legacy portal, already in service), but the full path — signing with a real wallet, then reading the profile back from the directory — has not been run by an agent: it requires a wallet. |
| `/v1` is still reachable | Two live skins in parallel until it is removed. |

---

## 7. Document map (what is the reference, what is an archive)

| Document | Status |
|---|---|
| **`ETAT-APP-2026-10-08-FR.md` / `-EN.md` (+ `.html`)** | ⭐ **REFERENCE** — read this first |
| `ROADMAP-FR.md`, `ROADMAP-ENG.md` | 🗄️ Archive — hackathon roadmap, **exactly one per language** |
| `JUDGES-FR.md`, `JUDGES-ENG.md` | 🗄️ Archive — judges dossier, **exactly one per language** (includes the 19–20/09 audit pass) |
| `buildpact-dossier-complet-v3.html` | 🗄️ Archive — presentation dossier, after the hackathon but before the premium shell |
| `archive/` | 🗄️ Archive — **every remaining duplicate**, moved on 08/10: `ROADMAP- FR.md`, `ROADMAP- FR 2.md`, `ROADMAP-FR.html`, `ROADMAP-ENG.html`, `ROADMAP-FR (1).html`, `buildpact-roadmap-v2.html`, `buildpact-roadmap-v4.html`, `JUDGES FR.md`, `JUDGES ENG.md`, `buildpact-dossier-complet.html` |
| `CHECKLIST-TEST-WALLET-2026-10-08.md` | 🔧 Checklist to run with a real connected wallet (signatures, pact creation, description fix) — French only |
| `INVENTAIRE-V1-2026-10-08.md` | 🔧 Item 3a — measured inventory of what exists only under `/v1`, plus a reasoned recommendation — French only |
| `REVUE-DOCS-REFERENCE-2026-10-08.md` | 🔧 Review of this document: errors, gaps, passages too technical for an outside reader — French only |
| `PLAN-CHANTIERS-PREMIUM-2026-10-08.md` | 🔧 Technical journal of the premium items: the "how" (numbering, commits, mechanisms) |

**None of these files is deleted**: they keep the memory of the hackathon. They simply
carry an "archive" banner pointing here.

**One live version per family.** The duplicates sitting at the root of `docs/` — seven
roadmaps, two judges dossiers, one doubled presentation dossier — were **moved** into
`docs/archive/` on 2026-10-08: nothing was erased, but only one roadmap per language
(`ROADMAP-FR.md`, `ROADMAP-ENG.md`) and one judges dossier per language (`JUDGES-FR.md`,
`JUDGES-ENG.md`) remain. Why those: the `JUDGES FR.md` / `JUDGES ENG.md` variants, which
arrived on 08/10 with the working-folder import, were an earlier snapshot — they lack the
19–20/09 audit pass that the hyphenated versions carry.

**Where they live.** All of these documents sit in the `docs/` folder of the **app
repository** (`buildpact-75mv/`) — there is only one repository left. The `.html` files,
the checking scripts and the archive documents were moved out of the working folder that
held them: two repositories for a single project, one of which could not be pushed, was a
permanent source of divergence.

### Why two reference documents (FR and EN) instead of one

Because the hackathon English text was an **automatic line-by-line merge** (French then
English glued together), sometimes wrong ("damage" for "casse"). Today's EN versions are
written, not generated.The `.html` files are produced from
the `.md` files by `docs/outils/md-to-html.mjs`: one source per language, so Markdown and
HTML cannot diverge.

### Check that the documents have not diverged

From the app root (`buildpact-75mv/`):

```bash
node docs/outils/verifier-docs.mjs   # fails if a .html no longer matches its .md
```

The check regenerates each page in memory and compares it byte for byte with the one on
disk: it catches a `.md` edited without regenerating, as well as a `.html` edited by
hand. Only pages carrying the generator's signature are compared — the August roadmaps
exist as `.md` and `.html` without either deriving from the other, and including them
would raise two false alarms.
