
> ⚠️ **HISTORICAL DOCUMENT — kept as-is.**
> The **hackathon roadmap (August 2026)**. It describes the app BEFORE the premium
> shell and is no longer up to date. This is the reference version **of the hackathon roadmap**, not of the app.
> **Current reference: `ETAT-APP-2026-10-08-EN.md`** (or its HTML version
> `ETAT-APP-2026-10-08-EN.html`), in the "Document map" section.


> ⚠️ **DOCUMENT HISTORIQUE — conservé tel quel.**
> Feuille de route du **hackathon (août 2026)**. Elle décrit l'app d'AVANT le
> shell premium et n'est plus à jour. (Ce fichier mêlait français et anglais ligne à ligne.)
> **Référence actuelle : `ETAT-APP-2026-10-08-FR.md`** (ou sa version HTML
> `ETAT-APP-2026-10-08-FR.html`), section « Carte des documents ».

# 🗺️ BUILDPACT — FEUILLE DE ROUTE DU HACKATHON (20 → 26 août 2026) 🗺️ BUILDPACT – HACKATHON ROADMAP (August 20 – 26, 2026)

> Version française · statut de référence au 26 août 2026 · Solana Devnet uniquement French version · Reference date: August 26, 2026 · Solana Devnet only

## 01 — Informations verrouillées 01 – Locked information

*   **ID du programme** : `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` Program ID: `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`
    *   L’ancien programme `266V7Jct9EVWPeHscDwBpL13251EMUyak7WR9QiT59kQ` a été fermé et est irrécupérable. The former `266V7Jct9EVWPeHscDwBpL13251EMUyak7WR9QiT59kQ` program has been discontinued and cannot be recovered.
*   **Frais du protocole** : 200 bps (2 %) → `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH` Protocol fees: 200 bps (2%) → `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH`
*   **Réseau** : Devnet uniquement Network: Devnet only
*   **Compte PDA de configuration** : supprimé le 24/08 ; l’ancien compte `5yRNQhn7W6sCFNVWhTWbZowQRKL7dNSaqYkpTtPxEF2C` est orphelin et inerte. Les frais et le portefeuille du protocole sont désormais des constantes compilées, sans compte administrateur modifiable. PDA Configuration Account: Deleted on 08/24. The old account `5yRNQhn7W6sCFNVWhTWbZowQRKL7dNSaqYkpTtPxEF2C` is now inactive and without an administrator. Fees and protocol portfolio are now compiled constants, without a modifiable administrator account.
*   **Tests** : 43/43 ✅ Tests: 43/43 ✅

## 02 — Fonctionnalités terminées 02 – Completed Features

- [x] Programme Anchor : create_project, add_member, remove_member, approve, finalize, fund, distribute, close_project. Programme Anchors: create_project , add_member , remove_member , approve , finalize , fund , distribute , close_project .
- [x] Interface Vercel et assistant de création en 3 étapes (pleine largeur, logo, bannière et vidéo). Interface: Vercel and creation assistant (full-width, logo, banner, and video).
- [x] Reprise d’un pacte orphelin et fenêtre d’ajout de membre (multi-rôles, pleine largeur, total des parts visible). Re-establishment of an orphaned agreement and adding a member (multi-role, full-width, total share visibility).
- [x] Marché / Découverte et fiche de pact publique (QR, partage, historique on-chain, fil d’avancement des membres). Marketplace / Public Disclosure and Pact Information (QR code, sharing, on-chain history, member progress tracking).
- [x] Trésorerie alimentée par de vraies données, documentation et page « À propos » refondues. Treasury backed by genuine data, updated documentation, and a revised "About Us" page.
- [x] Audit A11y WCAG 2.1 AA. Audit: A11y, WCAG 2.1, Level AA
- [x] Corrections de fiabilité des portefeuilles : rotation RPC lors des nouvelles tentatives, déconnexion automatique et messages d’erreur RPC. Reliability checks for wallets: RPC rotation on retries, automatic disconnection, and RPC error messages.
- [x] Internationalisation FR/EN complète, y compris la page d’accueil. Full French/English localization, including the homepage.
- [x] Profil builder sécurisé : signMessage, avatar, niveau de compétence, mode aperçu/édition et export PDF. Secure profile builder: signMessage , avatar, skill level, preview/edit mode, and PDF export.
- [x] Coffre-fort privé de documents par projet : signature, vérification on-chain et historique des versions. Private document vault per project: signature, on-chain verification, and version history.
- [x] Discussion et fil d’avancement par projet. Project discussion and progress tracking.
- [x] Annuaire des builders : recherche, notation de 1 à 6 étoiles et demandes de contact, le tout sécurisé par signature de portefeuille. Builder Directory: Search, rating (1 to 6 stars), and contact requests, all secured with digital signature.
- [x] Aucune écriture publique non vérifiée. No publicly verified writing.

