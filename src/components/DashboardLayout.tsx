// src/components/DashboardLayout.tsx
import { motion, MotionConfig, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useHashRoute } from '../lib/router';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { useRpcHealth } from '../hooks/useRpcHealth';
import RpcHealthBanner from './RpcHealthBanner';
import LanguageSwitch from './LanguageSwitch';
// 21/09 : le header troque les pastilles de palette contre la bascule
// Sombre/Clair seule — les habillages restent dans ⚙️ Paramètres.
import ModeToggle from './ModeToggle';

interface NavLink {
  label: string;
  href: string;
  active?: boolean;
}

interface DashboardLayoutProps {
  children: ReactNode;
  walletSlot?: ReactNode;
  navLinks?: NavLink[];
}

/** Construit les liens de nav traduits — appelé avec t() du contexte de langue courant. */
function buildDefaultLinks(t: (key: string) => string): NavLink[] {
  return [
    { label: t('nav.dashboard'), href: '#/', active: true },
    { label: t('nav.marketplace'), href: '#/marketplace' },
    { label: t('nav.pacts'), href: '#/pacts' },
    { label: t('nav.builders'), href: '#/builders' },
    { label: t('nav.network'), href: '#/network' },
    { label: t('nav.profile'), href: '#/profile' },
    { label: t('nav.treasury'), href: '#/treasury' },
    { label: t('nav.docs'), href: '#/docs' },
    { label: t('nav.about'), href: '#/about' },
  ];
}

// Variants Framer — conteneur staggeré 0.08s, enfant fade-in-up 12px
const containerVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

