# BuildPact — Script démo live + storyboard vidéo 3 min

NoahAI Nitro 02 · Deadline 26/08 12:00 · Devnet uniquement

Note : ce document est en français pour toi. Tout ce qui est entre guillemets **« comme ça »** est à dire/écrire en anglais dans la vidéo et devant les juges (ils ne parlent pas français).

---

## 0. Avant de commencer — checklist setup

- [ ] Wallet devnet connecté avec au moins 0.5 SOL (fund + frais)
- [ ] Un 2e wallet devnet dispo (pour jouer le rôle du 2e membre qui approuve) — Phantom en navigation privée ou un 2e navigateur suffit
- [ ] App ouverte sur `https://buildpact-solana.vercel.app`
- [ ] Onglet Solscan devnet ouvert en parallèle pour montrer les tx en direct
- [ ] Les champs "About" FR/EN remplis sur Nexus Code et Seeker Strike (fait plus haut dans la conversation si pas encore collé)

---

## 1. Démo live (pour les juges, Q&A) — ~6-8 min

### Étape 1 — Marketplace, preuve "pas de mock" (1 min)
Ouvre `#/marketplace`. Montre Nexus Code et Seeker Strike.

**À dire :** *"These aren't mockups — every pact here is a real on-chain account. Let me prove it."*

Clique sur "Voir l'historique" d'un des deux → Solscan s'ouvre → montre la transaction `finalize` réelle.

### Étape 2 — Fiche détaillée (1 min)
Ouvre la fiche de Nexus Code. Montre dans l'ordre : bannière/logo, description verrouillée on-chain, section "About", timeline (Créé → Membres → Approuvé → Finalisé → Financé), cap table orbital, vault balance.

**À dire :** *"The short description is locked on-chain forever once created — that's the trust guarantee. The About section below it is off-chain and stays editable, so founders can keep the pitch fresh without ever rewriting the original promise."*

### Étape 3 — Créer un pact en live (2-3 min)
Va sur `#/create`. Crée le pact préparé à l'avance (voir section 3 ci-dessous pour le contenu).

**À dire pendant que tu remplis :** *"I'm creating a real project now — title, roles, my own share."*

Signe la transaction `create_project` → montre la confirmation.

### Étape 4 — Membre + approbation (1-2 min)
Ajoute un membre avec le 2e wallet. Bascule sur ce 2e wallet, clique "Approuver" → signe.

**À dire :** *"Every member has to approve on-chain before the founder can lock the deal — nobody gets added without their own signature."*

### Étape 5 — Finalize → Fund → Distribute (2 min)
Reviens sur le wallet founder. Clique "Finaliser" → signe.

**À dire :** *"Shares total 100%, everyone approved — now I lock it. This is irreversible: roles and shares can never be rewritten after this point."*

Envoie 0.1 SOL via "Financer" (backer). Puis clique "Distribuer".

**À dire :** *"Funds go into a PDA escrow, then distribute automatically: 2% protocol fee, 98% split by share, in one transaction."*

Montre le reçu + le lien Solscan de la distribution.

### Étape 6 — Questions pièges (garder sous la main)

- **"What if a dev disappears after getting paid?"** → *"V1 funds post-finalization, Kickstarter-style — the risk exists and is visible to backers. V2 adds payment milestones and on-chain reputation."*
- **"Can shares be changed?"** → *"Not after finalization — that's a guarantee, not a limitation. Before finalization, yes, with re-approval from every member."*
- **"Security?"** → *"Canonical PDA seeds, signer checks everywhere, checked arithmetic — and we found and fixed a real vulnerability before the demo: the protocol fee wallet wasn't locked in `create_project`, so any creator could have hijacked the 2% fee. Now it's a hardcoded constant enforced with a `require!`, tested in our suite."*

---

## 2. Storyboard vidéo — 3 minutes

Enregistrement écran + voix, coupes rapides. Timing indicatif.