## 03 — J-6 (20/08) · Nettoyage & Rust — ✅ TERMINÉ 03 – J-6 (August 20) – Cleaning & Rust – ✅ Completed

- [x] Supprimer les vestiges du coffre-fort (interface et état inutile). Remove any remnants of the safe (interface and unnecessary state).
- [x] close_project (créateur uniquement, si pacte non finalisé et coffre vide) → récupération de la réserve de loyer. close_project (Creator only, if agreement not finalized and vault is empty) → Recovery of rent reserve.
- [x] remove_member (créateur, tant que le membre est en attente) + tests → redéploiement sur Devnet. remove_member (Creator, while the member is pending) + tests → Redeployment to Devnet.

## 04 — J-5 (21–22/08) · Fiche projet — ✅ TERMINÉ 04 – J-5 (August 21-22) – Project File – ✅ Completed

- [x] Page projet détaillée : description, rôles ouverts, parts en pourcentage, équipe et feuille de route. Detailed project page: description, open roles, percentage of work, team, and roadmap.
- [x] Boutons « Postuler à un rôle » et « Financer ». "Apply for a role" and "Fund".
- [ ] Interface cancel_pact (créateur) — non réalisée ; périmètre réduit, non critique pour la démonstration. Interface cancel_pact (developer) – not implemented; reduced scope, not critical for demonstration.

## 05 — J-4 (22/08) · Marché / Marketplace — ✅ TERMINÉ · CRITIQUE POUR LA DÉMONSTRATION 05 – J-4 (August 22) · Marketplace – ✅ COMPLETED · REVIEW FOR DEMONSTRATION

- [x] Page Découverte : projets ouverts et filtres (rôle recherché, financement). Discovery Page: Open projects and filters (role sought, funding).
- [x] Cartes : argumentaire, parts restantes, rôles disponibles et montant financé. Cards: arguments, remaining parts, available roles, and funding amount.
- [x] Bonus : logo, bannière, vidéo de présentation, fil d’avancement des membres et liens vers l’historique on-chain. Bonus: logo, banner, presentation video, member progress bar, and links to on-chain history.

## 06 — J-3 (23/08) · Profil & discussion — ✅ TERMINÉ (en avance le 22/08) 06 – J-3 (August 23) – Profile & Discussion – ✅ Completed (ahead of schedule, August 22)

- [x] Profil builder : signMessage → Supabase (biographie, compétences, liens, niveaux et avatar). Profile builder: signMessage → Supabase (for biography, skills, links, levels, and avatar).
- [x] Page du profil : pactes, gains, historique et modes aperçu/édition. Profile page: overview of agreements, gains, history, and editing options.
- [x] Discussion simple par projet — Supabase Realtime. Discussion: A project using Supabase Realtime.

## 07 — Hors plan (22/08, soir/nuit) · Coffre-fort, annuaire & sécurisation — ✅ TERMINÉ 07 – Out of scope (August 22, evening/night) – Safe, directory, and security – ✅ Completed

- [x] Coffre-fort privé par projet : dépôt, validation par le fondateur, historique (supersedes_id), signature et vérification on-chain. Private safe, custom-built: deposit, validation by the founder, history ( supersedes_id ), signature, and on-chain verification.
- [x] Annuaire des builders (/builders) avec recherche et filtre de disponibilité. Builder Directory ( /builders ) with search and availability filter.
- [x] Demandes de contact sécurisées : signature signMessage des deux côtés, RLS fermée et fonction Edge contact. Secure contact requests: signature signMessage on both sides, RLS closed, and Edge function contact .
- [x] Notation de 1 à 6 étoiles : signature, unicité par paire de portefeuilles et moyenne publique agrégée. Rating from 1 to 6 stars: signature, uniqueness based on pairs of wallets, and aggregated public average.
- [x] Badges de notification pour les nouveaux messages et documents sur les cartes de pact. Notification badges for new messages and documents on pact cards.
- [x] Lien direct partageable vers un document du coffre-fort. Direct link to a document stored in a secure vault.
- [x] Export PDF du profil builder. Export PDF from profile builder.
- [x] Correction : aucune signature de portefeuille ne doit se déclencher automatiquement au chargement ; un clic explicite est toujours requis. Correction: No wallet signature should automatically trigger upon loading; a manual click is always required.

## 08 — Hors plan (22/08, fin de nuit) · Finitions de l’annuaire — ✅ TERMINÉ 08 – Off-schedule (August 22, late evening) – Completion of the directory – ✅ COMPLETED