const itemVariants: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Helper — wrap d'une section enfant pour bénéficier du stagger du parent */
export function FadeInUp({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

export function DashboardLayout({
  children,
  walletSlot,
  navLinks,
}: DashboardLayoutProps) {
  const prefersReduced = useReducedMotion();
  const route = useHashRoute();
  const { t } = useLanguage();
  // Santé de l'endpoint RPC principal, montée ICI : DashboardLayout est le
  // seul point commun aux onze pages legacy `/v1`. Sans ça, `/v1` restait le
  // dernier endroit de l'app où une panne d'endpoint était silencieuse —
  // précisément le shell qu'on ouvre en secours quand le reste ne répond
  // pas. Variante `legacy` : ces pages n'ont aucun token `--p-*`.
  const santeRpc = useRpcHealth();
  const linksWithActive = (navLinks ?? buildDefaultLinks(t)).map((l) => ({ ...l, active: l.href === `#${route}` }));
  const [mobileOpen, setMobileOpen] = useState(false);

  // Ferme le menu quand la route change (tap sur un lien)
  useEffect(() => setMobileOpen(false), [route]);

  // Ferme le menu au Escape (accessibilité clavier)
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Si reduced motion, on saute l'état hidden initial — rendu immédiat
  const motionProps = prefersReduced
    ? { initial: false as const, animate: 'visible' as const }
    : { initial: 'hidden' as const, animate: 'visible' as const };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-hidden bg-canvas">
        {/* Grille décorative */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 grid-bg opacity-70" />

        {/* Orbes flottants — 100% CSS radial-gradient, aucune image externe.
            Elles lisent les variables de thème : laissées en rgba() en dur,
            elles auraient continué à baigner la page de violet sous une
            palette dorée ou cobalt. */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          <div
            className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl animate-float"
            style={{
              background:
                'radial-gradient(circle, rgb(var(--accent-violet-rgb) / 0.45), transparent 70%)',
            }}
          />
          <div
            className="absolute top-1/3 -right-40 h-[480px] w-[480px] rounded-full opacity-25 blur-3xl animate-float"
            style={{
              background:
                'radial-gradient(circle, rgb(var(--accent-neon-rgb) / 0.35), transparent 70%)',
              animationDelay: '2s',
            }}
          />
          <div
            className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full opacity-20 blur-3xl animate-float"
            style={{
              background:
                'radial-gradient(circle, rgb(var(--accent-gold-rgb) / 0.25), transparent 70%)',
              animationDelay: '4s',
            }}
          />
        </div>

        {/* Skip link pour clavier / screen reader */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                     focus:rounded-lg focus:bg-canvas-700 focus:px-4 focus:py-2 focus:text-white"
        >
          {t('nav.skipToContent')}
        </a>

        <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6 sm:px-8 lg:px-8">
          {/* En-tête — sticky safe, h-16 cohérent */}
          <header className="flex h-16 items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-2.5">
              {/* Icône = accueil marketing (toujours la landing, même connecté).
                  Texte "BuildPact" = dashboard (racine '/', qui affiche le
                  Dashboard une fois connecté) — 2 destinations distinctes au
                  lieu d'un seul lien qui faisait doublon. */}
              <a href="#/home" className="rounded-xl" aria-label={t('nav.homeAria')}>
                <LogoMark />
              </a>
              <a
                href="#/"
                className="font-sans text-base font-semibold tracking-tight text-white rounded-xl"
                aria-label={t('nav.dashboardAria')}
              >
                Build<span className="text-accent-violet">Pact</span>
              </a>
            </div>

            {/* Nav desktop — visible ≥768px */}
            <nav aria-label={t('nav.mainNav')} className="hidden md:block">
              <ul className="flex items-center gap-1">
                {linksWithActive.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      aria-current={l.active ? 'page' : undefined}
                      className={
                        // whitespace-nowrap : les labels longs (« À propos »)
                        // se repliaient sur 2 lignes dans une nav à 9 liens
                        // — fix restyle 21/09 (prototype v3).
                        'inline-flex h-11 items-center whitespace-nowrap rounded-lg px-2.5 text-[13.5px] transition-colors ' +
                        (l.active
                          // accent-violet, pas violet-500 : la palette native
                          // de Tailwind ne suit pas le thème et l'onglet actif
                          // serait resté violet sous une autre palette.
                          ? 'bg-accent-violet/10 text-white'
                          : 'text-ink-300 hover:text-white hover:bg-white/[0.03]')
                      }
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex items-center gap-2">
              <span className="hidden lg:block"><ModeToggle compact /></span>
              <span className="hidden sm:block"><LanguageSwitch compact /></span>
              {walletSlot}

              {/* Bouton hamburger — mobile only */}
              <button
                type="button"
                aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((v) => !v)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg
                           border border-white/10 text-white transition-colors
                           hover:bg-white/[0.06] md:hidden"
              >
                {mobileOpen ? (
                  // Icône X
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  // Icône burger
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          </header>

          {/* Menu mobile — visible <768px */}
          {mobileOpen && (
            <nav aria-label={t('nav.mobileNav')} className="md:hidden">
              <motion.ul
                initial={prefersReduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="mb-4 flex flex-col gap-1 rounded-xl border border-white/10 bg-canvas-700/90 p-2 backdrop-blur-sm"
              >
                {linksWithActive.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      aria-current={l.active ? 'page' : undefined}
                      className={
                        'flex h-12 items-center rounded-lg px-4 text-base font-medium transition-colors ' +
                        (l.active
                          ? 'bg-accent-violet/15 text-white'
                          : 'text-ink-300 hover:text-white hover:bg-white/[0.04]')
                      }
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
                <li className="px-2 pt-1 sm:hidden">
                  <LanguageSwitch />
                </li>
                {/* La bascule Sombre/Clair n'apparaît qu'à partir de lg dans
                    l'en-tête : en dessous, c'est ici qu'on la retrouve. */}
                <li className="px-2 pt-2 lg:hidden">
                  <ModeToggle />
                </li>
              </motion.ul>
            </nav>
          )}

          <motion.main
            id="main-content"
            {...motionProps}
            variants={containerVariants}
            className="pb-24 pt-4 sm:pt-6"
          >
            {/* Au-dessus du contenu : un incident qui pousse la page vers le
                bas est un incident qu'on lit. Le seul réglage RPC du shell
                legacy vit dans la modale de profil (#/v1/profile). */}
            <RpcHealthBanner
              variante="legacy"
              sante={santeRpc.sante}
              enCours={santeRpc.enCours}
              onVerifier={santeRpc.verifier}
              onOpenSettings={() => {
                // `?settings=1` ouvre directement le panneau de réglages
                // legacy, où vit le champ « RPC personnalisé »
                // (voir MonProfilPage).
                window.location.hash = '#/v1/profile?settings=1';
              }}
            />
            {children}
          </motion.main>

          <footer className="border-t border-accent-violet/10 py-6 text-xs text-ink-400">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <p>© {new Date().getFullYear()} {t('footer.protocol')}</p>
              <p className="font-mono">
                {t('footer.builtOn')} <span className="text-accent-violet">Solana</span> ·{' '}
                <span className="text-accent-gold">{t('footer.unaudited')}</span>
              </p>
            </div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}

function LogoMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#0A0A18" stroke="#9945FF" strokeOpacity="0.5" />
      <path
        d="M10 22V10h6a4 4 0 0 1 0 8h-3"
        stroke="#14F195"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="11" r="2" fill="#FFD700" />
    </svg>
  );
}

export default DashboardLayout;