| Temps | Visuel | Voix (à dire en anglais) |
|---|---|---|
| 0:00–0:15 | Logo BuildPact, fond noir/néon | *"Solana devs already build on GitHub and coordinate on Discord. What's missing is trust and payment. That's BuildPact."* |
| 0:15–0:45 | Landing page → Marketplace, scroll sur les 2 pacts réels | *"BuildPact is a Kickstarter and an on-chain cap table for Solana builders. A founder posts roles and shares, devs and backers join, the deal locks on-chain, funds distribute automatically — 2% protocol, 98% to members."* |
| 0:45–1:45 | Écran rapide : create → add_member → approve → finalize → fund → distribute (accéléré, cuts sur chaque signature de wallet) | *"The full flow is live and testable right now: create, add members, approve, finalize, fund, distribute. Every step is a real signed transaction on Devnet."* |
| 1:45–2:15 | Zoom sur le code / AUDIT.md, ou juste texte à l'écran "Vulnerability found & fixed" | *"We ran a security audit before this demo and found a real issue: the protocol fee wallet wasn't locked on-chain. We fixed it, tested the negative case, and redeployed — the live program includes the fix."* |
| 2:15–2:45 | Texte à l'écran : "What's not done yet" en liste courte | *"Honestly: upgrade authority rotation and milestone payments are still ahead — V1 focuses on getting the share guarantee right on Devnet."* |
| 2:45–3:00 | Logo + URL + QR code du lien démo | *"BuildPact — the builders' pact. Trust, written in code. Try it live at buildpact-solana.vercel.app."* |

---

## 3. Contenu prêt pour le pact "Seeker Nexus OS" — projet réel, aucun mensonge

À coller tel quel dans le wizard `#/create` :

| Champ wizard | Valeur à saisir |
|---|---|
| Titre | `Seeker Nexus OS` |
| Stage | 🤝 Les deux (dev + investisseurs) |
| Pitch / Description | `Seeker Nexus OS : cockpit IA multi-agents local-first, 26 agents (code, business, créa, juridique/musique) orchestrés via Ollama, fallback cloud sur confirmation.` |
| Rôles recherchés | `Dev Python/FastAPI, Designer UX, Juriste FR` |
| Ton rôle (créateur, ≤24 octets) | `Founder & Architect` |
| Ta part | 35-40% (suggestion — stage "both"/"dev" plafonne à 40% dans le wizard) |
| Seed founder (optionnel) | laisse vide sauf si tu veux annoncer un montant |

Vérifié : le texte packé complet ([stage] + pitch + rôles) fait 245 octets, sous la limite de 280 — rien ne sera tronqué.

**About (à remplir après création, section "Modifier médias") :**
```
Seeker Nexus OS (nom complet : Nexus × Seeker — OS de Mémoire IA) est un cockpit IA multi-agents local-first pensé comme un OS personnel — pour entrepreneurs, créatifs, et pros du droit/musique.

Stack : frontend HTML/CSS/JS vanilla (~3500 lignes, port 3000), bridge FastAPI/Python (port 8000), LLM local Ollama (llama3.2 + autres) avec fallback cloud Anthropic/OpenRouter, persistance en localStorage + JSON + export Markdown Obsidian.

26 agents : 18 agents généraux orchestrés par brain.py (CodeMaster, Visionary, DataSage, Finance, Producer, Artist, Memory, Hermes, Openclaw...) + un "Cabinet Legal & Rhythm" de 8 spécialistes (droit du travail, édition musicale, PI/DJ, financements culturels, comptabilité...) routés par scoring sémantique.

Modules clés :
- HERMES — onboarding conversationnel qui génère ton profil et ton notebook Obsidian
- LEX — assistant juridique/administratif FR (analyse docs, courriers, disclaimer obligatoire)
- Chat multi-conversation avec streaming SSE, édition/régénération de messages
- Runic Audio — moteur sonore 100% Web Audio API (35 SFX, 6 packs, Konami code caché)
- Cycle de vie OS complet (boot/shutdown/suspend/écran de veille, plusieurs versions V1-V6)

Philosophie : local-first, rien envoyé au cloud sans confirmation, lecture seule par défaut.
```
