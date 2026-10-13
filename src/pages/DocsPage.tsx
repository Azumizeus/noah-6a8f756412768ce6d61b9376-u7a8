// src/pages/DocsPage.tsx
import { useState } from 'react';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import DemoKit from '../components/DemoKit';
import { PROGRAM_ID } from '../lib/constants';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { Lang } from '../lib/i18n/translations';

// ═══════════════════════════════════════════════════════════════════
// 1. MODE D'EMPLOI INTERACTIF — stepper cliquable, 6 étapes du protocole
// Contenu long-form bilingue gardé ICI (pas dans translations.ts) : plus
// simple à maintenir pour des blocs de texte de cette taille que des
// dizaines de clés dot-path supplémentaires dans le dictionnaire central.
// ═══════════════════════════════════════════════════════════════════

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

function InteractiveGuide() {
  const { lang, t } = useLanguage();
  const [active, setActive] = useState(1);
  const current = GUIDE_STEPS.find((s) => s.n === active) ?? GUIDE_STEPS[0];

  return (
    <div className="glass-panel p-5 sm:p-6">
      <div className="flex flex-wrap gap-2">
        {GUIDE_STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => setActive(s.n)}
            aria-pressed={active === s.n}
            className={
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
              (active === s.n
                ? 'border-accent-violet/60 bg-violet-500/20 text-white'
                : 'border-white/10 text-ink-300 hover:text-white')
            }
          >
            <span
              className={
                'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ' +
                (active === s.n ? 'bg-accent-violet text-ink-900' : 'bg-white/10 text-ink-400')
              }
            >
              {s.n}
            </span>
            {s.title[lang]}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-accent-violet/25 bg-violet-500/10 p-4 sm:p-5">
        <p className="font-mono text-[11px] uppercase tracking-wider text-accent-violet">
          {t('docs.stepOf', { n: current.n, total: GUIDE_STEPS.length })}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-white">{current.title[lang]}</h3>
        <p className="mt-0.5 text-xs text-ink-400">{current.short[lang]}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-200">{current.body[lang]}</p>
      </div>

      <div className="mt-4 flex justify-between gap-2">
        <button
          type="button"
          onClick={() => setActive((n) => Math.max(1, n - 1))}
          disabled={active === 1}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 transition hover:text-white disabled:opacity-30"
        >
          {t('common.back')}
        </button>
        <button
          type="button"
          onClick={() => setActive((n) => Math.min(GUIDE_STEPS.length, n + 1))}
          disabled={active === GUIDE_STEPS.length}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 transition hover:text-white disabled:opacity-30"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. FAQ — accordéon, questions rencontrées réellement pendant le dev
// ═══════════════════════════════════════════════════════════════════

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

function FaqAccordion() {
  const { lang } = useLanguage();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="glass-panel divide-y divide-violet-500/10">
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q[lang]}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
            >
              <span className="text-sm font-medium text-white">{item.q[lang]}</span>
              <span
                className={
                  'shrink-0 text-ink-400 transition-transform ' + (isOpen ? 'rotate-45' : '')
                }
                aria-hidden="true"
              >
                +
              </span>
            </button>
            {isOpen && (
              <p className="px-4 pb-4 text-sm leading-relaxed text-ink-300">{item.a[lang]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 3. GLOSSAIRE
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// 4. DÉTAIL TECHNIQUE — les 8 instructions du programme
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// 5. FONCTIONNALITÉS PLATEFORME — tout ce qui vit hors du programme Anchor
// (Supabase : profils, vault, chat, annuaire, contact, notation). Section
// ajoutée le 22/08 soir pour que les juges aient une carte complète de
// l'app, pas seulement des 8 instructions on-chain ci-dessus.
// ═══════════════════════════════════════════════════════════════════

const PLATFORM_FEATURES: { icon: string; name: Record<Lang, string>; desc: Record<Lang, string> }[] = [
  {
    icon: '👤',
    name: { fr: 'Profil builder', en: 'Builder profile' },
    desc: {
      fr: 'Bio, compétences avec niveau (débutant/confirmé/expert), avatar, disponibilité — enregistré via signature wallet, export PDF façon CV rapide.',
      en: 'Bio, skills with level (beginner/intermediate/expert), avatar, availability — saved via wallet signature, quick-CV PDF export.',
    },
  },
  {
    icon: '🔒',
    name: { fr: 'Vault de documents', en: 'Document vault' },
    desc: {
      fr: 'Espace privé par projet pour les livrables : upload par les membres, validation ou demande de changements par le founder, historique de versions. Accès protégé par signature wallet + vérification on-chain de l\'appartenance au projet.',
      en: 'Private per-project space for deliverables: upload by members, approval or change requests by the founder, version history. Access gated by wallet signature + on-chain membership check.',
    },
  },
  {
    icon: '💬',
    name: { fr: 'Chat & fil d\'avancement', en: 'Chat & updates feed' },
    desc: {
      fr: 'Discussion en direct par projet (Realtime) et fil de mises à jour des membres, visibles sur la fiche publique du pact.',
      en: 'Live per-project chat (Realtime) and a member updates feed, both visible on the pact\'s public page.',
    },
  },
  {
    icon: '🧭',
    name: { fr: 'Annuaire des builders', en: 'Builder directory' },
    desc: {
      fr: 'Parcourt tous les profils enregistrés, filtre par disponibilité, recherche par compétence.',
      en: 'Browse every registered profile, filter by availability, search by skill.',
    },
  },
  {
    icon: '📩',
    name: { fr: 'Demandes de contact', en: 'Contact requests' },
    desc: {
      fr: 'Envoie une demande à un builder disponible ("je cherche ce rôle, es-tu dispo ?") — signée par ton wallet, reçue dans sa boîte de réception, elle aussi protégée par signature.',
      en: 'Send a request to an available builder ("I need this role, are you available?") — signed by your wallet, delivered to their inbox, itself signature-gated.',
    },
  },
  {
    icon: '⭐',
    name: { fr: 'Notation des builders', en: 'Builder ratings' },
    desc: {
      fr: 'Note un builder de 1 à 6 étoiles — une seule note par paire de wallets, moyenne publique, détail des votes jamais exposé.',
      en: 'Rate a builder from 1 to 6 stars — one rating per wallet pair, public average, individual votes never exposed.',
    },
  },
];

export function DocsPage() {
  const { lang, t } = useLanguage();
  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-6 sm:mb-8">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">{t('docs.eyebrow')}</p>
          <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('docs.titleLine1')} <span className="text-accent-violet">{t('docs.titleLine2')}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">
            {t('docs.subtitle')}
          </p>
        </header>
      </FadeInUp>

      <FadeInUp><DemoKit /></FadeInUp>

      <FadeInUp>
        <h2 className="mb-3 mt-10 font-sans text-lg font-semibold text-white">{t('docs.guideHeading')}</h2>
      </FadeInUp>
      <FadeInUp><InteractiveGuide /></FadeInUp>

      <FadeInUp>
        <h2 className="mb-3 mt-10 font-sans text-lg font-semibold text-white">{t('docs.faqHeading')}</h2>
      </FadeInUp>
      <FadeInUp><FaqAccordion /></FadeInUp>

      <FadeInUp>
        <h2 className="mb-3 mt-10 font-sans text-lg font-semibold text-white">{t('docs.glossaryHeading')}</h2>
      </FadeInUp>
      <section aria-label={t('docs.glossaryHeading')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GLOSSARY.map((g) => (
          <FadeInUp key={g.term}>
            <div className="glass-panel h-full p-4">
              <p className="font-mono text-sm font-semibold text-accent-violet">{g.term}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{g.def[lang]}</p>
            </div>
          </FadeInUp>
        ))}
      </section>

      <FadeInUp>
        <h2 className="mb-3 mt-10 font-sans text-lg font-semibold text-white">{t('docs.instructionsHeading')}</h2>
      </FadeInUp>
      <FadeInUp>
        <div className="glass-panel divide-y divide-violet-500/10">
          {INSTRUCTIONS.map((ix) => (
            <div key={ix.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <code className="shrink-0 font-mono text-xs text-accent-neon sm:w-40">{ix.name}</code>
              <p className="text-sm text-ink-300">{ix.desc[lang]}</p>
            </div>
          ))}
        </div>
      </FadeInUp>

      <FadeInUp>
        <h2 className="mb-3 mt-10 font-sans text-lg font-semibold text-white">{t('docs.platformHeading')}</h2>
        <p className="mb-3 max-w-2xl text-sm text-ink-300">{t('docs.platformSubtitle')}</p>
      </FadeInUp>
      <section aria-label={t('docs.platformHeading')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORM_FEATURES.map((f) => (
          <FadeInUp key={f.name.fr}>
            <div className="glass-panel h-full p-4">
              <p className="text-sm font-semibold text-white">{f.icon} {f.name[lang]}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{f.desc[lang]}</p>
            </div>
          </FadeInUp>
        ))}
      </section>

      <FadeInUp>
        <h2 className="mb-3 mt-10 font-sans text-lg font-semibold text-white">{t('docs.securityHeading')}</h2>
      </FadeInUp>
      <FadeInUp>
        <div className="glass-panel p-5 text-sm leading-relaxed text-ink-300">
          <ul className="space-y-2">
            <li>• <strong className="text-white">{t('docs.security1')}</strong>{t('docs.security1Body')}</li>
            <li>• <strong className="text-white">{t('docs.security2')}</strong>{t('docs.security2Body')}</li>
            <li>• <strong className="text-white">{t('docs.security3')}</strong>{t('docs.security3Body')}</li>
            <li>• <strong className="text-white">{t('docs.security4')}</strong>{t('docs.security4Body')}</li>
            <li>• <strong className="text-amber-300">{t('docs.security5')}</strong>{t('docs.security5Body')}</li>
          </ul>
        </div>
      </FadeInUp>

      <FadeInUp>
        <p className="mt-8 font-mono text-xs text-ink-400">
          Program ID : <span className="text-accent-violet">{PROGRAM_ID.toBase58()}</span> · Cluster : devnet ·{' '}
          <a href="https://docs.solana.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
            Solana docs ↗
          </a>
        </p>
      </FadeInUp>
    </DashboardLayout>
  );
}

export default DocsPage;
