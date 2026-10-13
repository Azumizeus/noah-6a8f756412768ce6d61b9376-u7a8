// src/pages/premium/PremiumDocs.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — Documentation : même contenu que DocsPage legacy (guide
// 6 étapes, FAQ, glossaire, instructions on-chain, features plateforme,
// sécurité) habillé en tokens clairs. Le kit démo est rendu via
// PremiumDemoKit (version tokens clairs) ; les liens externes restent sur
// la page historique (lien 'Historique ↗' de PremiumNav).
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import PremiumNav from './PremiumNav';
// Import obligatoire : sans lui, <PremiumDemoKit /> compile en identifiant
// libre et lève ReferenceError au rendu. L'erreur n'est plus un écran noir
// silencieux : App.tsx enveloppe la SPA dans AppErrorBoundary, qui affiche
// une fiche de secours (voir components/ErrorBoundary.tsx) — mais la page
// reste cassée, donc l'import doit rester.
import { PremiumDemoKit } from './PremiumDemoKit';
import { PROGRAM_ID } from '../../lib/constants';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import { useAppearance, loadAppearance, applyAppearanceToDom } from '../../lib/appearance';
import type { Lang } from '../../lib/i18n/translations';
import '../../styles/premium.css';

// ─── Guide 6 étapes — contenu identique à DocsPage legacy ─────────────
const GUIDE_STEPS: { n: number; title: Record<Lang, string>; short: Record<Lang, string>; body: Record<Lang, string> }[] = [
  {
    n: 1,
    title: { fr: 'Créer', en: 'Create' },
    short: { fr: 'Le founder décrit le projet', en: 'The founder describes the project' },
    body: {
      fr: 'Le founder ouvre le wizard "Créer un pact" : nom, description, ce que le projet cherche (devs/investisseurs), ses rôles et sa part de départ (%). Le projet est créé on-chain avec le statut "Open".',
      en: 'The founder opens the "Create a pact" wizard: name, description, what the project is looking for (devs/investors), roles and starting share (%). The project is created on-chain with "Open" status.',
    },
  },
  {
    n: 2,
    title: { fr: 'Ajouter des membres', en: 'Add members' },
    short: { fr: 'Rôles et parts négociées', en: 'Negotiated roles and shares' },
    body: {
      fr: 'Le founder ajoute chaque membre avec son adresse wallet, son rôle et sa part négociée (en %). Le total des parts (founder + membres) doit atteindre exactement 100% avant de pouvoir finaliser.',
      en: 'The founder adds each member with their wallet address, role and negotiated share (%). Total shares (founder + members) must reach exactly 100% before finalizing.',
    },
  },
  {
    n: 3,
    title: { fr: 'Approuver', en: 'Approve' },
    short: { fr: 'Chaque membre confirme avec SON wallet', en: 'Each member confirms with THEIR own wallet' },
    body: {
      fr: 'Chaque membre ajouté doit se connecter avec son propre wallet et cliquer "Approuver" sur la carte du projet. Le founder est auto-approuvé à la création. Sans l\'approbation de tout le monde, impossible de finaliser.',
      en: 'Each added member must connect with their own wallet and click "Approve" on the project card. The founder is auto-approved at creation. Without everyone\'s approval, finalizing is impossible.',
    },
  },
  {
    n: 4,
    title: { fr: 'Finaliser', en: 'Finalize' },
    short: { fr: 'Verrouillage on-chain, une fois pour toutes', en: 'On-chain lock, once and for all' },
    body: {
      fr: 'Une fois 100% des parts atteintes et tous les membres approuvés, le founder clique "Finaliser". Le statut passe à "Finalized" — rôles et parts sont désormais verrouillés on-chain, plus aucune modification possible.',
      en: 'Once 100% of shares is reached and all members have approved, the founder clicks "Finalize". Status becomes "Finalized" — roles and shares are now locked on-chain, no more changes possible.',
    },
  },
  {
    n: 5,
    title: { fr: 'Financer', en: 'Fund' },
    short: { fr: 'N\'importe qui peut soutenir le projet', en: 'Anyone can support the project' },
    body: {
      fr: 'Une fois finalisé, n\'importe quel wallet (backer, membre, curieux) peut envoyer des SOL dans le vault du projet via le bouton "Soutenir ce projet". Les fonds vont dans un compte PDA dédié — un escrow que personne ne contrôle directement.',
      en: 'Once finalized, any wallet (backer, member, curious visitor) can send SOL into the project vault via the "Support this project" button. Funds go into a dedicated PDA account — an escrow nobody directly controls.',
    },
  },
  {
    n: 6,
    title: { fr: 'Distribuer', en: 'Distribute' },
    short: { fr: '2% protocole, 98% aux membres', en: '2% protocol, 98% to members' },
    body: {
      fr: 'Le founder déclenche "Distribuer". Le programme calcule et envoie automatiquement : 2% au wallet protocole, 98% réparti au prorata exact des parts de chaque membre — directement dans leurs wallets, en une seule transaction on-chain.',
      en: 'The founder triggers "Distribute". The program automatically computes and sends: 2% to the protocol wallet, 98% split pro-rata by each member\'s exact share — directly into their wallets, in a single on-chain transaction.',
    },
  },
];

