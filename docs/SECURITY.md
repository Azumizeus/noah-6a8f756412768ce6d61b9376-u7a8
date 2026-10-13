# BuildPact — Security model and threat model

**Devnet only.** Nothing here is a mainnet guarantee. This document describes
what the program *enforces* and what it deliberately does **not** try to
enforce, so a reviewer can check the claims against the code instead of
trusting them.

Every value in this file was read from the repository at the time of writing:

| Constant | Value | Where |
|---|---|---|
| Program ID | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` | `Anchor.toml`, `src/lib/constants.ts` |
| `PROTOCOL_FEE_BPS` | `200` (2%) | `programs/workspace/src/lib.rs` |
| `PROTOCOL_WALLET` | `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH` | `programs/workspace/src/lib.rs` |
| `MAX_MEMBERS` | `8` | idem |
| `DUST_TOLERANCE_LAMPORTS` | `1000` (0.000001 SOL) | idem |
| `MAX_TITLE_LEN` / `MAX_DESC_LEN` / `MAX_ROLE_LEN` | `80` / `800` / `32` bytes | idem |
| Project PDA | seeds `["project", creator, project_id]` | idem |
| Vault PDA | seeds `["vault", project]` | idem |

---

## 1. The threat model in one line

The adversary is **anyone who can send a Solana transaction to the program
directly** — not just someone who clicks buttons in our frontend. A pact is a
financial agreement between strangers, so every rule has to hold when the
frontend is bypassed entirely.

This is the assumption that produced both findings below: the official
frontend sent the right value, so the bug was invisible in the UI and
exploitable from a script.

## 2. What the program enforces

The design choice that carries most of the security weight is negative:

> **There is no mutable config account.** The protocol fee and its recipient
> are compile-time constants (`PROTOCOL_FEE_BPS`, `PROTOCOL_WALLET`), not
> stored settings.

A config PDA would hand its authority the power to raise the fee — up to
100% — on pacts that are already finalized and funded. Removing the account
removes that authority entirely: no key can raise the fee without deploying a
new program version.

The second choice is that **every share is an absolute value in basis
points**, not a percentage recomputed from a pool. A member's `share_bps` is
written once, when the creator adds them, and no instruction anywhere mutates
it. The cumulative total is accumulated in `u128` with `checked_add`: with 8
members the sum can reach 80 000, which overflows `u16` — the wider
accumulator means the "total ≤ 10 000" bound cannot be bypassed by wrapping.

## 3. On-chain invariants and their error codes

Every rejection below is an executable test in `tests/workspace.ts`, not a
comment. The error codes come straight from `ErrorCode` in `lib.rs`.

### Access control

| Condition | Error | Code |
|---|---|---|
| `create_project` with a `protocol_wallet` that isn't the locked one | `InvalidProtocolWallet` | 6021 |
| signer isn't the creator (`add_member`, `close_project`, `finalize`, `update_description`) | `Unauthorized` | 6002 |
| signer isn't a member (`approve`, `distribute`) | `NotAMember` | 6009 |
| trying to remove the creator | `CannotRemoveCreator` | 6018 |

### Cap table — the shares cannot lie

| Condition | Error | Code |
|---|---|---|
| `creator_share_bps > 10000` | `ShareExceeded` | 6008 |
| cumulative total would exceed 10 000 | `ShareExceeded` | 6008 |
| `finalize` with a total below 10 000 | `SharesNotComplete` | 6013 |
| `finalize` with an unapproved member | `NotAllApproved` | 6012 |
| same wallet listed twice | `DuplicateMember` | 6007 |
| a 9th member | `TooManyMembers` | 6006 |
| fewer than two members | `NotEnoughMembers` | 6011 |
| `add_member` on a finalized pact | `AlreadyFinalized` | 6014 |
| removing a member who already approved | `MemberAlreadyApproved` | 6020 |
| member address not found | `MemberNotFound` | 6019 |

The duplicate-wallet rule is not cosmetic: a wallet listed twice would collect
its share twice at distribution.

### Money

| Condition | Error | Code |
|---|---|---|
| `distribute` with a payout account swapped for an attacker's | `MemberMismatch` | 6016 |
| `distribute` with a truncated payout list | `MemberMismatch` | 6016 |
| `fund` on a pact that isn't finalized | `NotFinalized` | 6015 |
| `distribute` with an empty vault | `DistributionEmpty` | 6017 |
| `close_project` while the vault still holds more than `DUST_TOLERANCE_LAMPORTS` | `VaultNotEmpty` | 6022 |
| any arithmetic overflow | `MathOverflow` | 6000 |

## 4. Two real vulnerabilities, found and fixed

Both were found by an internal audit, both are fixed in the program
**currently deployed on Devnet**, and both have a negative test in the suite.

### 4.1 Protocol fee hijack

`protocol_wallet` — the account receiving the 2% fee — was not locked at
`create_project`. The official frontend always sent the right address, so
nothing looked wrong in the product. But a direct program call from a script
or an alternate frontend could have redirected the protocol's fees to an
arbitrary wallet, on every pact.

**Fix:** a compile-time `PROTOCOL_WALLET` constant, enforced by a `require!`
at creation that rejects any other value (`InvalidProtocolWallet`, 6021).

### 4.2 Vault drain on close

`close_project` could sweep a vault that was funded but not yet distributed.
A founder could therefore close a funded pact and take the members' entire
share.

**Fix:** `close_project` refuses while the vault holds more than
`DUST_TOLERANCE_LAMPORTS` (`VaultNotEmpty`, 6022). Below that threshold the
residual dust is refunded to the creator.

The same threshold closes a second hole, found while writing the fix: a
**dust-pollution denial of service**. Without it, anyone could send a few
lamports to a stranger's vault and permanently block its `close_project`,
locking the rent forever. Now the vault closes and refunds instead of
staying stuck.

## 5. Off-chain layer

The frontend holds no write rights on business tables. Every write goes
through a Supabase Edge Function that proves identity first.

| Function | Identity proof |
|---|---|
| `project-write`, `vault`, `push`, `quest-write`, `network-write`, `open-roles`, `update-profile`, `contact`, `chat-moderate` | **ed25519 signature** over a server-provided message (`tweetnacl`), or a verified on-chain transaction. The author field is always set by the server from the wallet whose signature was just verified — never from a client-supplied value. |
| `translate` | No signature check by design (a wallet popup per translated message would be unusable). Compensated by a per-identity daily quota of 8000 characters. |
| `rpc` | No signature check, and none is meaningful: it serves the chain, not user data. Compensated by a **method allowlist**, a 64 KiB body cap, a maximum batch size, and a per-IP rate limit. The dedicated node's API key lives in a server secret and never reaches the browser. |

Two client-layer findings from the 19–20 September audit (full report, zero
critical findings) are also fixed:

- **Anti double-spend** — a confirmation timeout can no longer trigger a
  second `fund`: the client re-checks the status of the signature it already
  sent before any retry.
- **CSV formula injection** — a Treasury export neutralizes Excel formula
  injection carried by on-chain titles (see `src/lib/exportTreasury.ts`).

## 6. Known limitations — read this part

Stated plainly, because a security document that only lists strengths is
marketing.

1. **A member added after others approved does not reset their approval.**
   No existing payout changes — shares are absolute basis points, so a
   newcomer's share comes out of the unallocated remainder, never out of
   someone else's slice. But a member who approved does not re-consent to the
   arrival of a new counterparty. Forced re-approval on every membership
   change is V2 work.
2. **Funding happens after finalization, Kickstarter-style.** A member can
   receive funds and then disappear. The risk is visible to backers and
   knowingly accepted; payment milestones are V2.
3. **The program's upgrade authority has not been rotated to a dedicated
   key.** Until it is, whoever holds the deploy key can replace the program.
   Scheduled post-hackathon.
4. **No global pause, no admin, no recovery.** That is the deliberate
   absence of a backdoor — and also means a bug cannot be frozen in place.
5. **The protocol wallet is a single address.** Key compromise there affects
   fee collection, not member payouts (distribution amounts are computed from
   the stored shares, not from the fee recipient).

## 7. Out of scope

- **Mainnet.** Devnet only, until fully validated.
- **Wallet security.** Seed phrases, device compromise and malicious wallets
  are outside the program's control.
- **Supabase's own infrastructure.** Row-level security policies are in
  `supabase/migrations/`, but the platform itself is trusted.

## 8. Re-verifying these claims

```bash
npm test                    # guard-rail suite: secret scanning, history scanning, boundaries
npm run check:history       # scans every blob of the whole Git history for secret shapes
npm run check:history:profond   # same, reading binaries too, no size ceiling
npm run check:helius        # specifically: no Helius API key anywhere in the history
npm run typecheck
npm run build
```

The on-chain suite lives in `tests/workspace.ts` and runs through LiteSVM:

```bash
anchor test
```

---

*BuildPact — the builders' pact. Trust, written in code. Devnet only.*
