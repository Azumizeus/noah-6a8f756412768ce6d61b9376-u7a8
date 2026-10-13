// src/pages/premium/PremiumNav.tsx
// ═══════════════════════════════════════════════════════════════════
// Bandeau supérieur du shell premium : switch des tabs, sélecteur
// d'apparence compact, switch langue FR/EN et bouton wallet — même sens
// des contrôles que la version legacy (langue + connexion toujours visibles).
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import {
  useAppearance,
  loadAppearance,
  applyAppearanceToDom,
  useAppearanceMode,
  loadAppearanceMode,
  applyAppearanceModeToDom,
  APPEARANCE_META,
  APPEARANCE_IDS,
  type AppearanceId,
  type AppearanceMode,
} from '../../lib/appearance';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import { useRpcHealth } from '../../hooks/useRpcHealth';
import BrandLogo from '../../components/BrandLogo';
import RpcHealthBanner from '../../components/RpcHealthBanner';
import { AppWalletButton } from '../../components/AppWalletButton';
import PremiumSettings from './PremiumSettings';
import '../../styles/premium.css';

// Les libellés passent par t() : 'Réseau' et 'À propos' étaient écrits en
// français en dur et restaient tels quels quand l'app passait en anglais.
const NAV_LINKS = [
  { href: '#/dashboard', key: 'nav.dashboard' },
  { href: '#/marketplace', key: 'nav.marketplace' },
  { href: '#/pacts', key: 'nav.pacts' },
  { href: '#/builders', key: 'nav.builders' },
  // Rejeu scripté sans wallet : entrée de premier rang volontairement, c'est
  // la page qu'on ouvre devant les juges quand le wallet n'est pas prêt.
  { href: '#/demo', key: 'nav.demo' },
  { href: '#/treasury', key: 'nav.treasury' },
  { href: '#/network', key: 'nav.network' },
  { href: '#/profile', key: 'nav.profile' },
  { href: '#/docs', key: 'nav.docs' },
  { href: '#/about', key: 'nav.about' },
];

