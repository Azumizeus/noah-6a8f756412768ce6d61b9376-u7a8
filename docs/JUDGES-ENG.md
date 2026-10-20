# BuildPact — the builders' pact. Trust, written in code.

**Colosseum · Devnet only · [Live demo](https://buildpact-solana.vercel.app) · [Guided tour, no wallet](https://buildpact-solana.vercel.app/#/demo) · [Real pacts](https://buildpact-solana.vercel.app/#/marketplace)**

---

## In one sentence

BuildPact is a Kickstarter + on-chain cap table for Solana builders: a founder posts an idea with its roles and shares, devs and investors join the pact, the deal locks on-chain, and funds distribute automatically according to shares — 2% protocol, 98% to members.

## Why now

Solana devs already work on GitHub and Discord. BuildPact doesn't replace those tools — it adds the missing layer: trust and payment. Roles, shares, approval, escrow and distribution become verifiable on-chain instead of relying on an informal agreement.

A solo founder can scope an idea, post the roles they need, onboard members, and lock the deal without manually coordinating a single payment.

## The full flow (live-testable)

```
create_project → add_member → approve → finalize → fund → distribute
```

1. **Create** — the founder describes the project, its roles, their own share.
2. **Join** — members apply with their wallet, role, and negotiated share.
3. **Finalize** — once every approval is in and shares total 100%, the founder locks the pact on-chain.
4. **Fund** — backers fund the vault (a PDA escrow), 100% verifiable.
5. **Distribute** — 2% protocol fee, 98% to members pro-rata by share, in a single transaction.

Three real, finalized, working pacts are visible right now on the [Marketplace](https://buildpact-solana.vercel.app/#/marketplace).

## Stack

| Layer | Tech |
|---|---|
| Program | Anchor 0.31.1, Rust, Solana Devnet |
| Frontend | React + Vite + TypeScript, Tailwind, Wallet Adapter |
| Backend | Supabase (signMessage auth, Realtime chat/updates) |
| Deploy | Vercel |

## On-chain architecture

| Item | Value |
|---|---|
| Program ID | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` |
| Project PDA | seeds `["project", creator, project_id]` |
| Vault PDA | seeds `["vault", project]` |
| Protocol fee | `PROTOCOL_FEE_BPS = 200` (2%) — hardcoded constant |
| Protocol wallet | `PROTOCOL_WALLET` — hardcoded, enforced at `create_project` |
| Network | Devnet only (mainnet = post-hackathon) |

There is deliberately **no mutable config account**. The protocol fee and the fee recipient are compile-time constants baked into the program. A config PDA would hand its authority the power to raise the fee — up to 100% — on pacts that are already finalized and funded. Constants remove that attack surface entirely: what a member approves at finalization is exactly what they receive at distribution, and no key can change it without a full program upgrade.

Every account is derived from canonical seeds, with signer checks and checked arithmetic throughout — no share or distribution math that can silently overflow or be spoofed client-side.

## Security: two real vulnerabilities found and fixed

**1. Protocol fee hijack.** An internal audit (Claude + vulnhunter) found that `protocol_wallet` — the address receiving the 2% fee — wasn't locked in `create_project`. The official frontend always sent the correct value, but a direct program call from any script or alternate frontend could have redirected the protocol's fees to an attacker's wallet.

Fix: a fixed `PROTOCOL_WALLET` constant in the program, enforced with a `require!` that rejects any other value (`InvalidProtocolWallet`, error 6021). The negative test is part of the passing suite, and the program currently live on Devnet includes the fix.

**2. Vault drain on close.** A second hardening pass closed the `close_project` path. A finalized pact whose vault still holds more than `DUST_TOLERANCE_LAMPORTS` (1000 lamports, ~0.000001 SOL) can no longer be closed — it returns `VaultNotEmpty` (error 6022). Below that threshold the vault is treated as fully distributed and the residual dust refunds to the creator. Without the threshold, a founder could have closed a funded-but-undistributed pact and swept the members' entire share.

The dust-pollution attack is neutralized by the same mechanism: sending a few lamports to someone's vault to permanently block their `close_project` no longer works — the vault closes and refunds the creator instead of locking rent forever.

Full threat model, invariant tables and error codes: **[`SECURITY.md`](./SECURITY.md)**.

### Third audit round (19–20 Sept 2026) — frontend layer

A structured second audit pass (full report, zero critical findings) covered the program plus the whole client layer:

- **Anti double-spend** — a confirmation timeout can no longer trigger a second `fund` transaction: the client re-checks the status of the already-sent signature before any retry.
- **Financial consistency** — the claimable quote (`myClaimableSol`) is net of the 2% protocol fee everywhere; Profile, pact card and Treasury share a single source of truth.
- **CSV injection guard** — the Treasury history export neutralizes Excel formula injection (`=HYPERLINK…`) via on-chain titles.
- **Robust pact creation** — shares are bounded before any transaction (no negative/NaN `shareBps`), the 8-member limit is actually enforced client-side, and a pact can't be created twice in one session.
- Remaining on-chain hardening (full-distribution marker, Edge Function replay nonces) is documented as V2 work in the repo.

## Tests

**43/43 passing** — 27 in `tests/workspace.ts`, 16 in `tests/load-and-migration.ts`. Full happy path (create → add members → approve → finalize → fund → distribute, verifying the protocol receives exactly 2% and members split 98% pro-rata) plus every rejection path.

**Access control and lifecycle**

- `create_project` with a `protocol_wallet` that isn't the locked one
- `add_member` from a non-creator signer
- `close_project` from a non-creator signer
- `approve` from a wallet that isn't a member
- funding a project that isn't finalized
- `close_project` on a finalized pact whose vault still holds funds
- dust-polluted vault closes and refunds instead of blocking
- distributed pact closes cleanly, creator recovers rent

**Share bounds — the cap table can't lie**

The orbital cap table the frontend renders is only trustworthy if the program guarantees the shares it stores are bounded. Each of these is an executable proof, not a claim:

- `create_project` with `creator_share_bps > 10000` → `ShareExceeded`
- `add_member` whose cumulative total would exceed 10000 → `ShareExceeded`, member list left untouched
- `add_member` landing on exactly 10000 succeeds; one more basis point on top is refused
- `finalize` with shares summing to less than 10000 → `SharesNotComplete`, pact stays open
- `finalize` with an unapproved member → `NotAllApproved`
- duplicate member wallet → `DuplicateMember` (a wallet listed twice would collect its share twice at distribution)
- 9th member → `TooManyMembers`
- `add_member` on a finalized pact → `AlreadyFinalized`
- `distribute` with a payout account swapped for an attacker's → `MemberMismatch`; truncating the payout list → `MemberMismatch`; the correct list still pays out

The cumulative share total is computed in `u128` with `checked_add`. With 8 members at 10000 bps each the sum reaches 80000, which overflows `u16` — the wider accumulator means the bound check can never be bypassed by wrapping.

## Questions we're anticipating

**What if a dev disappears after getting paid?**

V1: funding happens post-finalization, Kickstarter-style — the risk exists but is visible and knowingly accepted by backers. V2 (post-hackathon): payment milestones + on-chain builder reputation.

**Can shares be changed?**

Not after the pact is finalized — that's a guarantee, not a limitation: nobody can rewrite the deal after the fact. Before finalization the creator can add or remove members, and a member can only be removed while they haven't approved yet. No instruction anywhere mutates an existing member's `share_bps`: a share is set once, at the moment that member is added, and the only way to change it is to remove the member (possible only pre-approval) and add them again.

One honest limitation of V1: adding a member after others have already approved does not reset their approval. No existing member's payout changes — shares are absolute basis points, so a newcomer's share comes out of the unallocated remainder, never out of someone else's slice. But a member who approved does not re-consent to the arrival of a new counterparty. Forced re-approval on every membership change is a V2 item.

**Can the protocol raise its fee on my pact?**

No. The 2% is a compile-time constant, not a stored setting. There is no admin account and no instruction that can change it. Changing the fee requires deploying a new version of the program.

**And security?**

Canonical PDA seeds, signer checks everywhere, checked arithmetic, no mutable admin surface, and two real vulnerabilities found and fixed before the demo (see above).

## What's not done yet (honesty first)

- Rotating the program's upgrade authority to a dedicated key (planned post-hackathon).
- V2: payment milestones, on-chain reputation, member replacement.
- Mainnet: deliberately out of scope — Devnet only until fully validated.

## Going deeper

| Document | What's in it |
|---|---|
| [`SECURITY.md`](./SECURITY.md) | Threat model, every on-chain invariant with its error code, the findings and their fixes, and the known limitations |
| [`ROADMAP-ENG.md`](./ROADMAP-ENG.md) | Day-by-day build log and post-hackathon plan |
| `programs/workspace/src/lib.rs` | The program — 9 instructions, no admin surface |
| `tests/workspace.ts` | The main suite, LiteSVM — 27/27 |
| `tests/load-and-migration.ts` | The 27/08 upgrade & load suite, LiteSVM — 16/16 |

---

*Devnet only. No mock data: the three pacts visible on the Marketplace are real on-chain accounts, created, approved and finalized through the program's full flow.*