- [x] Bouton « Discussion & coffre-fort » masqué sur la fiche du pact et réduit ailleurs. The "Discussion & Safe" button is hidden on the contract form and elsewhere.
- [x] Recherche insensible aux accents et à la casse, incluant biographie et compétences. Search that is insensitive to accents and damage, including biography and skills.
- [x] Fiche détaillée d’un builder au clic : biographie, compétences et niveaux, liens, portefeuille, note et bouton « Contacter ». Detailed builder profile: biography, skills and levels, links, portfolio, rating, and "Contact" button.
- [x] Vérification du correctif du popup de signature persistant sur le profil après redéploiement Vercel et actualisation forcée. Verification of the persistent signature popup on the profile after redeployment on Vercel and forced refresh.

## 09 — J-2 (24/08) · Sécurité & finitions — ✅ TERMINÉ 09 – J-2 (August 24) – Safety & Finishing – ✅ Completed

- [x] Audit sécurité du programme : deux failles réelles corrigées (portefeuille des frais verrouillé et protection du coffre lors de close_project). Security audit of the program: Two real vulnerabilities have been fixed (locked expense account and safe protection during close_project ).
- [x] Suppression du compte Config mutable ; constantes compilées et aucune autorité administrateur modifiable. Suppression of the account Config ; compiled constants and no modifiable administrator authority.
- [x] Bornes des parts durcies : cumul en u128 et checked_add. Hard part wear indicator: cumulative at u128 and checked_add .
- [x] Suite de tests portée de 14 à 24/24 puis 43/43 (27 + 16) : parts, doublons, limite de 8 membres, unanimité et intégrité des paiements. Series of tests covering the period from 14 to 24/24 then 43/43: parts, duplicates, a maximum of 8 members, unanimous agreement, and payment integrity.
- [x] SECURITY.md : modèle de menace, failles corrigées, invariants et limites connues. SECURITY.md : Threat model, known vulnerabilities, invariants, and limitations.
- [x] AUDIT.md : audit d’accessibilité. AUDIT.md : Accessibility audit.
- [x] JUDGES-FR.md / JUDGES-ENG.md : dossier bilingue pour les juges. JUDGES-FR.md / JUDGES-ENG.md : Bilingual file for judges.
- [x] Finitions UX/A11y et microcopies FR/EN. UX/A11y and microcopy localization (French/English).
- [x] Page d’accueil publique bilingue. Public bilingual homepage.

## 10 — J-1 (25/08) · Argumentaire & démonstration 10 – J-1 (August 25) – Argument and demonstration

- [ ] Script de démonstration en direct : créer un pacte → ajouter un membre → finaliser → financer → distribuer. Live demonstration script: Create a pact → Add a member → Finalize → Fund → Distribute.
- [ ] Vidéo de démonstration de 3 minutes, README soigné et captures d’écran. 3-minute demonstration video, well-written README, and screenshots.
- [ ] Redéployer le programme sur Devnet après suppression de Config et durcissement des bornes ; vérifier les 3 pactes de démonstration du Marché. Re-deploy the program on Devnet after the removal of Config and strengthening of the boundaries; verify the 3 demonstration agreements from the Marketplace.

## 11 — J-0 (26/08) · SOUMISSION 11 – J-0 (August 26) · APPLICATION

- [ ] Gel du code à 12 h 00. Apply the code at 12:00.
- [ ] Soumission au hackathon. Submission to the hackathon.
- [ ] Vidéo de secours prête si la démonstration en direct échoue. Backup video is ready in case the live demonstration fails.

## 12 — Après le hackathon (V2) 12 – Following the Hackathon (Version 2)

- [ ] Faire tourner l’autorité de mise à niveau vers une clé dédiée, puis un multisig. Transition the authority to upgrade to a dedicated key, followed by a multi-signature setup.
- [ ] Ajouter des jalons de paiement (libération progressive au lieu d’une distribution unique). Add payment milestones (a phased release instead of a single payment).
- [ ] Ajouter la réputation on-chain des builders. Add on-chain reputation for builders.
- [ ] Forcer une nouvelle approbation à chaque changement de composition du pacte. Require a new approval for every change to the pact's composition.
- [ ] Prévoir le remplacement d’un membre. Planning for the replacement of a body part.
- [ ] Envisager le Mainnet uniquement après ces étapes. Consider the Mainnet only after these steps have been completed.

## 13 — Documents liés 13 – Related Documents

| Fichier File | Contenu Content |
| --- | --- |
| SECURITY.md | Modèle de menace, failles corrigées, invariants et limites Threat model, vulnerabilities, fixes, invariants, and limitations |
| AUDIT.md | Audit d’accessibilité Accessibility Audit |
| JUDGES-FR.md / JUDGES-ENG.md | Dossier bilingue pour les juges Bilingual dossier for judges |
| programs/workspace/src/lib.rs | Programme Anchor Program Host |
| tests/workspace.ts | Suite LiteSVM (27/27) LiteSVM (27/27) |
| tests/load-and-migration.ts | Suite upgrade & charge (16/16) upgrade & load suite (16/16) |