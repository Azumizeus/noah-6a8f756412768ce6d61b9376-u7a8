// src/pages/AboutPage.tsx
// Page publique de présentation produit + roadmap client (V1/V2).
// À NE PAS confondre avec la roadmap interne de dev (checklist sprint) —
// celle-ci s'adresse aux visiteurs, investisseurs et juges du hackathon.
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import { useLanguage } from '../lib/i18n/LanguageContext';

const STEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;
const PITCH_KEYS = ['pitch1', 'pitch2', 'pitch3'] as const;

export function AboutPage() {
  const { t } = useLanguage();
  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-10 sm:mb-14">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">
            {t('about.eyebrow')}
          </p>
          <h1 className="mt-2 max-w-3xl font-sans text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {t('about.titleLine1')} <span className="text-accent-violet">{t('about.titleLine2')}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-300 sm:text-base">
            {t('about.intro')}
          </p>
          <a
            href="#/pacts"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-neon px-5 py-3 text-sm font-bold text-ink-900 transition hover:opacity-90"
          >
            {t('about.exploreCta')}
          </a>
        </header>
      </FadeInUp>

      <FadeInUp>
        <h2 className="mb-4 font-sans text-lg font-semibold text-white">{t('about.howItWorks')}</h2>
      </FadeInUp>
      <section aria-label={t('about.howItWorks')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEP_KEYS.map((k, i) => (
          <FadeInUp key={k}>
            <div className="glass-panel h-full p-4">
              <span className="font-mono text-xs text-accent-violet">{i + 1}</span>
              <h3 className="mt-1 font-sans text-sm font-semibold text-white">{t(`about.${k}Title`)}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{t(`about.${k}Body`)}</p>
            </div>
          </FadeInUp>
        ))}
      </section>

      <FadeInUp>
        <h2 className="mb-4 mt-12 font-sans text-lg font-semibold text-white">{t('about.roadmapTitle')}</h2>
      </FadeInUp>
      <section aria-label={t('about.roadmapTitle')} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FadeInUp>
          <div className="glass-panel h-full p-5">
            <span className="inline-block rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-accent-neon">
              {t('about.v1Badge')}
            </span>
            <h3 className="mt-3 font-sans text-base font-semibold text-white">{t('about.v1Title')}</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-300">
              <li>• {t('about.v1_1')}</li>
              <li>• {t('about.v1_2')}</li>
              <li>• {t('about.v1_3')}</li>
              <li>• {t('about.v1_4')}</li>
            </ul>
          </div>
        </FadeInUp>
        <FadeInUp>
          <div className="glass-panel h-full p-5">
            <span className="inline-block rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-accent-gold">
              {t('about.v2Badge')}
            </span>
            <h3 className="mt-3 font-sans text-base font-semibold text-white">{t('about.v2Title')}</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-300">
              <li>• {t('about.v2_1')}</li>
              <li>• {t('about.v2_2')}</li>
              <li>• {t('about.v2_3')}</li>
              <li>• {t('about.v2_4')}</li>
            </ul>
          </div>
        </FadeInUp>
      </section>

      <FadeInUp>
        <h2 className="mb-4 mt-12 font-sans text-lg font-semibold text-white">{t('about.whyTitle')}</h2>
      </FadeInUp>
      <section aria-label={t('about.whyTitle')} className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PITCH_KEYS.map((k) => (
          <FadeInUp key={k}>
            <div className="glass-panel h-full p-5">
              <h3 className="font-sans text-base font-semibold text-white">{t(`about.${k}Title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{t(`about.${k}Body`)}</p>
            </div>
          </FadeInUp>
        ))}
      </section>
    </DashboardLayout>
  );
}

export default AboutPage;
