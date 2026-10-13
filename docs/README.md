# BuildPact — documentation index

Everything that documents the project lives in this folder. For the product
overview, start with the [root README](../README.md).

---

## Start here

| Document | What it is |
|---|---|
| [`JUDGES-ENG.md`](JUDGES-ENG.md) | English deep dive — product flow, on-chain architecture, security, anticipated questions. **Best entry point for reviewers.** |
| [`JUDGES-FR.md`](JUDGES-FR.md) | The same document in French. |
| [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) | Step-by-step guided demo. |
| [`ETAT-APP-2026-10-08-EN.md`](ETAT-APP-2026-10-08-EN.md) / [`…-FR.md`](ETAT-APP-2026-10-08-FR.md) | Current state of the app: what works, what is stubbed, what is next. |

Security (both written to be checked against the code, not trusted):

| Document | What it is |
|---|---|
| [`SECURITY.md`](SECURITY.md) | On-chain security model and threat model — what the program enforces, and what it deliberately does not. |
| [`SECURITY-INCIDENT-2026-10-11.md`](SECURITY-INCIDENT-2026-10-11.md) | Incident record: one RPC key served in clear text by production, why every repository check missed it, and the controls added since. No value appears in it — fingerprints only. |
| [`SECURITY-INCIDENT-2026-10-11-FR.md`](SECURITY-INCIDENT-2026-10-11-FR.md) | The same incident record in French. The two versions are held together by `docs/outils/verifier-docs.mjs`, which fails on any difference in fingerprint, URL, command or section count — a translation cannot quietly drop a fact. |

Technical references (French, written for whoever takes over the code):

| Document | What it is |
|---|---|
| [`../RESUME_PROJET.md`](../RESUME_PROJET.md) | Full project summary. |
| [`../DOSSIER_TECHNIQUE.md`](../DOSSIER_TECHNIQUE.md) | Architecture decisions and their trade-offs. |
| [`ROADMAP-ENG.md`](ROADMAP-ENG.md) / [`ROADMAP-FR.md`](ROADMAP-FR.md) | Roadmap. |

---

## Folders

| Folder | Role |
|---|---|
| `journal/` | Chronological work log — one entry per session. |
| `research/` | Background, market, competitors, hypotheses. |
| `agents/` | Reference for the agents and skills used on the project. |
| `outils/` | Documentation tooling (`md-to-html.mjs`, `verifier-docs.mjs`). |
| `archive/` | Superseded documents, kept for traceability. |

Some historical audits and hand-offs are also stored as `.pdf` / `.html`
alongside their Markdown source.

---

## Naming conventions

```
journal/YYYY-MM-DD.md           → work-log entry
research/[subject].md           → research notes
archive/[document].md           → superseded document
```
