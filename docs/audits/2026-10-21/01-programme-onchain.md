# Audit du programme on-chain — BuildPact (programme Anchor `workspace`)

**BuildPact** · Date : 21/10/2026 · Mode : **lecture seule** (aucun fichier du dépôt modifié, aucun `cargo` / `anchor` / `npm` / script node, aucun appel réseau)

---

## 1. Périmètre

| Élément | Chemin | Lignes / taille |
|---|---|---|
| Programme Anchor (source auditée) | `programs/workspace/src/lib.rs` | 816 lignes |
| Manifeste du programme | `programs/workspace/Cargo.toml` | anchor-lang 0.31.1, feature `init-if-needed` |
| IDL déclaré | `src/idl/buildpact.json` | 11 instructions, 23 codes d'erreur, 9 événements |
| Configuration de déploiement | `Anchor.toml` | program ID `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`, cluster devnet |
| Tests (lecture, non exécutés) | `tests/workspace.ts`, `tests/load-and-migration.ts` | 1044 + 1019 lignes |
| Point de contact client (lecture) | `src/lib/anchor.ts` | 691 lignes |

**Périmètre exclu** : frontend React au-delà de `src/lib/anchor.ts`, Edge Functions / RLS / Supabase (couverts par `02-backend-edge-functions-rls.md`), scripts de déploiement, `contracts/`.

