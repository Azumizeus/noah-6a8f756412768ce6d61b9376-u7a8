# 🔍 AUDIT UI/UX — BuildPact (frontend prod)

> Testé le 22/08/2026 (nuit) sur `https://buildpact-hazel.vercel.app`, wallet
> **déconnecté** (vue publique juge/visiteur). Desktop 1440px + mobile 390px
> (Chrome). Pas de test transactionnel (connect wallet → create → approve →
> finalize → fund → distribute) — ça demande une vraie signature wallet, à
> tester par toi en live. Voir checklist en bas.

---

## 🔴 Critique

### 1. Sous-titre du hero quasi invisible — **desktop uniquement**
Sur `/` (Dashboard) et `/#/about`, le paragraphe juste sous le grand titre
("Crée un projet, définis les rôles...") est rendu en texte très sombre sur
fond sombre — contraste proche de 1:1, illisible à l'œil nu (confirmé en
zoomant, le texte existe bien dans le DOM). **Reproduit à l'identique sur les
2 pages**, donc composant partagé (Hero/PageHeader) avec une classe de
couleur qui casse à ce breakpoint.

**Sur mobile (390px), le même texte est parfaitement lisible** — donc bug
spécifique à un breakpoint/style desktop, pas une régression générale.

**Impact** : la phrase qui explique le mieux ce qu'est BuildPact, juste sous
le titre, est invisible pour un juge qui teste sur laptop/desktop — exactement
le device de démo.

**À corriger** : vérifier la classe de couleur du sous-titre dans le
composant Hero à la résolution desktop (probablement une variable de couleur
qui hérite mal, ou un `opacity`/`text-*` conditionnel au mauvais breakpoint).

---

### 2. Annuaire Builders — seuls les profils sont des données de test
`/#/builders` n'affiche que **2 profils**, tous deux avec pseudo et bio en
tapotis clavier : `dghfhjhfjdgfs` (bio commençant par
"hsfgdshjdghfsg$ Profil Mon profil builder Présente tes compétences...") et
`nhcnhcvn` (bio : "ngnfjhfjhgfcv"). C'est la totalité du contenu de cette
page — aucun profil "présentable" en fallback.

**Impact** : un juge qui clique "Builders" (dans la nav principale, visible
sur toutes les pages) tombe direct dessus, aucune autre donnée à côté pour
contrebalancer.

**À corriger** : soit nettoyer/republier 2-3 profils de démo réalistes avant
le tournage, soit exclure ces wallets de test de l'annuaire public (filtre par
liste noire ou simplement republier avec un vrai texte).

---

## 🟡 Moyen

### 3. Un pact de test technique visible publiquement
Sur Marketplace, Pacts, la fiche pact détaillée, et le flux Treasury : un
projet nommé **"Nexus Markdown Ünïcode 🚀🔥💎É"** apparaît, avec en
description une note de debug sur la troncature UTF-8 ("l'ancien code coupait
parfois au milieu d'un emoji 4 octets..."). C'est un vrai pact finalisé
on-chain (pas de la donnée mockée côté frontend), mais son contenu est
clairement un artefact de test technique, pas un projet de démo.

**Impact** : mélangé aux projets réels sur Marketplace/Pacts, ça casse un peu
le sérieux de la démo si un juge clique dessus par curiosité (nom bizarre =
premier réflexe de clic).

**À corriger** : soit le retirer du Marketplace public (`close_project` si
possible), soit le renommer proprement s'il doit rester pour tester
l'encodage unicode des `require!`.

### 4. Troncature de titre trop agressive sur les cards
Cards Marketplace/Pacts : les titres sont coupés en plein mot même quand ils
sont courts — "Nexus Ma…" pour "Nexus Markdown...", "Seeker St…" pour
"Seeker Strike..." Sur mobile c'est encore plus court ("Nexus Markdown …" →
tronqué dès 2 mots). Un titre de projet doit rester identifiable au premier
coup d'œil dans une liste.

