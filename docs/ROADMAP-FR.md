
> ⚠️ **DOCUMENT HISTORIQUE — conservé tel quel.**
> Feuille de route du **hackathon (août 2026)**. Elle décrit l'app d'AVANT le
> shell premium et n'est plus à jour. C'est la version de référence **de la feuille de route du hackathon**, pas de l'app.
> **Référence actuelle : `ETAT-APP-2026-10-08-FR.md`** (ou sa version HTML
> `ETAT-APP-2026-10-08-FR.html`), section « Carte des documents ».

# 🗺️ BUILDPACT — FEUILLE DE ROUTE DU HACKATHON (20 → 26 août 2026)

> Version française · statut de référence au 26 août 2026 · Solana Devnet uniquement

## 01 — Informations verrouillées

- **ID du programme** : `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`
  - L’ancien programme `266V7Jct9EVWPeHscDwBpL13251EMUyak7WR9QiT59kQ` a été fermé et est irrécupérable.
- **Frais du protocole** : 200 bps (2 %) → `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH`
- **Réseau** : Devnet uniquement
- **Compte PDA de configuration** : supprimé le 24/08 ; l’ancien compte `5yRNQhn7W6sCFNVWhTWbZowQRKL7dNSaqYkpTtPxEF2C` est orphelin et inerte. Les frais et le portefeuille du protocole sont désormais des constantes compilées, sans compte administrateur modifiable.
- **Tests** : 43/43 ✅ (27 + 16)

## 02 — Fonctionnalités terminées

- [x] Programme Anchor : `create_project`, `add_member`, `remove_member`, `approve`, `finalize`, `fund`, `distribute`, `close_project`.
- [x] Interface Vercel et assistant de création en 3 étapes (pleine largeur, logo, bannière et vidéo).
- [x] Reprise d’un pacte orphelin et fenêtre d’ajout de membre (multi-rôles, pleine largeur, total des parts visible).
- [x] Marché / Découverte et fiche de pact publique (QR, partage, historique on-chain, fil d’avancement des membres).
- [x] Trésorerie alimentée par de vraies données, documentation et page « À propos » refondues.
- [x] Audit A11y WCAG 2.1 AA.
- [x] Corrections de fiabilité des portefeuilles : rotation RPC lors des nouvelles tentatives, déconnexion automatique et messages d’erreur RPC.
- [x] Internationalisation FR/EN complète, y compris la page d’accueil.
- [x] Profil builder sécurisé : `signMessage`, avatar, niveau de compétence, mode aperçu/édition et export PDF.
- [x] Coffre-fort privé de documents par projet : signature, vérification on-chain et historique des versions.
- [x] Discussion et fil d’avancement par projet.
- [x] Annuaire des builders : recherche, notation de 1 à 6 étoiles et demandes de contact, le tout sécurisé par signature de portefeuille.
- [x] Aucune écriture publique non vérifiée.

## 03 — J-6 (20/08) · Nettoyage & Rust — ✅ TERMINÉ

- [x] Supprimer les vestiges du coffre-fort (interface et état inutile).
- [x] `close_project` (créateur uniquement, si pacte non finalisé et coffre vide) → récupération de la réserve de loyer.
- [x] `remove_member` (créateur, tant que le membre est en attente) + tests → redéploiement sur Devnet.

## 04 — J-5 (21–22/08) · Fiche projet — ✅ TERMINÉ

- [x] Page projet détaillée : description, rôles ouverts, parts en pourcentage, équipe et feuille de route.
- [x] Boutons « Postuler à un rôle » et « Financer ».
- [ ] Interface `cancel_pact` (créateur) — non réalisée ; périmètre réduit, non critique pour la démonstration.

## 05 — J-4 (22/08) · Marché / Marketplace — ✅ TERMINÉ · CRITIQUE POUR LA DÉMONSTRATION

- [x] Page Découverte : projets ouverts et filtres (rôle recherché, financement).
- [x] Cartes : argumentaire, parts restantes, rôles disponibles et montant financé.
- [x] Bonus : logo, bannière, vidéo de présentation, fil d’avancement des membres et liens vers l’historique on-chain.

## 06 — J-3 (23/08) · Profil & discussion — ✅ TERMINÉ (en avance le 22/08)