**Modèle de menace retenu** : un tiers arbitraire (aucun privilège), ou un membre du pact qui agit de mauvaise foi, cherche à extraire des SOL du vault, à détourner les parts, à contourner le verrouillage de finalisation ou à bloquer un pact. Le créateur n'est pas considéré comme hostile par défaut (c'est le modèle de confiance produit), mais **les actions du créateur ne doivent pas pouvoir contourner les contrôles de solvency** (c'est explicitement demandé par l'équipe et c'est le point vérifié ci-dessous).

---

## 2. Méthode

1. Lecture **intégrale** des 816 lignes de `lib.rs`, instruction par instruction : dérivation des PDAs, contrôles d'accès, transitions d'état, arithmétique des parts et des lamports.
2. **Relecture du code généré par Anchor** (`anchor-syn 0.31.1`, crate présent dans le registre Cargo local) pour vérifier concrètement ce que font les contraintes `seeds` / `bump` / `has_one` / `init` — et ne pas les supposer. C'est le point critique demandé : Anchor ré-derive bien l'adresse et compare la clé.
3. Confrontation **source ↔ IDL** instruction par instruction : aucune instruction supplémentaire ou manquante, aucun écart de drapeaux `writable` / `signer`.
4. Reconstitution de l'invariant arithmétique du partage (`somme des parts == 10000`, `somme des floors ≤ after_fee`) et de la borne basse du vault (`balance ≥ rent_exempt` à tout instant).
5. Recensement **exhaustif des chemins de sortie de lamports** depuis le vault (3 chemins : `distribute` fee, `distribute` membres, `close_project`) pour établir si un tiers peut en extraire.
6. Lecture des deux suites de tests pour connaître les invariants attendus par l'équipe, et vérification que chaque contrôle que j'ai trouvé est (ou n'est pas) déjà couvert.
7. Lecture du client (`src/lib/anchor.ts`) pour établir qui appelle quoi et avec quelles autorités (nécessaire pour judge l'exploitabilité).

**Limites explicites de cet audit** :

- L'audit est **statique**. Aucun test n'a été exécuté (contrainte de lecture seule) : les scénarios d'exploitation sont **reconstitués et justifiés par le code**, pas observés sur chaîne.
- Le comportement exact du runtime Solana face à un compte crédité sous son seuil rent-exempt (erreur `InsufficientFundsForRent`) est un comportement **documenté du runtime**, vérifié ici par raisonnement sur `RentState` ; il n'a pas été rejoué sur validator. Le constat A1 est donc **à confirmer par un test LiteSVM** avant d'être présenté comme confirmé (recette de reproduction fournie).
- Le binaire déployé n'a pas été comparé octet à octet avec le source (hors périmètre lecture seule de ce lot) : le rapport porte sur **le source**, et l'IDL fourni est cohérent avec ce source, ce qui est un indice fort de parité.

---

## 3. Synthèse

| Sév. | Nb | Constats |
|---|---|---|
| **CRITIQUE** | **0** | — |
| **MAJEUR** | **1** | A1 |
| **MINEUR** | **3** | B1, B2, B3 |
| **INFO** | **6** | C1 → C6 |

**Verdict global** : le cœur de l'escrow est **solide**. Je n'ai trouvé **aucun chemin permettant à un tiers ou à un membre malveillant d'extraire des SOL du vault**, de dérober une part, de contourner le verrouillage de finalisation, ou de provoquer une confusion inter-projets. Les 11 instructions sont couvertes par une vérification d'adresse PDA effective côté runtime Anchor, l'arithmétique des parts est bornée et exacte, et le vault ne peut jamais descendre sous son seuil rent-exempt.

Le seul constat MAJEUR est un **verrouillage définitif de fonds** sous une condition précise (A1), et non un vol.

---

## 4. Tableau des constats

| # | Sév. | Constat | Fichier:ligne |
|---|---|---|---|
| **A1** | **MAJEUR** | `distribute` peut être bloqué **définitivement** si le compte de paie d'un membre ne peut pas atteindre son seuil rent-exempt : le runtime rejette toute la transaction et **aucune instruction ne permet de récupérer le vault** | `lib.rs:387-404` (+ `441`, `230`) |
| **B1** | MINEUR | `distribute` est **totalement sans autorisation** : `caller` n'est relié ni au projet, ni à un membre → un tiers peut imposer le déblocage de l'escrow à tout moment | `lib.rs:659`, `323-325` |
| **B2** | MINEUR | Le programme n'a **pas d'état « distribué »** : `status` reste `Finalized` après distribution, `fund` reste possible, `distribute` est rejouable et peut réussir en déplaçant 0 lamport tout en émettant `FundsDistributed` | `lib.rs:480-483`, `327`, `297-302` |
| **B3** | MINEUR | `add_member` peut échouer de façon **opaque** (`AccountDidNotSerialize`) sur les comptes Project antérieurs à l'upgrade du 27/08 (réserve d'espace calculée avec l'ancienne borne de rôle) | `lib.rs:212-217` vs `493-519` |
| **C1** | INFO | Un membre qui a approuvé est **définitivement verrouillé** : aucun chemin de sortie, pas même `remove_member` ne peut l'atteindre | `lib.rs:228-249` |
| **C2** | INFO | `distribute` transfère les parts à des comptes **arbitraires** (pas nécessairement des comptes système) sans contrôle préalable de recevabilité | `lib.rs:388-403` |
| **C3** | INFO | Code mort et dette technique : `InactiveAccount` (6003) jamais référencé, argument `protocol_wallet` de `create_project` sans effet, feature `init-if-needed` activée sans usage | `lib.rs:99`, `777` ; `Cargo.toml:44` |
| **C4** | INFO | `fund` utilise le `transfer` **non vérifié** du System Program (pas de `transfer_checked`) | `lib.rs:304-313` |
| **C5** | INFO | `create_project` accepte un `project_id` vide et une part créateur à 0 bps ; rien ne l'interdit, mais rien ne l'exige non plus | `lib.rs:101`, `105` |
| **C6** | INFO | Le compte `Project` est surdimensionné (~1 550 octets) pour tout pact, y compris un pact à 2 membres et une description courte → ~0,0117 SOL de rent par pact | `lib.rs:509-519` |

---

## 5. Détail des constats

### A1 — MAJEUR — `distribute` bloquable définitivement par un compte de paie non rent-exempt

**Emplacement** : `programs/workspace/src/lib.rs:387-404` (boucle de transfert), aggravé par `lib.rs:441` (garde de `close_project`) et `lib.rs:230` (verrou `Open` de `remove_member`).

**Description**

`distribute` fait un *push* : le programme débite le vault et crédite le compte du membre par un CPI `SystemProgram::transfer` :

```rust
// lib.rs:387-404
for (i, member) in members.iter().enumerate() {
    let target = &ctx.remaining_accounts[i];
    require!(target.key() == member.wallet, ErrorCode::MemberMismatch);
    let amt = member_amounts[i];
    if amt > 0 {
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer { from: ctx.accounts.vault.to_account_info(), to: target.clone() },
                signer_seeds,
            ),
            amt,
        )?;
    }
}
```

Le runtime Solana vérifie, **à la fin de la transaction**, que tout compte modifié et writable est rent-exempt. Si le compte crédité ne peut pas l'atteindre, la transaction entière est **annulée** avec `InsufficientFundsForRent` (`TransactionError`), y compris le transfert des frais de protocole et les transferts aux autres membres.

Or, dans BuildPact, le compte de paie d'un membre est **arbitraire** : c'est le champ `Member.wallet`, écrit par le créateur à `add_member`, figé à la finalisation. Le compte du membre est un compte **système** (il a signé `approve`, donc il existe et il est rent-exempt au moment de l'approbation). Mais **rien n'empêche ce compte d'être vidé (purgé) entre l'approbation et la distribution** : un membre qui transfère le solde de son wallet le fait passer à 0 lamport, le runtime le purge, et le compte redevient inexistant.

Conséquence : au moment de la distribution, le compte du membre est inexistant et reçoit `amt` lamports. Si `amt < minimum_balance(0) = 890 880 lamports` (soit < 0,000 89 SOL), le compte créé n'est pas rent-exempt → **la transaction est rejetée dans son ensemble**.

Et surtout, **il n'existe aucune sortie de secours** :

| Instruction | Pourquoi elle ne passe pas |
|---|---|
| `distribute` | Rejoue exactement la même opération → même rejet. Le vault est inchangé. |
| `close_project` | `require!(vault_lamports <= rent_min + DUST_TOLERANCE_LAMPORTS)` (`lib.rs:441`) → `VaultNotEmpty`. Le solde du vault est bien supérieur au seuil. |
| `remove_member` | `require!(project.status == ProjectStatus::Open)` (`lib.rs:230`) → `AlreadyFinalized`. Le membre fautif ne peut pas être retiré. |
| `fund` | Ne fait qu'ajouter des fonds ; ne débloque rien. |

→ **Les fonds du vault sont verrouillés définitivement.** Ni les membres, ni le créateur, ni un tiers ne peuvent plus les sortir.

**Scénario d'exploitation concret**

1. Alice (créatrice) crée un pacte `P` avec `creator_share_bps = 9 900` et ajoute Bob avec `share_bps = 100` (1 % — part parfaitement plausible pour un « advisor »).
2. Bob approuve le pacte. Le cap table est figé : Alice ne peut plus modifier la part de Bob (aucune instruction ne modifie une part existante).
3. Bob **vide son wallet** (transfert du solde vers une autre adresse) → son compte passe à 0 lamport et est purgé par le runtime. C'est une action légitime, et Bob peut même la faire avant de signer `approve`.
4. Alice finalise le pacte. Un backer finance 10 SOL via `fund`.
5. Bob (ou n'importe qui) appelle `distribute`. Le montant dû à Bob = `after_fee × 100 / 10000 ≈ 0,098 SOL = 98 000 lamports` < 890 880 → le runtime rejette la transaction (`InsufficientFundsForRent`).
6. **La distribution est désormais impossible pour toujours.** Les 10 SOL du vault, la part d'Alice (9,9 SOL) et la part des autres membres sont tous piégés. `close_project` échoue avec `VaultNotEmpty`, `remove_member` avec `AlreadyFinalized`.

**Gain de l'attaquant** : dans la variante agressive, Bob n'a rien à perdre (sa part est de 1 %) et provoque le blocage de 100 % des fonds d'autrui —ressurecte pure, ou levier de négociation («approbationne et on discute »). Dans la variante **accidentelle**, un membre qui quitte le projet et vide son wallet, ou un membre dont la part est symboliquement petite, suffit à bloquer toute l'équipe sans qu'aucune mauvaise intention ne soit requise.

**Exploitabilité — réponse honnête** : ce n'est **pas** un vol et **pas** un exploit « un clic par n'importe qui sur n'importe quel projet ». C'est un **blocage conditionnel** qui exige simultanément :
- un membre dont le compte de paie est (ou redevient) non rent-exempt — donc typiquement un wallet purgé ;
- une part effective inférieure au seuil rent-exempt du compte crédité — donc typiquement < 0,000 89 SOL, soit une part très faible **ou** un vault de petite taille.

En revanche, dès que ces deux conditions sont réunies, **l'impact est total, permanent et sans issue**. C'est ce qui justifie le classement MAJEUR plutôt que MINEUR : la probabilité est modérée, mais la perte est de 100 % et irréversible.

**Correctif recommandé**

Le correctif structurel est de **passer d'un modèle « push » à un modèle « pull »** : chaque membre retire lui-même sa part. Un membre dont le compte est inutilisable ne bloque alors que lui-même, et les autres sont payés.

```rust
// ── Nouveau modèle : retrait individuel (pull) ────────────────────────────
// Ajouter au struct Project :
//   pub claimed: Vec<bool>,      // aligné sur members
//   pub total_paid: u64,         // cumul déjà versé (pour l'audit)

// Instruction `claim` : chaque membre retire SA part.
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
    )]
    pub project: Account<'info, Project>,

    #[account(mut)]
    pub recipient: Signer<'info>,   // == members[i].wallet, vérifié dans le handler

    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let project = &mut ctx.accounts.project;
    require!(project.status == ProjectStatus::Finalized, ErrorCode::NotFinalized);

    let idx = project.members.iter()
        .position(|m| m.wallet == ctx.accounts.recipient.key())
        .ok_or(ErrorCode::NotAMember)?;
    require!(!project.claimed[idx], ErrorCode::AlreadyApproved); // à remplacer par AlreadyClaimed
    project.claimed[idx] = true;

    let rent_min = Rent::get()?.minimum_balance(0);
    let available = ctx.accounts.vault.lamports()
        .checked_sub(rent_min).ok_or(ErrorCode::InsufficientFunds)?;

    // La part est calculée sur le solde TOTAL effectivement accumulé, et non
    // sur un solde déjà amputé : le reliquat d'arrondi reste au vault.
    let share = project.members[idx].share_bps as u128;
    let amt: u64 = (available as u128)
        .checked_mul(share).ok_or(ErrorCode::MathOverflow)?
        .checked_div(TOTAL_BPS as u128).ok_or(ErrorCode::MathOverflow)?
        .try_into().map_err(|_| ErrorCode::MathOverflow)?;

    if amt > 0 {
        let project_key = project.key();
        let bump_arr = [ctx.bumps.vault];
        let seeds: &[&[u8]] = &[b"vault", project_key.as_ref(), &bump_arr];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.recipient.to_account_info() },
                &[seeds],
            ),
            amt,
        )?;
    }
    emit!(FundsClaimed { project: project_key, wallet: ctx.accounts.recipient.key(), amount_lamports: amt });
    Ok(())
}
```

**Si l'équipe veut conserver le modèle « push »** (moins de refonte), il faut **au minimum** un chemin de récupération, sinon le verrouillage reste définitif :

```rust
// 1) Garde explicite AVANT le transfert, pour transformer un rejet opaque du
//    runtime en erreur applicative lisible et un événement exploitable.
let target = &ctx.remaining_accounts[i];
let rent_exempt = Rent::get()?.minimum_balance(target.data_len());
require!(
    target.lamports().checked_add(amt).ok_or(ErrorCode::MathOverflow)? >= rent_exempt,
    ErrorCode::UnpayableMember   // nouveau code, ajouté EN FIN d'enum
);

// 2) Chemin de récupération : le créateur récupère la part d'un membre dont le
//    compte de paie est inutilisable, APRÈS un délai, et vers une adresse
//    de repli choisie par le membre lui-même (champ `payout_fallback`).
```

> Rappel de la règle du dépôt (`lib.rs:751-767`) : **tout nouveau code d'erreur doit être ajouté EN FIN de l'enum `ErrorCode`** (à partir de 6023), sinon les codes existants shiftent silencieusement.

**Recette de confirmation (à exécuter par l'équipe, hors de cet audit)**

```ts
// tests/workspace.ts — ajouter un test dédié
it("un membre dont le wallet est purgé bloque-t-il la distribution ?", async () => {
  // 1. créer un pacte finalisé avec un membre à 1 % de part
  // 2. vider le wallet du membre (transfert total vers un autre compte)
  // 3. fund(10 SOL)
  // 4. distribute → observer le code d'erreur exact du runtime
  //    attendu : "insufficient funds for rent" (TransactionError::InsufficientFundsForRent)
  // 5. rejouer distribute → même erreur, vault inchangé
  // 6. close_project → attendu : "VaultNotEmpty"
});
```

Si l'étape 4 ne reproduit pas l'erreur, **A1 doit être requalifié en INFO** : le constat repose sur le comportement documenté du runtime, non rejoué ici.

---

### B1 — MINEUR — `distribute` est sans autorisation

**Emplacement** : `lib.rs:659` (`pub caller: Signer<'info>`), `lib.rs:323-325`.

```rust
#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()], bump = project.bump)]
    pub project: Account<'info, Project>,
    #[account(mut, seeds = [b"vault", project.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut, address = project.protocol_wallet @ ErrorCode::InvalidParameter)]
    pub protocol_wallet: UncheckedAccount<'info>,
    pub caller: Signer<'info>,     // ← aucune contrainte
    pub system_program: Program<'info, System>,
}
```

`caller` est un `Signer` libre : **n'importe quel signataire peut déclencher la distribution**, sans être créateur ni membre. À comparer avec les autres instructions, où le signataire attendu est toujours boundé (`has_one = creator` sur `add_member`, `remove_member`, `finalize`, `update_description`, `close_project` ; signataire = le membre lui-même sur `approve`).

**Ce que ça ne permet PAS** (à vérifier, c'est le point rassurant) : **aucun vol**. Les bénéficiaires sont épinglés à `project.members` (`require!(target.key() == member.wallet)`, `lib.rs:389`) et cette liste est figée depuis `finalize`. La destination des frais est verrouillée par constante de compilation (`PROTOCOL_WALLET`, `lib.rs:14` + `lib.rs:106`). Le vault est dérivé de `project.key()`. Un tiers ne peut donc pas **rediriger** un lamport.

**Ce que ça permet** : un tiers **impose le déblocage de l'escrow** à un instant de son choix. Si la promesse produit est « les fonds restent en séquestre jusqu'à ce que l'équipe décide de les libérer », cette promesse n'est pas garantie on-chain : un tiers peut déclencher `distribute` dès la finalisation, sans que le créateur ait eu son mot. Symétriquement, un tiers peut injecter des SOL **directement** dans le PDA du vault (transfert natif, sans passer par `fund`) puis forcer la distribution — le creator n'a aucun contrôle sur le rythme de sortie.

Scénario : un concurrent ou un mécontent peut, dès qu'un pacte est finalisé et financé, appeler `distribute` lui-même et déclencher le versement des parts avant que le créateur ait publié sa milestone ou bouclé son recrutement — sans jamais pouvoir toucher un lamport.

**Correctif**

```rust
#[derive(Accounts)]
pub struct Distribute<'info> {
    ...
    /// Le déclencheur doit être le créateur ou un membre du pact.
    /// La vérification est faite dans le handler (le compte `caller` n'est
    /// pas dans `members`, donc `has_one` ne s'applique pas).
    pub caller: Signer<'info>,
}

pub fn distribute<'info>(ctx: Context<'_, '_, '_, 'info, Distribute<'info>>) -> Result<()> {
    let project = &ctx.accounts.project;
    let caller_key = ctx.accounts.caller.key();
    require!(
        caller_key == project.creator
            || project.members.iter().any(|m| m.wallet == caller_key),
        ErrorCode::Unauthorized
    );
    ...
}
```

Variante plus fine, si l'on veut garder la distribution permissionless mais rendre le déblocage explicite : ajouter un booléen `distributable` sur le compte `Project`, positionné par le créateur (ou par un quorum), et l'exiger dans `distribute`.

---

### B2 — MINEUR — pas d'état « distribué »

**Emplacement** : `lib.rs:480-483` (l'enum `ProjectStatus` ne contient que `Open` et `Finalized`), `lib.rs:327`, `lib.rs:297-302`.

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProjectStatus {
    Open,
    Finalized,        // ← pas de « Funded », pas de « Distributed »
}
```

Conséquences concrètes, toutes vérifiées :

1. **`fund` reste possible après une distribution** (`lib.rs:299-301` ne teste que `Finalized`). Un pact distribué peut donc recevoir de nouveaux fonds et être redistribué. Ce n'est pas une perte (chaque distribution ne paie que ce qui est réellement dans le vault, pro-rata exact), mais l'état on-chain ne reflète plus la réalité et l'indexeur doit la reconstruire hors chaîne.
2. **`distribute` est rejouable.** Après une première distribution, le vault ne contient plus que `rent_exempt + poussière` (poussière ≤ 7 lamports, cf. §6). Un second appel passe `require!(available > 0)` (available = 1..7) et réussit **en déplaçant 0 lamport** (les montants par membre tombent à 0), tout en émettant `FundsDistributed { fee_lamports: 0, total_distributed_lamports: 0 }`. Un indexeur naïf peut compter une « distribution » sans mouvement.
3. **Le produit annonce un état `Funded` / `Distributed`** dans la description fonctionnelle ; il n'existe pas on-chain. Il est déduit du solde du vault et des événements, hors chaîne.

**Correctif** : ajouter les états au `ProjectStatus` (c'est un enum de données, pas le `ErrorCode` — la règle de non-décalage des codes ne s'applique pas) :

```rust
pub enum ProjectStatus {
    Open,
    Finalized,
    Funded,       // vault alimenté au moins une fois
    Distributed,  // distribution effectuée
}
```

ou, plus simple et sans casser le frontend, un compteur sur le compte :

```rust
pub struct Project {
    ...
    pub total_distributed: u64,   // cumul versé aux membres
    pub distributions: u32,       // nombre de distributions effectuées
}
```

et, dans `distribute`, interdire la redondance :

```rust
require!(ctx.accounts.vault.lamports() > rent_min + 1, ErrorCode::DistributionEmpty);
```

---

### B3 — MINEUR — `add_member` échoue de façon opaque sur les comptes antérieurs à l'upgrade du 27/08

**Emplacement** : `lib.rs:212-217` (le `push`) vs `lib.rs:493-519` (les bornes de taille).

Les comptes `Project` créés **avant** l'upgrade du 27/08 ont un `space` figé, calculé avec les anciennes bornes (`description` 280, `title` 40, `role` 24) :

```
ancien Member::LEN  = 32 + (4 + 24) + 2 + 1 = 63
ancien Project::LEN = 32 + 24 + 44 + 284 + 4 + (63 × 8) + 1 + 32 + 1 = 926   (space = 934)
```

Or la borne de rôle a été portée à 32 : un membre sérialise désormais sur `32 + (4 + 32) + 2 + 1 = 71` octets. La taille sérialisée d'un pacte à `n` membres vaut :

```
S(n) = 32 + 24 + 44 + 284 + 4 + Σ(39 + r_i) + 1 + 32 + 1 = 422 + Σ(39 + r_i)
```

Pour un compte legacy (926 octets utiles) comportant déjà 7 membres (rôles ≤ 24 → 63 octets chacun) :

```
S(8) = 422 + 7×63 + (39 + r) = 461 + 441 + r = 902 + r
```

- `r ≤ 24` → `S ≤ 926` : passe exactement.
- `r ≥ 25` → `S ≥ 927 > 926` : **débordement**.

Anchor refuse d'écrire par-dessus la fin du compte (`BpfWriter` → `AccountDidNotSerialize`) : **pas de corruption**, mais un échec opaque, sans rapport avec la cause réelle, sur un pacte qui par ailleurs est parfaitement valide.

**Scénario** : sur un pacte legacy de 7 membres, la 8ᵉ addition avec un rôle de 25 à 32 octets (ex. « Responsable Marketing Digital ») échoue avec une erreur Anchor illisible. L'équipe ne peut rien faire d'autre que migrer le compte (`update_description`, qui déclenche le `realloc` vers `8 + Project::LEN = 1 558`) — chemin existe et le bouton de migration est présent côté front, mais rien dans le programme n'y oblige.

**Correctif** : Ne pas dépendre d'une migration manuelle. Deux options :

```rust
// Option A — forcer la migration au passage (simple, un surcoût de rent):
pub fn add_member(ctx: Context<AddMember>, wallet: Pubkey, role: String, share_bps: u16) -> Result<()> {
    let project = &mut ctx.accounts.project;
    require!(project.status == ProjectStatus::Open, ErrorCode::AlreadyFinalized);
    // ... contrôles parts ...

    // Refuser explicitement d'ajouter un membre si le compte n'a plus la
    // place, au lieu d'échouer plus tard sur la sérialisation Anchor.
    let role_len = role.len();
    let needed = 39 + role_len;
    let used = project.members.iter().map(|m| 39 + m.role.len()).sum::<usize>()
                 + 32 + 24 + 44 + (4 + project.description.len())
                 + (4 + project.title.len()) + 4 + 1 + 32 + 1;
    require!(used + needed <= 8 + Project::LEN, ErrorCode::AccountTooSmall);
    ...
}
```

```rust
// Option B — recommandé : ajouter `realloc` au contexte AddMember, exactement
// comme UpdateDescription, pour que le compte soit dimensionné à l'écriture.
#[derive(Accounts)]
pub struct AddMember<'info> {
    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
        has_one = creator @ ErrorCode::Unauthorized,
        realloc = 8 + Project::LEN,
        realloc::payer = creator,
        realloc::zero = false,
    )]
    pub project: Account<'info, Project>,

    #[account(mut)]
    pub creator: Signer<'info>,
}
```

> Attention : `realloc::payer = creator` rend `creator` mutable et facturera le rent différentiel au créateur — c'est le comportement déjà retenu pour `update_description` (cf. `lib.rs:541-566`), donc cohérent.

---

### C1 — INFO — un membre approuvé est définitivement verrouillé

`remove_member` (`lib.rs:228-249`) est réservé au créateur (`has_one = creator`) et refuse de retirer un membre **approuvé** (`lib.rs:239`). Il n'existe aucune instruction de retrait pour un membre lui-même, ni de « mise à jour d'adresse de paiement ».

Conséquence : un membre qui approuve par erreur (ou qui découvre ensuite que le créateur a modifié le *troisième* membre de la cap table avant finalisation) est lié au pacte à jamais, sans aucune voie de sortie on-chain et sans aucun droit sur le vault.

Ce n'est pas exploitable (aucun transfert de fonds n'est détourné) et cela relève d'un choix de produit ; c'est signalé parce que c'est une **asymétrie notable d'un pacte dont l'un des selling points est la « cap table »**.

Correctif possible (si le produit le souhaite) : une instruction `leave` (membre non approuvé, ou membre approuvé qui remplit sa part de frais), ou un champ `payout_address` modifiable par le membre.

---

### C2 — INFO — recevabilité des comptes de paie non contrôlée

`distribute` (`lib.rs:388-403`) n'effectue aucune vérification sur la nature du compte crédité : n'importe quel compte de 32 octets est accepté comme `Member.wallet`, y compris un compte détenu par un programme, un compte de stake, un compte de token, ou une adresse qui n'a jamais existé. Le System Program n'exigeant pas que le **destinataire** soit détenu par le System Program, le transfert aboutit dans la plupart des cas — c'est précisément ce qui rend le scénario A1 possible (un compte purgé recréé sous son seuil). Le correctif d'A1 (contrôle explicite de recevabilité + chemin de récupération) couvre ce point.

---

### C3 — INFO — code mort et dette technique

- `ErrorCode::InactiveAccount` (`lib.rs:777`, code 6003) n'est référencé nulle part. Le commentaire (`lib.rs:760-762`) explique qu'il est conservé pour ne pas décaler les 19 codes suivants — arbitrage assumé et documenté, mais le code peut être retiré au prochain *breaking change* d'IDL coordonné.
- L'argument `protocol_wallet` de `create_project` (`lib.rs:99`) est sans effet fonctionnel depuis le verrouillage sur `PROTOCOL_WALLET` (`lib.rs:106`) — conservé pour la compatibilité IDL, documenté comme tel.
- La feature Cargo `init-if-needed` est activée (`Cargo.toml:44`) mais **aucune contrainte `init_if_needed` n'est utilisée** dans `lib.rs`. La feature n'affecte pas la sémantique de `init` (qui refuse toujours de réinitialiser un compte existant), mais elle élargit inutilement la surface du programme : une future modification pourrait introduire un `init_if_needed` par copier-coller, avec les risques connus de réinitialisation. **Recommandation : la retirer** tant qu'aucun usage n'existe.

---

### C4 — INFO — `fund` utilise le `transfer` non vérifié

`lib.rs:304-313` utilise `anchor_lang::system_program::transfer`, qui n'effectue pas de contrôle d'overflow sur le solde crédité, contrairement à `transfer_checked`. Sur Solana le total d'offre est de ~500 M SOL, très loin de `u64::MAX` (≈ 18,4 Md SOL) : **le risque est purement théorique**. `transfer_checked` reste la bonne pratique et costs quelques lamports de CU supplémentaires.

---

### C5 — INFO — `project_id` vide et part créateur à 0 bps acceptés

`create_project` (`lib.rs:101`, `lib.rs:105`) autorise `project_id` vide (seed PDA vide, valide) et `creator_share_bps = 0`. Les deux sont des choix non défensibles en soi ; `project_id` vide est légèrement à éviter car il rend l'identification des pacts hors chaîne ambiguë (`PDA("project", creator, "")` vs `PDA("project", creator, "")` — un seul, mais visuellement trompeur avec un `project_id` visuellement vide). La part à 0 est un montage documenté et testé (`tests/workspace.ts:1006`).

---

### C6 — INFO — surdimensionnement du compte `Project`

`Project::LEN` (`lib.rs:509-519`) réserve la description maximale (800), le titre maximal (80) et **8 membres à 71 octets**, quelle que soit la taille réelle du pacte. Un pacte à 2 membres avec une description de 50 octets occupe quand même 1 558 octets, soit un rent de `((128 + 1558) × 3480 × 2) ≈ 11 734 560 lamports ≈ 0,0117 SOL` par pact. Le surcoût est faible et le `realloc` de `update_description` va dans cette direction, mais un dimensionnement dynamique (`init` avec une taille calculée sur le contenu, puis `realloc` à l'écriture) réduirait le rent de la grande majorité des pacts.

---

## 6. Ce qui est correct — contrôles vérifiés (utile pour le dossier Colosseum)

Ce sont des contrôles **relus dans le code et dans le code généré par Anchor** (`anchor-syn 0.31.1`, source locale), pas supposés.

### 6.1 Dérivation et re-vérification des PDAs — **conforme**

Toutes les PDAs sont **ré-derivées et comparées par le runtime Anchor**, et non simplement « passées en compte ». Vérifié dans `anchor-syn-0.31.1/src/codegen/accounts/constraints.rs` :

| Contrainte | Code généré | Effet |
|---|---|---|
| `seeds = [...], bump` (sans valeur) | `Pubkey::find_program_address(&[...], program_id)` puis `if <account>.key() != __pda_address { return Err(ConstraintSeeds) }` | Adresse **et** bump canonique vérifiés |
| `seeds = [...], bump = project.bump` | `Pubkey::create_program_address(&[... , &[bump]], program_id)` puis comparaison de clé | Adresse recalculée à partir du bump stocké, comparée à la clé réelle |
| `init, seeds, bump` | `find_program_address` + `create_account` CPI signé avec les seeds | Le compte est **créé** par le programme à la bonne adresse |

Application :

- `project` (toutes instructions) : `seeds = [b"project", project.creator, project.project_id], bump = project.bump` → l'adresse du compte est recalculée depuis ses **propres** champs. Ces trois champs (`creator`, `project_id`, `bump`) sont écrits **une seule fois**, à `create_project` (`lib.rs:111-116`), et **aucune instruction ne les réécrit**. La vérification est donc auto-référentielle mais **non falsifiable** : un compte `Project` ne peut exister qu'aux adresses `PDA("project", creator, project_id)` produites par le programme.
- `vault` (`fund`, `distribute`, `close_project`) : `seeds = [b"vault", project.key()], bump` → le vault est **toujours** dérivé du projet courant. **Aucune confusion inter-projets possible** : passer le vault d'un autre projet fait échouer la comparaison d'adresse.
- `protocol_wallet` : `address = project.protocol_wallet` + verrouillage à la création par constante de compilation `PROTOCOL_WALLET` (`lib.rs:14`, `lib.rs:106`) → les 2 % ne peuvent être redirigés vers un wallet arbitraire, même par un appel direct au programme hors frontend.

### 6.2 Signature du vault — correcte

`distribute` (`lib.rs:369-371`) et `close_project` (`lib.rs:445-447`) reconstruisent les seeds de signature à partir du **bump canonique** fourni par le runtime (`ctx.bumps.vault`, lui-même issu du `find_program_address` d'Anchor) :

```rust
let bump_arr = [vault_bump];
let seeds: &[&[u8]] = &[b"vault", project_key.as_ref(), &bump_arr];
let signer_seeds: &[&[&[u8]]] = &[seeds];
```

`project_key` est bien `ctx.accounts.project.key()` — la même clé que celle qui a servi à dériver le vault. Pas de divergence possible.

### 6.3 Contrôle d'accès — complet sur toutes les instructions à signataire attendu

| Instruction | Signataire attendu | Mécanisme |
|---|---|---|
| `create_project` | le créateur | `payer = creator`, `Signer` + `mut` |
| `add_member` | le créateur | `has_one = creator` (`lib.rs:574`) |
| `remove_member` | le créateur | `has_one = creator` (`lib.rs:587`) |
| `finalize` | le créateur | `has_one = creator` (`lib.rs:612`) |
| `update_description` | le créateur | `has_one = creator` (`lib.rs:555`) |
| `close_project` | le créateur | `has_one = creator` (`lib.rs:671`) + `close = creator` |
| `approve` | **le membre lui-même** | le handler retrouve le membre par `ctx.accounts.member.key()` et refuse si absent (`lib.rs:256-260`) → pas d'approbation pour le compte d'autrui |
| `fund` | n'importe qui | dépôt —plier, pas une action privilégiée |
| `distribute` | **aucun** | ← **constat B1** |

Les tests existants couvrent explicitement le rejet par un non-créateur (`tests/workspace.ts:248`, `:483`) et l'approbation par un non-membre (`tests/workspace.ts:878`).

### 6.4 Verrouillage de la cap table après finalisation — effectif

- `add_member`, `remove_member`, `update_description` sont tous verrouillés par `require!(project.status == ProjectStatus::Open)`.
- **Aucune instruction ne modifie la part d'un membre existant** : il n'existe pas de `update_share`. Les seules mutations possibles de la liste sont l'ajout et le retrait de membres **non approuvés**, et `add_member` refuse de dépasser 10 000 bps cumulés (`lib.rs:210`).
- Conséquence : **un membre approuvé ne peut pas être dilué** par le créateur. C'est le point le plus important du modèle de confiance et il est correct.
- `finalize` exige `members.len() >= 2`, l'approbation de **tous** les membres (`lib.rs:276-279`) et `somme == 10000` **exactement** (`lib.rs:286`). Pas de `>=`, pas de tolérance.

### 6.5 Arithmétique des parts — exacte et non débordante

- `share_bps` est un `u16` : aucune valeur négative possible, et la comparaison `share_bps <= TOTAL_BPS` (`lib.rs:192`) ne peut pas déborder.
- Les cumuls sont calculés en `u128` avec `checked_add` (`lib.rs:202-210`) — jamais de `u16`/`u32` intermédiaire.
- `finalize` recalcule le total depuis les données stockées (`lib.rs:281-286`) : il ne fait **pas** confiance à une valeur mémorisée, il la relit. Impossible de « finaliser à 80 % ».
- Doublons interdits à l'entrée (`lib.rs:197-200`) → **pas de double comptage d'un même wallet**, qui aurait permis de recevoir deux fois sa part.
- Maximum 8 membres (`lib.rs:196`), cohérent avec la réservation d'espace `Member::LEN * MAX_MEMBERS`.
- Le membre créateur est ajouté à la création et ne peut pas être ré-ajouté (`DuplicateMember`) ni retiré (`CannotRemoveCreator`, `lib.rs:231`).

### 6.6 Partage pro-rata et absence de lamport-drain

Reformulation de `distribute` (`lib.rs:336-367`) :

```
available = balance(vault) − rent_exempt(0 octet) = balance − 890 880
fee       = ⌊available × 200 / 10000⌋            (exactement 2 %)
after_fee = available − fee
partᵢ     = ⌊after_fee × bpsᵢ / 10000⌋
```

- **Proportionnel exact** : `Σ bpsᵢ = 10000` est garanti par `finalize` et la liste est figée ensuite → `Σ partᵢ ≤ after_fee`.
- **Aucune overdraft possible** : `fee + Σ partᵢ ≤ fee + after_fee = available` → **le vault ne peut jamais descendre sous `rent_exempt`**. Le risque de lamport-drain par un montant qui laisse le vault sous le seuil est **écarté par construction**.
- **Frais prélevés sur le vault, pas sur la Bombine** : la fee sort du vault (`from: vault`), comme demandé.
- **Poussière bornée** : la perte d'arrondi vaut `after_fee − Σ partᵢ = Σᵢ frac(after_fee × bpsᵢ / 10000) < n ≤ 8` lamports, très en dessous de `DUST_TOLERANCE_LAMPORTS = 1 000` → `close_project` reste possible après distribution (test `tests/workspace.ts:669`).
- **Divergence somme-des-parts / total-versé** : `total_transferred` est calculé par accumulation `checked_add` (`lib.rs:363-365`) et c'est **exactement** la somme des montants effectivement transférés — l'événement `FundsDistributed` ne ment pas (correction de la trouvaille Noah AI #4 conservée).
- `transfer_checked` n'est pas utilisé, mais le `SystemProgram::transfer` suffice ici (cf. C4) ; **aucun `transfer` non vérifié n'est utilisé pour débiter un compte dont le solde est calculé** — les débits du vault passent tous par le System Program.

### 6.7 Absence de surface de ré-entrance / TOCTOU

- Le programme n'appelle **que** le System Program, via CPI, en `fund`, `distribute` et `close_project`. **Aucun appel externe vers du code contrôlé par l'utilisateur** → pas de surface de ré-entrance (pas de callback ERC-777/ERC-1155 équivalent).
- Toutes les lectures précèdent les écritures sur le **même** compte `project` dans la même instruction, sans appel externe intermédiaire → pas de fenêtre TOCTOU.
- Tous les comptes mutables fournis par le signataire sont des comptes **détenus par le programme** (`Account<'info, Project>`) ou **par le System Program** (`SystemAccount<'info>`), et leurs adresses sont **vérifiées** (§6.1). **Aucun compte ne peut être substitué entre deux instructions.**

### 6.8 Absence de « lecture qui réécrit »

Aucune instruction de lecture pure n'écrit. `fund` ne modifie pas le compte `Project` (il n'est pas `mut` dans son contexte — `lib.rs:622-625`), il crédite le vault : c'est un dépôt, pas une lecture. `distribute` ne modifie pas non plus `Project` (cf. B2, mais ce n'est pas une écriture inutile : c'est un état manquant). **Aucune instruction morte** : les 11 instructions de l'IDL sont toutes appelées par le frontend ou par les tests.

### 6.9 Cohérence source ↔ IDL

Les 11 instructions de `src/idl/buildpact.json` correspondent **une à une** au source, avec les mêmes drapeaux `writable` / `signer` et les mêmes seeds de PDA. Aucun code d'erreur fantôme, aucune instruction fantôme. `declare_id!` (`lib.rs:4`) correspond au program ID déclaré dans `Anchor.toml`. **Aucun écart visible entre le code source et l'IDL distribué au client.**

---

## 7. Annexes

### Annexe A — Cartographie exhaustive des chemins de sortie de lamports du vault

C'est le tableau qui fonde le verdict « aucun vol possible ».

| # | Instruction | Source | Destination | Plafond | Vérifié |
|---|---|---|---|---|---|
| 1 | `distribute` (frais) | vault | `project.protocol_wallet` | `⌊available × 2 %⌋` | destination verrouillée par constante de compilation + `address =` |
| 2 | `distribute` (parts) | vault | `ctx.remaining_accounts[i]`, avec `key == members[i].wallet` | `Σ ≤ after_fee` | liste figée à `finalize`, `MemberMismatch` sinon |
| 3 | `close_project` | vault | `project.creator` (le signataire) | `rent_exempt + 1 000` lamports | `VaultNotEmpty` sinon ; `has_one = creator` |

Aucun autre débit du vault n'existe dans le programme. **Les trois chemins sont contraints.**

### Annexe B — Hors périmètre, mais noté au passage

Ces éléments ne sont pas des constats sur le programme on-chain ; ils sont signalés parce qu'ils affectent la lecture du rapport ou la suite du dossier.

1. **`src/lib/anchor.ts:602-615` (`distributeWithReceipt`)** — le reçu hors chaîne calcule la fee et les parts sur `pact.vaultBalanceSol` (le solde **brut**), alors que le programme calcule sur `balance − rent_exempt` et prélève **2 % de `available`**, puis répartit `after_fee`. Le reçu affiché est donc **légèrement surestimé** par rapport à ce qui a réellement été viré (écart = rent du vault + arrondis, soit de l'ordre du millilamport). C'est un écart d'affichage, pas une divergence de sécurité — mais il mérite d'être aligné, surtout si le reçu est présenté comme une preuve de répartition.
2. **`tests/load-and-migration.ts:69-70, 86`** — les commentaires indiquent `Project::LEN = 1250` et `space = 1258`, valeurs **périmées** (l'espace maximal de description est passé de 500 à 800). **Le code du test est correct** (il recalcule à partir des constantes `MAX_*`), donc les assertions sont valides ; seuls les commentaires sont trompeurs et méritent d'être remis à jour pour ne pas induire un futur auditeur en erreur.
3. **Aucun secret, clé privée ni valeur sensible** ne figure dans ce rapport. Les seules adresses citées (`PROTOCOL_WALLET`, program ID) sont déjà publiques dans le dépôt et sur la chaîne.

### Annexe C — Ce que je n'ai **pas** trouvé (contrôles effectués, résultat négatif)

Pour être complet sur la couverture, list explicite desQuestions posées et de la réponse :

| Question | Réponse |
|---|---|
| Un tiers peut-il vider le vault ? | **Non.** 3 chemins de sortie, tous contraints (§Annexe A). |
| Un membre peut-il obtenir plus que sa part ? | **Non.** `partᵢ = ⌊after_fee × bpsᵢ / 10000⌋`, `Σ bpsᵢ = 10000` garanti, liste figée. |
| Le créateur peut-il récupérer un vault financé ? | **Non.** `close_project` est plafonné à `rent_exempt + 1 000` lamports. |
| Peut-on diluer un membre approuvé ? | **Non.** Aucune instruction ne modifie une part ; `add_member` refuse de dépasser 10 000 bps. |
| Peut-on ré-finaliser, re-distribuer frauduleusement, modifier un membre après finalisation ? | **Non** pour la finalisation et la modification de membres (verrou `Open`). **Partiellement** pour la distribution : rejouable mais sans effet sur les fonds (B2). |
| Peut-on distribuer un vault non financé ? | **Non** : `available > 0` (`lib.rs:341`) et `balance − rent_exempt` négatif → `InsufficientFunds`. |
| Confusion inter-projets ? | **Non** : le vault est dérivé de `project.key()` et l'adresse est revérifiée. |
| Un compte peut-il être substitué entre deux instructions ? | **Non** : toutes les PDAs sont revérifiées par le runtime Anchor. |
| Débordement / sous-dépassement d'entier ? | **Non.** `u16` pour les parts, `u128` + `checked_*` pour tous les cumuls, `checked_sub` sur le solde. |
| Le vault peut-il descendre sous le seuil rent-exempt ? | **Non**, par construction (§6.6). La seule voie de blocage est A1 (transaction rejetée, pas de drain). |

---

*Fin du rapport — audit statique, lecture seule. Aucun fichier du dépôt n'a été modifié à l'exception de ce document de rapport.*
