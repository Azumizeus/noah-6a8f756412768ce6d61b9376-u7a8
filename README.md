# BuildPact — the builders' pact. Trust, written in code.

**Solana Devnet · [Live demo](https://buildpact-solana.vercel.app) · Hackathon build**

> ### Judges — start here, no wallet needed
>
> | What | Link |
> |---|---|
> | **Guided tour, 8 steps, no wallet** (the argument to make) | https://buildpact-solana.vercel.app/#/demo |
> | **Real finalized pacts on devnet** | https://buildpact-solana.vercel.app/#/marketplace |
> | Live app | https://buildpact-solana.vercel.app |
> | Program ID (devnet) | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` · [IDL](src/idl/buildpact.json) |
> | Judge notes | [EN](docs/JUDGES-ENG.md) · [FR](docs/JUDGES-FR.md) |
> | Demo script | [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md) |
>
> **Devnet only** — mainnet is planned after the event. Every number, account and
> transaction below is real and measured on devnet, not mocked.

---

## What BuildPact is

BuildPact is an **on-chain cap table and escrow for Solana builders**.

A founder posts a project with the roles they need and the share each role is
worth. Other builders apply with their wallet and a negotiated share. Once
every member has approved and the shares add up to 100%, the founder locks the
deal on-chain. Backers can then fund the project's vault, and when the time
comes the funds are distributed automatically — 2% to the protocol, 98% to the
members, pro-rata by share, in a single transaction.

The product intent fits in one sentence: **make it costly to go back on your
word.** A verbal agreement between three people who code on weekends does not
survive the first check; a Solana account signed by all three does.

## Who it is for, and why

| User | What they get |
|---|---|
| **Founders** | Publish an idea and its roles, onboard co-founders, and lock the deal without manually coordinating a single payment. |
| **Builders / devs** | Join a project with a verifiable, on-chain share instead of a promise in a Discord DM. |
| **Backers** | Fund a project whose allocation is public and immutable — what a member approved at finalization is exactly what they receive at distribution. |

The missing layer, not a replacement for the tools builders already use: GitHub
still holds the code and Discord still holds the conversation. BuildPact adds
trust and payment — roles, shares, approval, escrow and distribution become
verifiable on-chain instead of relying on an informal agreement.

## How it works

```
create_project → add_member → approve → finalize → fund → distribute
```

1. **Create** — the founder describes the project and its roles on-chain.
2. **Join** — members apply with their wallet, role and negotiated share.
3. **Finalize** — once every member has approved and shares total 100% (10 000
   basis points), the founder locks the pact. After that, shares cannot change.
4. **Fund** — backers fund the vault, a program-derived escrow account.
5. **Distribute** — 2% protocol fee, 98% split between members pro-rata, in one
   transaction.

Live, finalized pacts are visible on the
[Marketplace](https://buildpact-solana.vercel.app/#/marketplace).

## On-chain architecture

| Item | Value |
|---|---|
| Program ID | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` |
| Framework | Anchor 0.31.1 / Rust |
| Project PDA | seeds `["project", creator, project_id]` |
| Vault PDA | seeds `["vault", project]` |
| Share model | basis points, 8 members max, total = 10 000 bps |
| Protocol fee | `PROTOCOL_FEE_BPS = 200` (2%) — compile-time constant |
| Network | Devnet (mainnet is post-hackathon) |

There is deliberately **no mutable config account**. The protocol fee and its
recipient are constants baked into the program: what a member approves at
finalization is exactly what they receive at distribution, and no key can raise
the fee without a full program upgrade.

Every account is derived from canonical seeds, with signer checks and checked
arithmetic throughout. Share totals are accumulated in `u128` with
`checked_add`, so the 100% bound cannot be bypassed by integer wrapping.

### Where data lives

| Data | Location | Why |
|---|---|---|
| Members, shares, approvals | **On-chain** | This is the product: it must outlive the server. |
| Vault, distribution | **On-chain** | It moves funds. |
| Title, description, roles | **On-chain** | Part of the signed agreement. |
| Logos, media, profiles, chat, applications, activity feed | Supabase | Cosmetic, bulky or non-contractual; a read cache where the chain stays the source of truth. |

## Frontend & backend

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind, `@solana/wallet-adapter` (desktop + Mobile Wallet Adapter) |
| Routing | Hash routing (static hosting, no server rewrite needed) |
| i18n | FR / EN, in-app switch |
| Backend | Supabase — Realtime chat & updates, Postgres |
| Auth model | Wallet `signMessage` (ed25519), no Supabase accounts |
| Deploy | Vercel (static) |

**The read path is direct; the write path never is.** The frontend's Supabase
client has no write rights on business tables. Every write goes through a
Supabase Edge Function that proves identity by ed25519 signature (or a
verified on-chain transaction) and then writes with `service_role`. The author
field is always set by the server from the wallet whose signature was just
verified — never from a client-supplied value.

## Repository layout

| Path | What it is |
|---|---|
| `programs/workspace/src/lib.rs` | The Anchor program — the whole on-chain product |
| `src/pages/`, `src/components/` | BuildPact UI (public app: `/`, `/pacts`, `/create`, `/marketplace`, `/demo`, `/treasury`, …) |
| `src/pages/premium/` | The NOAH AI platform tier that hosts BuildPact (routes `/v1/*`) — not part of the judged product |
| `supabase/functions/` | Edge Functions: the RPC relay, the read/write split, the assistant |
| `tests/` | On-chain suite — runs on LiteSVM, no validator, no network |
| `docs/` | Judge notes, security notes, demo script, submission kit |

## Security

Two real vulnerabilities were found by an internal audit and fixed in the
program live on devnet:

1. **Protocol fee hijack** — `protocol_wallet` was not locked at creation, so a
   direct program call could redirect the 2% fee. Fixed with a fixed
   `PROTOCOL_WALLET` constant, enforced by `require!`
   (`InvalidProtocolWallet`, 6021), with a negative test in the suite.
2. **Vault drain on close** — `close_project` could sweep a funded-but-
   undistributed vault. Fixed by refusing to close when the vault holds more
   than `DUST_TOLERANCE_LAMPORTS` (`VaultNotEmpty`, 6022).

A later frontend audit pass added anti-double-spend on `fund`, a single source
of truth for claimable amounts (net of the 2% fee), CSV formula-injection
guards on the Treasury export, and client-side bounds on pact creation.

## Tests

- **On-chain:** 43/43 passing (`tests/workspace.ts` 27 + `tests/load-and-migration.ts` 16) — full happy path (create → add members →
  approve → finalize → fund → distribute, checking the protocol receives
  exactly 2%) plus every rejection path: wrong protocol wallet, non-creator
  signers, over-100% shares, incomplete shares, unapproved members, duplicate
  wallets, the 8-member cap, post-finalization changes, and payout-list
  tampering. The suite runs on **LiteSVM**, in-process: no validator, no
  network, no devnet.
- **Frontend / tooling:** `npm test` runs the repository's guard-rail suite
  (secret scanning, history scanning, premium-page boundaries and more).

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, RPC_URL
npm run dev        # local dev server
npm test           # guard-rail suite
npm run typecheck  # TypeScript, no emit
npm run build      # typecheck + production build
```

To rebuild the program locally (Anchor 0.31.1, `avm install 0.31.1`):

```bash
anchor build                                                      # target/idl + target/deploy
npx ts-mocha -p ./tsconfig.anchor.json -t 1000000 "tests/**/*.ts"  # on-chain suite (LiteSVM)
```

> ⚠️ Do **not** run `anchor test` in this repository: `[provider] cluster` is
> `devnet`, and the upgrade authority in `~/.config/solana/id.json` is the
> live one — `anchor test` would redeploy over the program running on devnet.
> The suite above runs on LiteSVM, in-process, with no validator and no network.

## Documentation

| Document | Contents |
|---|---|
| [`docs/JUDGES-ENG.md`](docs/JUDGES-ENG.md) | English deep dive: flow, architecture, security, anticipated questions |
| [`docs/JUDGES-FR.md`](docs/JUDGES-FR.md) | French version |
| [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) | Guided demo walkthrough |
| [`docs/ETAT-APP-2026-10-08-EN.md`](docs/ETAT-APP-2026-10-08-EN.md) | Current app state (EN) |
| [`RESUME_PROJET.md`](RESUME_PROJET.md) | Full project summary (FR) |
| [`DOSSIER_TECHNIQUE.md`](DOSSIER_TECHNIQUE.md) | Technical dossier: architecture decisions and their trade-offs (FR) |
| [`docs/`](docs/) | Full documentation index |

---

Built for the Solana hackathon. Devnet only — mainnet deployment is planned
after the event.