// ─── FAQ — identique à DocsPage legacy ────────────────────────────────
const FAQ: { q: Record<Lang, string>; a: Record<Lang, string> }[] = [
  {
    q: { fr: 'Ma transaction échoue avec un message générique, pourquoi ?', en: 'My transaction fails with a generic message, why?' },
    a: {
      fr: 'Sur mobile (Seed Vault, wallets via Mobile Wallet Adapter), la synchronisation entre l\'app et le wallet peut parfois échouer sans raison claire. Réessaie — chaque tentative repart avec des données fraîches, sans risque de double dépense. Un wallet desktop (Phantom, Solflare, Backpack) est généralement plus fiable.',
      en: 'On mobile (Seed Vault, wallets via Mobile Wallet Adapter), sync between the app and the wallet can sometimes fail for no clear reason. Try again — each attempt starts fresh, no risk of double-spend. A desktop wallet (Phantom, Solflare, Backpack) is generally more reliable.',
    },
  },
  {
    q: { fr: 'C\'est quoi le vault PDA ?', en: 'What is the vault PDA?' },
    a: {
      fr: 'Un PDA (Program Derived Address) est un compte Solana calculé mathématiquement par le programme — il n\'a pas de clé privée, donc personne ne peut le contrôler directement. Les fonds y sont bloqués jusqu\'à ce que l\'instruction "distribute" les libère selon les règles programmées.',
      en: 'A PDA (Program Derived Address) is a Solana account mathematically derived by the program — it has no private key, so nobody can control it directly. Funds stay locked there until the "distribute" instruction releases them per the programmed rules.',
    },
  },
  {
    q: { fr: 'Je peux changer ma part après finalisation ?', en: 'Can I change my share after finalization?' },
    a: {
      fr: 'Non. Avant finalisation, oui — mais toute modification nécessite une nouvelle approbation de tous les membres. Une fois finalisé, les rôles et parts sont verrouillés on-chain de façon définitive pour cette version du protocole.',
      en: 'No. Before finalization, yes — but any change requires a fresh approval from every member. Once finalized, roles and shares are permanently locked on-chain for this version of the protocol.',
    },
  },
  {
    q: { fr: 'Qui peut déclencher une distribution ?', en: 'Who can trigger a distribution?' },
    a: {
      fr: 'Seul le founder (créateur du projet) peut déclencher "Distribuer". C\'est une protection front ET on-chain — même en modifiant l\'interface, seule la signature du créateur est acceptée par le programme.',
      en: 'Only the founder (project creator) can trigger "Distribute". This is enforced both in the UI AND on-chain — even by tampering with the interface, only the creator\'s signature is accepted by the program.',
    },
  },
  {
    q: { fr: 'Un membre disparaît après le financement, que se passe-t-il ?', en: 'What happens if a member disappears after funding?' },
    a: {
      fr: 'En V1, le financement intervient après la finalisation (modèle façon Kickstarter) : les parts restent garanties telles que verrouillées. La V2 prévoit un système de jalons (milestones) et de réputation on-chain pour gérer ce cas plus finement.',
      en: 'In V1, funding happens after finalization (Kickstarter-style model): shares remain guaranteed as locked. V2 plans a milestone system and on-chain reputation to handle this case more precisely.',
    },
  },
  {
    q: { fr: 'Combien de membres maximum par projet ?', en: 'What\'s the max number of members per project?' },
    a: {
      fr: 'Environ 8 actuellement — les membres sont stockés dans un seul compte on-chain de taille fixe. Une évolution du programme (comptes membres séparés) lèvera cette limite pour les gros pacts en V2.',
      en: 'About 8 currently — members are stored in a single fixed-size on-chain account. A program upgrade (separate member accounts) will lift this limit for large pacts in V2.',
    },
  },
];

