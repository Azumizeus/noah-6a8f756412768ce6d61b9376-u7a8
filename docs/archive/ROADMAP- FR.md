
> ⚠️ **DOCUMENT HISTORIQUE — conservé tel quel.**
> Feuille de route du **hackathon (août 2026)**. Elle décrit l'app d'AVANT le
> shell premium et n'est plus à jour. **Doublon** : brouillon antérieur de `ROADMAP-FR.md`.
> **Référence actuelle : `ETAT-APP-2026-10-08-FR.md`** (ou sa version HTML
> `ETAT-APP-2026-10-08-FR.html`), section « Carte des documents ».

# 🗺️ BUILDPACT — FEUILLE DE ROUTE HACKATHON (20 → 26 août 2026)

## 🔐 INFOS VERROUILLÉES
- **Program ID** : `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`
  (⚠️ mis à jour le 22/08 — l'ancien `266V7Jct9EVWPeHscDwBpL13251EMUyak7WR9QiT59kQ`
  a été fermé et est mort/irrécupérable)
- **Fee** : 200 bps (2 %) → `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH`
- **Réseau** : Devnet uniquement
- **Config PDA** : supprimé le 24/08. L'ancien compte
  `5yRNQhn7W6sCFNVWhTWbZowQRKL7dNSaqYkpTtPxEF2C` est orphelin et inerte —
  le fee et le wallet protocole sont désormais des constantes compilées
  (aucun compte admin mutable). Voir `SECURITY.md` §3.
- **Tests** : 24/24 ✅

## ✅ FAIT
Program Anchor (create / add_member / remove_member / approve / finalize /
fund / distribute / close_project) · Frontend Vercel · Wizard 3 étapes
(pleine largeur, logo/bannière/vidéo) · Reprise pact orphelin · AddMemberModal
(multi-rôles, pleine largeur, total des parts visible) · Marketplace/Discovery ·
Fiche pact publique (QR, partage, historique on-chain, fil d'avancement
membres) · Treasury données réelles · Docs/About refondues · Audit A11y
WCAG 2.1 AA · 3 bugs wallet fiabilité corrigés (rotation RPC retry,
déconnexion autoConnect, messages d'erreur RPC) · i18n FR/EN complet (landing
incluse) · Profil builder sécurisé (signMessage + avatar + niveau de
compétence + mode aperçu/édition + export PDF) · Vault de documents privés par
projet (signature + vérif on-chain, historique de versions) · Chat + fil
d'avancement par projet · Annuaire des builders (recherche, notation 1-6
étoiles, demandes de contact) — tout sécurisé par signature wallet, aucune
écriture publique non vérifiée.

## 📅 PLAN

### J-6 (20/08) — Nettoyage & Rust — ✅ FAIT
- [x] Supprimer vestiges Vault (frontend + state inutile)
- [x] `close_project` (creator only, si non finalisé, vault vide) → récupère rent
- [x] `remove_member` (creator, tant que pending) + tests → redéployé devnet

### J-5 (21-22/08) — Fiche projet — ✅ FAIT
- [x] Page projet détaillée : description, rôles ouverts, % shares, équipe, roadmap
- [x] Bouton « Postuler à un rôle » / « Financer »
- [ ] `cancel_pact` UI (creator) — pas fait, scope réduit (pas critique démo)

### J-4 (22/08) — Marketplace (CRITIQUE démo) — ✅ FAIT
- [x] Page Discovery : tous les projets ouverts + filtres (rôle recherché, financement)
- [x] Cards : pitch, % restant, rôles dispo, montant financé
- [x] Bonus : logo/bannière/vidéo projet, fil d'avancement membres, liens
      historique on-chain (kit démo juges)

### J-3 (23/08) — Profil & Chat — ✅ FAIT (terminé en avance le 22/08)
- [x] Profil builder : signMessage → Supabase (bio, skills, liens, niveau de compétence, avatar)
- [x] Page profil : mes pacts, mes gains, historique, mode aperçu/édition
- [x] Chat simple par projet (Supabase Realtime)

### Hors plan (22/08, soir/nuit) — Vault, annuaire builders, sécurisation
- [x] Vault de documents privés par projet — upload membres, review founder,
      historique de versions (`supersedes_id`), signature + vérif on-chain
