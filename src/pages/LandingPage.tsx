// src/pages/LandingPage.tsx
// ═══════════════════════════════════════════════════════════════════
// Nouvelle page d'accueil publique — affichée sur '/' pour tout visiteur
// dont le wallet n'est PAS connecté. Distincte du Dashboard (stats perso,
// réservé aux wallets connectés) ET de AboutPage (pitch + roadmap client,
// toujours accessible via la nav). Rôle : donner en 10 secondes l'essentiel
// du protocole + un CTA clair pour entrer dans l'app ou se connecter.
// Bilingue dès la création — voir lib/i18n.
// ═══════════════════════════════════════════════════════════════════
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import { useLanguage } from '../lib/i18n/LanguageContext';

const STEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;
const WHY_KEYS = ['why1', 'why2', 'why3'] as const;

export function LandingPage() {
  const { t } = useLanguage();

  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-12 sm:mb-16">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">
            {t('landing.eyebrow')}
          </p>
          <h1 className="mt-3 max-w-3xl font-sans text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            {t('landing.heroTitle1')} <span className="text-accent-violet">{t('landing.heroTitle2')}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-300 sm:text-base">
            {t('landing.heroSubtitle')}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#/pacts"
              // ⎫ Restyle 21/09 (prototype v3 validé) : le CTA principal passe
              // ⎪ du vert accent-neon au violet accent-violet. Le vert porte un
              // ⎬ sens fixe dans l'app (mouvement de SOL : fund/distribute/
              // ⎭ claim) — l'utiliser ici diluait ce repère, cf. buildpact-design.
              className="inline-flex items-center gap-2 rounded-xl bg-accent-violet px-5 py-3 text-sm font-bold text-ink-900 transition hover:opacity-90"
            >
              {t('landing.ctaPrimary')}
            </a>
            <a
              href="#/marketplace"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-ink-200 transition hover:border-accent-violet/40 hover:text-white"
            >
              {t('landing.ctaSecondary')}
            </a>
            <a
              href="#/docs"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-ink-300 transition hover:border-accent-violet/40 hover:text-white"
            >
              {t('landing.ctaTertiary')}
            </a>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-400">
            <span>{t('landing.trustBadge1')}</span>
            <span>{t('landing.trustBadge2')}</span>
            <span>{t('landing.trustBadge3')}</span>
          </div>
        </header>
      </FadeInUp>

      <FadeInUp>
        <h2 className="mb-4 font-sans text-lg font-semibold text-white">{t('landing.howItWorks')}</h2>
      </FadeInUp>
      <section aria-label={t('landing.howItWorks')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEP_KEYS.map((k, i) => (
          <FadeInUp key={k}>
            <div className="glass-panel h-full p-4">
              <span className="font-mono text-xs text-accent-violet">{i + 1}</span>
              <h3 className="mt-1 font-sans text-sm font-semibold text-white">{t(`landing.${k}Title`)}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{t(`landing.${k}Body`)}</p>
            </div>
          </FadeInUp>
        ))}
      </section>

      <FadeInUp>
        <h2 className="mb-4 mt-12 font-sans text-lg font-semibold text-white">{t('landing.whyTitle')}</h2>
      </FadeInUp>
      <section aria-label={t('landing.whyTitle')} className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {WHY_KEYS.map((k) => (
          <FadeInUp key={k}>
            <div className="glass-panel h-full p-5">
              <h3 className="font-sans text-base font-semibold text-white">{t(`landing.${k}Title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{t(`landing.${k}Body`)}</p>
            </div>
          </FadeInUp>
        ))}
      </section>

      <FadeInUp>
        <div className="glass-panel mt-12 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="font-sans text-lg font-semibold text-white sm:text-xl">{t('landing.finalCtaTitle')}</h2>
            <p className="mt-1 text-sm text-ink-300">{t('landing.finalCtaBody')}</p>
          </div>
          <a
            href="#/pacts"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent-violet px-5 py-3 text-sm font-bold text-ink-900 transition hover:bg-accent-violet/90"
          >
            {t('landing.enterApp')}
          </a>
        </div>
      </FadeInUp>
    </DashboardLayout>
  );
}

export default LandingPage;