// ─── Glossaire ────────────────────────────────────────────────────────
const GLOSSARY: { term: string; def: Record<Lang, string> }[] = [
  { term: 'Pact', def: { fr: 'L\'accord on-chain entre un founder et ses membres : rôles, parts, règles de distribution.', en: 'The on-chain agreement between a founder and their members: roles, shares, distribution rules.' } },
  { term: 'PDA', def: { fr: 'Program Derived Address — adresse Solana calculée par le programme, sans clé privée. Personne ne la contrôle directement.', en: 'Program Derived Address — a Solana address computed by the program, with no private key. Nobody controls it directly.' } },
  { term: 'bps', def: { fr: 'Basis points — unité de part : 10 000 bps = 100%. Une part de 3 600 bps = 36%.', en: 'Basis points — share unit: 10,000 bps = 100%. A share of 3,600 bps = 36%.' } },
  { term: 'Vault', def: { fr: 'Le compte PDA qui reçoit et retient les fonds d\'un projet jusqu\'à distribution.', en: 'The PDA account that receives and holds a project\'s funds until distribution.' } },
  { term: 'Escrow', def: { fr: 'Fonds bloqués on-chain, libérés uniquement selon des règles programmées à l\'avance.', en: 'Funds locked on-chain, released only according to rules programmed in advance.' } },
  { term: 'Finalize', def: { fr: 'Instruction qui verrouille définitivement rôles et parts, et active le projet pour le financement.', en: 'Instruction that permanently locks roles and shares, and activates the project for funding.' } },
  { term: 'Devnet', def: { fr: 'Réseau de test Solana, sans valeur réelle — celui utilisé pour ce hackathon (jamais mainnet).', en: 'Solana test network, no real value — the one used for this hackathon (never mainnet).' } },
  { term: 'Anchor', def: { fr: 'Framework Rust utilisé pour écrire le programme on-chain de BuildPact.', en: 'The Rust framework used to write BuildPact\'s on-chain program.' } },
];

// ─── Instructions on-chain ────────────────────────────────────────────
const INSTRUCTIONS: { name: string; desc: Record<Lang, string> }[] = [
  { name: 'create_project', desc: { fr: 'Crée le compte Project on-chain avec titre, description, rôle et part du créateur.', en: 'Creates the on-chain Project account with title, description, creator role and share.' } },
  { name: 'add_member', desc: { fr: 'Ajoute un membre (wallet, rôle, part) au projet — signé par le créateur.', en: 'Adds a member (wallet, role, share) to the project — signed by the creator.' } },
  { name: 'remove_member', desc: { fr: 'Retire un membre pending — signé par le créateur, uniquement avant finalisation.', en: 'Removes a pending member — signed by the creator, only before finalization.' } },
  { name: 'approve', desc: { fr: 'Le membre approuve le pact avec son propre wallet.', en: 'The member approves the pact with their own wallet.' } },
  { name: 'finalize', desc: { fr: 'Verrouille le projet — exige 100% des parts et toutes les approbations réunies.', en: 'Locks the project — requires 100% of shares and every approval collected.' } },
  { name: 'fund', desc: { fr: 'Transfère des SOL vers le vault PDA du projet — accessible à n\'importe quel wallet.', en: 'Transfers SOL into the project\'s vault PDA — callable by any wallet.' } },
  { name: 'distribute', desc: { fr: 'Répartit le solde du vault : 2% au protocole, 98% au prorata des parts des membres.', en: 'Splits the vault balance: 2% to the protocol, 98% pro-rata by member shares.' } },
  { name: 'close_project', desc: { fr: 'Ferme le compte projet (récupère le rent) — créateur uniquement, projet non finalisé et vault vide.', en: 'Closes the project account (reclaims rent) — creator only, project not finalized, empty vault.' } },
];