- [x] Annuaire builders (`/builders`) — recherche, filtre disponibilité
- [x] Demandes de contact entre builders — SÉCURISÉ (signature signMessage
      des 2 côtés, table fermée par RLS, Edge Function `contact`)
- [x] Notation des builders 1-6 étoiles — sécurisé dès le départ (signature +
      unicité par paire de wallets), moyenne publique via vue agrégée
- [x] Badges de notification (nouveau message/document) sur les cartes pact
- [x] Lien direct partageable vers un document du vault
- [x] Export PDF du profil builder
- [x] Fix bug fiabilité : signature wallet ne doit JAMAIS se déclencher
      automatiquement au chargement d'une page (popup instable) — exige
      systématiquement un clic explicite

### Hors plan (22/08, fin de nuit) — Finitions annuaire
- [x] Bouton « Discussion & Vault » masqué sur la fiche pact elle-même
      (redondant avec chat+vault déjà affichés en dessous) et réduit en
      taille partout ailleurs
- [x] Recherche de l'annuaire élargie : insensible aux accents/casse,
      cherche aussi bio + compétences (pas seulement le pseudo)
- [x] Fiche détaillée builder au clic sur une carte de l'annuaire (bio
      complète, compétences+niveaux, liens, wallet, note, bouton Contacter)
- [x] Investigation popup signature persistant sur Profil : code confirmé
      propre (aucun `signMessage` auto en `useEffect`) — hypothèse : build pas
      redéployé depuis le fix ; à confirmer après redeploy Vercel + hard refresh

### J-2 (24/08) — Sécurité & Polish — ✅ FAIT
- [x] Audit sécurité du programme — 2 failles réelles trouvées et corrigées :
      - `protocol_wallet` non verrouillé dans `create_project` (détournement
        des frais protocole) → constante `PROTOCOL_WALLET` + `require!`
        (`InvalidProtocolWallet`, 6021)
      - vidage du vault via `close_project` sur un pacte financé mais non
        distribué → seuil `DUST_TOLERANCE_LAMPORTS` (`VaultNotEmpty`, 6022).
        Neutralise aussi le griefing par pollution de poussière.
- [x] Suppression du compte `Config` mutable (code mort + surface d'attaque :
      son autorité aurait pu monter le fee jusqu'à 100 % sur des pacts déjà
      finalisés et financés) → constantes compilées, aucun compte admin
- [x] Durcissement des bornes de parts : cumul en `u128` + `checked_add`
      (8 membres × 10000 bps = 80000, déborde un `u16`)
- [x] Suite de tests portée de 14 à **24/24** — bornes de parts, doublons,
      cap à 8 membres, unanimité, intégrité des paiements (`MemberMismatch`
      sur wallet substitué ou liste tronquée)
- [x] `SECURITY.md` — modèle de menace, failles corrigées, invariants on-chain,
      limites connues assumées
- [x] `AUDIT.md` — audit accessibilité
- [x] `JUDGES ENG.md` / `JUDGES FR.md` — dossier juges bilingue, liens croisés
- [x] Polish UX/A11y · microcopies FR/EN
- [x] Landing page publique — déjà faite (bilingue, hors plan initial)

### J-1 (25/08) — Pitch
- [ ] Script démo live : créer pact → membre → finalize → fund → distribute
- [ ] Vidéo démo 3 min · README premium · screenshots
- [ ] Redéployer le programme sur devnet (suppression du `Config`, bornes
      durcies) et vérifier les 3 pacts de démo du Marketplace

### J-0 (26/08) — SOUMISSION
- [ ] Freeze code 12h00 · Soumission · Backup vidéo si live demo échoue

---

## 🔭 POST-HACKATHON (V2)
- Rotation de l'autorité d'upgrade vers une clé dédiée, puis multisig
- Jalons de paiement (release progressif au lieu d'une distribution unique)
- Réputation on-chain des builders
- Ré-approbation forcée à chaque changement de composition du pacte
- Remplacement de membre
- Mainnet — uniquement après les points ci-dessus

---

## 📚 Documents liés
| Fichier | Contenu |
|---|---|
| `SECURITY.md` | Modèle de menace, failles corrigées, invariants, limites |
| `AUDIT.md` | Audit accessibilité |
| `JUDGES FR.md` / `JUDGES ENG.md` | Dossier juges bilingue |
| `programs/workspace/src/lib.rs` | Le programme |
| `tests/workspace.ts` | Suite LiteSVM (24/24) |