**À corriger** : élargir la largeur dispo pour le titre avant troncature, ou
passer sur 2 lignes (`line-clamp-2`) plutôt qu'une troncature 1 ligne trop
courte.

### 5. Treasury : état de chargement indiscernable d'une page cassée
`/#/treasury` affiche 2-3 secondes de rectangles vides sans shimmer/spinner
avant que les vrais chiffres (TVL, Distributed, Pending) apparaissent. Sans
indicateur de chargement, ça ressemble à une page qui a planté le temps que
ça charge.

**À corriger** : ajouter un skeleton animé (shimmer) ou un spinner pendant le
fetch — pattern déjà présent ailleurs dans l'app à vérifier et réutiliser.

---

## 🟢 Mineur

### 6. Route directe `/marketplace` (sans `#`) → 404 Vercel brut
L'app utilise le hash routing (`/#/marketplace`) exclusivement. Taper ou
coller `buildpact-hazel.vercel.app/marketplace` sans le `#` affiche la page
d'erreur générique Vercel ("404: NOT_FOUND", avec un ID de requête), pas une
page custom. Risque limité (les liens internes et le kit démo juges utilisent
tous le `#` correctement), mais si quelqu'un retape une URL "propre" à la
main, ça casse net.

### 7. Modal "Connect Wallet" en anglais
Le reste de l'app est intégralement en français, mais la modale native
`@solana/wallet-adapter-react-ui` ("Connect a wallet on Solana to continue")
reste en anglais — juste avant le moment le plus important du parcours
(premher clic wallet). Détail mineur mais visible.

### 8. Stepper "Mode d'emploi" (Docs) tronqué en haut sur mobile
Sur mobile, la barre d'étapes (1 Créer → 6 Distribuer) déborde horizontalement
et l'étape "2 Ajouter des membres" apparaît coupée en haut du viewport au
premier chargement de la section — scrollable une fois qu'on comprend, mais
pas évident au premier coup d'œil.

---

## ✅ Ce qui marche bien (à ne pas casser en corrigeant le reste)

- Nav mobile (hamburger) propre, bons touch targets, fermeture fluide.
- États vides bien gérés (Profil non connecté, chat/vault "connecte ton
  wallet") — jamais de donnée fantôme affichée comme si elle était réelle.
- Page Docs très soignée : kit démo juges avec QR code + lien direct vers un
  pact **propre** ("Café"), guide interactif étape par étape, FAQ qui assume
  honnêtement les limites connues (sync wallet mobile parfois flaky).
  Exactement le bon réflexe pour un jury.
- Fiche pact publique : donnée on-chain réelle, répartition des parts qui
  totalise proprement 100%, QR code de partage pensé pour Seeker mobile.
- Aucune console error JS détectée sur les pages testées.

---

## Checklist — test transactionnel à faire en live (pas fait dans cet audit)

- [ ] Connecter un wallet (Phantom/Solflare/Backpack) — vérifier le flow de
      signature, les messages d'erreur si refus.
- [ ] `create_project` via le wizard — vérifier validation des champs, erreurs
      si % > 100.
- [ ] `add_member` + `approve` — double approbation, vérifier l'état
      "pending" → "approved" en UI.
- [ ] `finalize` — vérifier verrouillage visuel une fois fait.
- [ ] `fund` — dépôt dans le vault, vérifier mise à jour temps réel du solde.
- [ ] `distribute` — vérifier répartition 2%/98% affichée correspond au
      calcul réel post-transaction.
- [ ] Tout le parcours sur mobile avec Mobile Wallet Adapter (Seed Vault) —
      point de friction déjà documenté dans la FAQ Docs.

---

## Priorité recommandée avant le tournage démo

1. **#1 (sous-titre invisible)** — 5 minutes à corriger, gros impact visuel.
2. **#2 (annuaire builders)** — republier 2-3 profils propres.
3. **#3 (pact de test public)** — retirer ou renommer avant que les juges
   naviguent librement.
4. Le reste (#4-#8) est du polish, à faire si le temps le permet avant le
   J-1.