export default function PremiumNav({ active }: { active: string }) {
  const [appearance, setAppearance] = useAppearance();
  const [appearanceMode, setAppearanceMode] = useAppearanceMode();
  const { lang, setLang, t } = useLanguage();
  // Panneau Paramètres monté ICI et pas dans chaque page : PremiumNav est le
  // seul point commun aux 10 pages premium, donc une page ajoutée demain
  // hérite du réglage sans rien câbler. Le panneau est en position:fixed, sa
  // place dans le DOM n'affecte pas sa mise en page.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Santé de l'endpoint RPC principal : montée ICI, avec le panneau
  // Paramètres, pour la même raison — PremiumNav est le seul point commun
  // aux dix pages premium. Une panne de l'endpoint par défaut (relais Edge
  // non déployé, nœud saturé) était jusqu'ici parfaitement silencieuse.
  const santeRpc = useRpcHealth();

  // Garde-fou : garantit les DEUX attributs même si un provider global n'est
  // pas encore monté (banc d'essai autonome).
  useEffect(() => {
    if (!document.documentElement.getAttribute('data-appearance')) {
      applyAppearanceToDom(loadAppearance());
    }
    if (!document.documentElement.getAttribute('data-appearance-mode')) {
      applyAppearanceModeToDom(loadAppearanceMode());
    }
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [active]);

  // Gestionnaire de clic unifié : change le hash et empêche le saut navigateur
  const handleNavClick = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    if (window.location.hash === href) return;
    window.location.hash = href;
  };

  return (
    <>
    <a className="p-skip" href="#main">{t('nav.skipToContent')}</a>
    <div className="p-shell-nav">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <BrandLogo size={30} fontSize={16} />
        <span className="p-beta" title={t('footer.unaudited')}>{t('nav.devnetBeta')}</span>
      </span>
      <button
        type="button"
        className="p-nav-toggle"
        aria-expanded={menuOpen}
        aria-controls="premium-nav-links"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
      </button>
      <nav id="premium-nav-links" className="p-shell-links" data-open={menuOpen ? 'true' : 'false'} aria-label={t('nav.mainNav')}>
        {NAV_LINKS.map((l) => (
          <button
            key={l.href}
            type="button"
            style={{
              fontSize: 12.5,
              fontWeight: active === l.href ? 700 : 550,
              color: active === l.href ? 'var(--p-accent)' : 'var(--p-ink2)',
              background: active === l.href ? 'var(--p-accent-soft)' : 'transparent',
              padding: '8px 14px',
              borderRadius: 99,
              textDecoration: 'none',
              minHeight: 36,
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={handleNavClick(l.href)}
            aria-pressed={active === l.href}
          >
            {t(l.key)}
          </button>
        ))}

        {/* Switch thème compact */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          {APPEARANCE_IDS.map((id: AppearanceId) => (
            <button
              key={id}
              type="button"
              onClick={() => setAppearance(id)}
              aria-pressed={appearance === id}
              title={APPEARANCE_META[id].desc}
              style={{
                width: 30,
                height: 30,
                borderRadius: 99,
                border: `2px solid ${appearance === id ? 'var(--p-accent)' : 'var(--p-line)'}`,
                background: APPEARANCE_META[id].swatch,
                cursor: 'pointer',
                padding: 0,
              }}
              aria-label={t('nav.appearanceAria', { name: APPEARANCE_META[id].label })}
            />
          ))}
        </span>

        {/* Bascule Sombre/Clair du shell premium. Même paire soleil/lune que
            ModeToggle du legacy, mais habillée en tokens premium et pilotée par
            l'axe data-appearance-mode (lib/appearance.ts) — les pages premium
            n'avaient jusqu'ici AUCUN réglage clair/sombre. */}
        <span
          role="radiogroup"
          aria-label={t('theme.modeAria')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            marginLeft: 8,
            padding: 2,
            borderRadius: 99,
            border: '1px solid var(--p-line)',
            background: 'var(--p-canvas)',
          }}
        >
          {(['light', 'dark'] as const).map((m: AppearanceMode) => {
            const active = appearanceMode === m;
            const label = t(m === 'light' ? 'theme.modeLight' : 'theme.modeDark');
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                title={label}
                onClick={() => setAppearanceMode(m)}
                style={{
                  width: 26,
                  height: 26,
                  display: 'grid',
                  placeItems: 'center',
                  border: 'none',
                  borderRadius: 99,
                  padding: 0,
                  cursor: 'pointer',
                  color: active ? '#fff' : 'var(--p-ink2)',
                  background: active ? 'var(--p-accent)' : 'transparent',
                }}
              >
                {m === 'dark' ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </span>

        {/* Switch langue FR/EN — tokens premium clairs */}
        <span
          role="group"
          aria-label={t('nav.langSwitch')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            marginLeft: 8,
            padding: 2,
            borderRadius: 99,
            border: '1px solid var(--p-line)',
            background: 'var(--p-canvas)',
          }}
        >
          {(['fr', 'en'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              aria-label={t(code === 'fr' ? 'nav.langFr' : 'nav.langEn')}
              style={{
                fontSize: 11.5,
                fontWeight: lang === code ? 700 : 550,
                color: lang === code ? '#fff' : 'var(--p-ink2)',
                background: lang === code ? 'var(--p-accent)' : 'transparent',
                border: 'none',
                borderRadius: 99,
                padding: '5px 11px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {code}
            </button>
          ))}
        </span>

        {/* Réglages du shell premium. La nav n'exposait que des réglages
            épars (palette, thème, langue) : les Paramètres regroupent tout,
            dont densité, RPC et affichage USD, introuvables sur le premium. */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-label={t('profile.settingsTitle')}
          title={t('profile.settingsTitle')}
          style={{
            width: 34,
            height: 34,
            marginLeft: 8,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 99,
            border: '1px solid var(--p-line)',
            background: 'var(--p-canvas)',
            color: 'var(--p-ink2)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Bouton wallet — même composant que partout ailleurs */}
        <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}>
          <AppWalletButton />
        </span>
      </nav>

      {settingsOpen && <PremiumSettings onClose={() => setSettingsOpen(false)} />}
    </div>
    <RpcHealthBanner
      // Variante explicite : ce shell définit les tokens `--p-*`, l'autre non.
      variante="premium"
      sante={santeRpc.sante}
      enCours={santeRpc.enCours}
      onVerifier={santeRpc.verifier}
      onOpenSettings={() => setSettingsOpen(true)}
    />
    <div id="main" tabIndex={-1} />
    </>
  );
}