// ─── Features plateforme (Supabase) ──────────────────────────────────
const PLATFORM_FEATURES: { icon: string; name: Record<Lang, string>; desc: Record<Lang, string> }[] = [
  { icon: '👤', name: { fr: 'Profil builder', en: 'Builder profile' }, desc: { fr: 'Bio, compétences avec niveau (débutant/confirmé/expert), avatar, disponibilité — enregistré via signature wallet, export PDF façon CV rapide.', en: 'Bio, skills with level (beginner/intermediate/expert), avatar, availability — saved via wallet signature, quick-CV PDF export.' } },
  { icon: '🔒', name: { fr: 'Vault de documents', en: 'Document vault' }, desc: { fr: 'Espace privé par projet pour les livrables : upload par les membres, validation ou demande de changements par le founder, historique de versions. Accès protégé par signature wallet + vérification on-chain de l\'appartenance au projet.', en: 'Private per-project space for deliverables: upload by members, approval or change requests by the founder, version history. Access gated by wallet signature + on-chain membership check.' } },
  { icon: '💬', name: { fr: 'Chat & fil d\'avancement', en: 'Chat & updates feed' }, desc: { fr: 'Discussion en direct par projet (Realtime) et fil de mises à jour des membres, visibles sur la fiche publique du pact.', en: 'Live per-project chat (Realtime) and a member updates feed, both visible on the pact\'s public page.' } },
  { icon: '🧭', name: { fr: 'Annuaire des builders', en: 'Builder directory' }, desc: { fr: 'Parcourt tous les profils enregistrés, filtre par disponibilité, recherche par compétence.', en: 'Browse every registered profile, filter by availability, search by skill.' } },
  { icon: '📩', name: { fr: 'Demandes de contact', en: 'Contact requests' }, desc: { fr: 'Envoie une demande à un builder disponible ("je cherche ce rôle, es-tu dispo ?") — signée par ton wallet, reçue dans sa boîte de réception, elle aussi protégée par signature.', en: 'Send a request to an available builder ("I need this role, are you available?") — signed by your wallet, delivered to their inbox, itself signature-gated.' } },
  { icon: '⭐', name: { fr: 'Notation des builders', en: 'Builder ratings' }, desc: { fr: 'Note un builder de 1 à 6 étoiles — une seule note par paire de wallets, moyenne publique, détail des votes jamais exposé.', en: 'Rate a builder from 1 to 6 stars — one rating per wallet pair, public average, individual votes never exposed.' } },
];

// ─── Composants locaux ────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--p-canvas)',
  border: '1px solid var(--p-line)',
  borderRadius: 'var(--p-radius-lg)',
  boxShadow: 'var(--p-shadow)',
};

function GuideStepper() {
  const { lang, t } = useLanguage();
  const [active, setActive] = useState(1);
  const current = GUIDE_STEPS.find((s) => s.n === active) ?? GUIDE_STEPS[0];

  return (
    <div style={{ ...card, padding: '20px 22px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {GUIDE_STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => setActive(s.n)}
            aria-pressed={active === s.n}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              borderRadius: 99,
              border: `1px solid ${active === s.n ? 'var(--p-accent)' : 'var(--p-line)'}`,
              background: active === s.n ? 'var(--p-accent-soft)' : 'transparent',
              color: active === s.n ? 'var(--p-accent)' : 'var(--p-ink2)',
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: active === s.n ? 700 : 550,
              cursor: 'pointer',
              minHeight: 34,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: 99,
                fontSize: 10,
                fontWeight: 800,
                background: active === s.n ? 'var(--p-accent)' : 'var(--p-line)',
                color: active === s.n ? 'var(--p-canvas)' : 'var(--p-ink3)',
              }}
            >
              {s.n}
            </span>
            {s.title[lang]}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 14, background: 'var(--p-accent-soft)', border: '1px solid var(--p-line)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--p-accent)', fontFamily: "'JetBrains Mono',monospace" }}>
          {t('docs.stepOf', { n: current.n, total: GUIDE_STEPS.length })}
        </p>
        <h3 style={{ fontSize: 17, fontWeight: 750, marginTop: 4, color: 'var(--p-ink)' }}>{current.title[lang]}</h3>
        <p style={{ fontSize: 12, color: 'var(--p-ink3)', marginTop: 2 }}>{current.short[lang]}</p>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--p-ink2)', marginTop: 10 }}>{current.body[lang]}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <button
          type="button"
          onClick={() => setActive((n) => Math.max(1, n - 1))}
          disabled={active === 1}
          style={{ borderRadius: 99, border: '1px solid var(--p-line)', background: 'var(--p-canvas)', color: 'var(--p-ink2)', fontSize: 12, fontWeight: 600, padding: '8px 16px', minHeight: 34, cursor: active === 1 ? 'default' : 'pointer', opacity: active === 1 ? 0.35 : 1 }}
        >
          {t('common.back')}
        </button>
        <button
          type="button"
          onClick={() => setActive((n) => Math.min(GUIDE_STEPS.length, n + 1))}
          disabled={active === GUIDE_STEPS.length}
          style={{ borderRadius: 99, border: '1px solid var(--p-line)', background: 'var(--p-canvas)', color: 'var(--p-ink2)', fontSize: 12, fontWeight: 600, padding: '8px 16px', minHeight: 34, cursor: active === GUIDE_STEPS.length ? 'default' : 'pointer', opacity: active === GUIDE_STEPS.length ? 0.35 : 1 }}
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}