- [x] Profil builder : `signMessage` → Supabase (biographie, compétences, liens, niveaux et avatar).
- [x] Page du profil : pactes, gains, historique et modes aperçu/édition.
- [x] Discussion simple par projet — Supabase Realtime.

## 07 — Hors plan (22/08, soir/nuit) · Coffre-fort, annuaire & sécurisation — ✅ TERMINÉ

- [x] Coffre-fort privé par projet : dépôt, validation par le fondateur, historique (`supersedes_id`), signature et vérification on-chain.
- [x] Annuaire des builders (`/builders`) avec recherche et filtre de disponibilité.
- [x] Demandes de contact sécurisées : signature `signMessage` des deux côtés, RLS fermée et fonction Edge `contact`.
- [x] Notation de 1 à 6 étoiles : signature, unicité par paire de portefeuilles et moyenne publique agrégée.
- [x] Badges de notification pour les nouveaux messages et documents sur les cartes de pact.
- [x] Lien direct partageable vers un document du coffre-fort.
- [x] Export PDF du profil builder.
- [x] Correction : aucune signature de portefeuille ne doit se déclencher automatiquement au chargement ; un clic explicite est toujours requis.

## 08 — Hors plan (22/08, fin de nuit) · Finitions de l’annuaire — ✅ TERMINÉ

- [x] Bouton « Discussion & coffre-fort » masqué sur la fiche du pact et réduit ailleurs.
- [x] Recherche insensible aux accents et à la casse, incluant biographie et compétences.
- [x] Fiche détaillée d’un builder au clic : biographie, compétences et niveaux, liens, portefeuille, note et bouton « Contacter ».
- [x] Vérification du correctif du popup de signature persistant sur le profil après redéploiement Vercel et actualisation forcée.

## 09 — J-2 (24/08) · Sécurité & finitions — ✅ TERMINÉ

- [x] Audit sécurité du programme : deux failles réelles corrigées (portefeuille des frais verrouillé et protection du coffre lors de `close_project`).
- [x] Suppression du compte `Config` mutable ; constantes compilées et aucune autorité administrateur modifiable.
- [x] Bornes des parts durcies : cumul en `u128` et `checked_add`.
- [x] Suite de tests portée de 14 à 24/24 puis 43/43 (27 + 16) : parts, doublons, limite de 8 membres, unanimité et intégrité des paiements.
- [x] `SECURITY.md` : modèle de menace, failles corrigées, invariants et limites connues.
- [x] `AUDIT.md` : audit d’accessibilité.
- [x] `JUDGES-FR.md` / `JUDGES-ENG.md` : dossier bilingue pour les juges.
- [x] Finitions UX/A11y et microcopies FR/EN.
- [x] Page d’accueil publique bilingue.

## 10 — J-1 (25/08) · Argumentaire & démonstration

- [ ] Script de démonstration en direct : créer un pacte → ajouter un membre → finaliser → financer → distribuer.
- [ ] Vidéo de démonstration de 3 minutes, README soigné et captures d’écran.
- [ ] Redéployer le programme sur Devnet après suppression de `Config` et durcissement des bornes ; vérifier les 3 pactes de démonstration du Marché.

## 11 — J-0 (26/08) · SOUMISSION

- [ ] Gel du code à 12 h 00.
- [ ] Soumission au hackathon.
- [ ] Vidéo de secours prête si la démonstration en direct échoue.

## 12 — Après le hackathon (V2)

- [ ] Faire tourner l’autorité de mise à niveau vers une clé dédiée, puis un multisig.
- [ ] Ajouter des jalons de paiement (libération progressive au lieu d’une distribution unique).
- [ ] Ajouter la réputation on-chain des builders.
- [ ] Forcer une nouvelle approbation à chaque changement de composition du pacte.
- [ ] Prévoir le remplacement d’un membre.
- [ ] Envisager le Mainnet uniquement après ces étapes.

## 13 — Documents liés

| Fichier | Contenu |
|---|---|
| `SECURITY.md` | Modèle de menace, failles corrigées, invariants et limites |
| `AUDIT.md` | Audit d’accessibilité |
| `JUDGES-FR.md` / `JUDGES-ENG.md` | Dossier bilingue pour les juges |
| `programs/workspace/src/lib.rs` | Programme Anchor |
| `tests/workspace.ts` | Suite LiteSVM (27/27) |
| `tests/load-and-migration.ts` | Suite upgrade & charge (16/16) |