function FaqAccordion() {
  const { lang } = useLanguage();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q[lang]} style={{ borderBottom: i < FAQ.length - 1 ? '1px solid var(--p-line)' : 'none' }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--p-ink)' }}>{item.q[lang]}</span>
              <span style={{ flexShrink: 0, fontSize: 18, color: 'var(--p-ink3)', transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }} aria-hidden="true">+</span>
            </button>
            {isOpen && (
              <p style={{ padding: '0 18px 14px', fontSize: 13, lineHeight: 1.65, color: 'var(--p-ink2)' }}>{item.a[lang]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--p-ink3)', margin: '34px 0 12px' }}>
      {children}
    </h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function PremiumDocs() {
  const { lang, t } = useLanguage();

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/docs" />

        <p className="p-eyebrow">{t('docs.eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 8 }}>
          {t('docs.titleLine1')}{' '}
          <span style={{ color: 'var(--p-accent)' }}>{t('docs.titleLine2')}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--p-ink2)', marginTop: 10, maxWidth: 560, lineHeight: 1.65 }}>
          {t('docs.subtitle')}
        </p>

        {/* Guide interactif */}
        <SectionTitle>{t('docs.guideHeading')}</SectionTitle>
        <GuideStepper />

        {/* FAQ */}
        <SectionTitle>{t('docs.faqHeading')}</SectionTitle>
        <FaqAccordion />

        {/* Glossaire */}
        <SectionTitle>{t('docs.glossaryHeading')}</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {GLOSSARY.map((g) => (
            <div key={g.term} style={{ ...card, padding: '14px 16px' }}>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: 'var(--p-accent)' }}>{g.term}</p>
              <p style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: 'var(--p-ink2)' }}>{g.def[lang]}</p>
            </div>
          ))}
        </div>

        {/* Instructions on-chain */}
        <SectionTitle>{t('docs.instructionsHeading')}</SectionTitle>
        <div style={{ ...card, overflow: 'hidden' }}>
          {INSTRUCTIONS.map((ix, i) => (
            <div
              key={ix.name}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 14,
                padding: '11px 18px',
                borderBottom: i < INSTRUCTIONS.length - 1 ? '1px solid var(--p-line)' : 'none',
                flexWrap: 'wrap',
              }}
            >
              <code style={{ flexShrink: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: 'var(--p-accent)', minWidth: 140 }}>{ix.name}</code>
              <p style={{ fontSize: 13, color: 'var(--p-ink2)', lineHeight: 1.55 }}>{ix.desc[lang]}</p>
            </div>
          ))}
        </div>

        {/* Features plateforme */}
        <SectionTitle>{t('docs.platformHeading')}</SectionTitle>
        <p style={{ fontSize: 13, color: 'var(--p-ink2)', marginBottom: 12, maxWidth: 560, lineHeight: 1.6 }}>{t('docs.platformSubtitle')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {PLATFORM_FEATURES.map((f) => (
            <div key={f.name.fr} style={{ ...card, padding: '16px 18px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--p-ink)' }}>{f.icon} {f.name[lang]}</p>
              <p style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: 'var(--p-ink2)' }}>{f.desc[lang]}</p>
            </div>
          ))}
        </div>

        {/* Sécurité */}
        <SectionTitle>{t('docs.securityHeading')}</SectionTitle>
        <div style={{ ...card, padding: '18px 20px', fontSize: 13.5, lineHeight: 1.7, color: 'var(--p-ink2)' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>• <strong style={{ color: 'var(--p-ink)' }}>{t('docs.security1')}</strong>{t('docs.security1Body')}</li>
            <li>• <strong style={{ color: 'var(--p-ink)' }}>{t('docs.security2')}</strong>{t('docs.security2Body')}</li>
            <li>• <strong style={{ color: 'var(--p-ink)' }}>{t('docs.security3')}</strong>{t('docs.security3Body')}</li>
            <li>• <strong style={{ color: 'var(--p-ink)' }}>{t('docs.security4')}</strong>{t('docs.security4Body')}</li>
            <li>• <strong style={{ color: 'var(--p-err, #c0392b)' }}>{t('docs.security5')}</strong>{t('docs.security5Body')}</li>
          </ul>
        </div>

        {/* Demo live - pact & transaction d'exemple (QR + lien + PDA) */}
        <SectionTitle>{t('docs.demoHeading')}</SectionTitle>
        <PremiumDemoKit />

        {/* Footer */}
        <p style={{ marginTop: 32, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--p-ink3)' }}>
          Program ID : <span style={{ color: 'var(--p-accent)' }}>{PROGRAM_ID.toBase58()}</span> · Cluster : devnet ·{' '}
          <a href="https://docs.solana.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--p-accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Solana docs ↗
          </a>
        </p>
      </div>
    </div>
  );
}
