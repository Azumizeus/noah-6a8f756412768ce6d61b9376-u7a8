// src/pages/premium/PremiumAbout.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — À propos : présentation produit + roadmap V1/V2, mêmes
// clés i18n que AboutPage legacy, habillage tokens clairs premium.
// ═══════════════════════════════════════════════════════════════════
import PremiumNav from './PremiumNav';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import '../../styles/premium.css';

const STEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;
const PITCH_KEYS = ['pitch1', 'pitch2', 'pitch3'] as const;

const card: React.CSSProperties = {
  background: 'var(--p-canvas)',
  border: '1px solid var(--p-line)',
  borderRadius: 'var(--p-radius-lg)',
  boxShadow: 'var(--p-shadow)',
};

export default function PremiumAbout() {
  const { t } = useLanguage();

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/about" />

        <p className="p-eyebrow">{t('about.eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 8, maxWidth: 640 }}>
          {t('about.titleLine1')}{' '}
          <span style={{ color: 'var(--p-accent)' }}>{t('about.titleLine2')}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--p-ink2)', marginTop: 12, maxWidth: 560, lineHeight: 1.7 }}>
          {t('about.intro')}
        </p>
        <a
          href="#/pacts"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 20,
            borderRadius: 99,
            background: 'var(--p-accent)',
            color: 'var(--p-canvas)',
            padding: '11px 22px',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            minHeight: 40,
          }}
        >
          {t('about.exploreCta')}
        </a>

        {/* Comment ça marche */}
        <h2 style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--p-ink3)', margin: '36px 0 12px' }}>
          {t('about.howItWorks')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
          {STEP_KEYS.map((k, i) => (
            <div key={k} style={{ ...card, padding: '16px 16px' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: 'var(--p-accent)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--p-ink)', marginTop: 6 }}>{t(`about.${k}Title`)}</h3>
              <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--p-ink2)', marginTop: 4 }}>{t(`about.${k}Body`)}</p>
            </div>
          ))}
        </div>

        {/* Roadmap */}
        <h2 style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--p-ink3)', margin: '36px 0 12px' }}>
          {t('about.roadmapTitle')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
          <div style={{ ...card, padding: '20px 22px' }}>
            <span style={{ display: 'inline-block', borderRadius: 99, padding: '4px 12px', fontSize: 11, fontWeight: 700, background: 'var(--p-accent-soft)', color: 'var(--p-accent)' }}>
              {t('about.v1Badge')}
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 750, color: 'var(--p-ink)', marginTop: 10 }}>{t('about.v1Title')}</h3>
            <ul style={{ marginTop: 10, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['v1_1', 'v1_2', 'v1_3', 'v1_4'] as const).map((k) => (
                <li key={k} style={{ fontSize: 13, color: 'var(--p-ink2)', lineHeight: 1.55 }}>• {t(`about.${k}`)}</li>
              ))}
            </ul>
          </div>
          <div style={{ ...card, padding: '20px 22px' }}>
            <span style={{ display: 'inline-block', borderRadius: 99, padding: '4px 12px', fontSize: 11, fontWeight: 700, background: 'rgba(217,185,96,.12)', color: '#b8952e' }}>
              {t('about.v2Badge')}
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 750, color: 'var(--p-ink)', marginTop: 10 }}>{t('about.v2Title')}</h3>
            <ul style={{ marginTop: 10, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['v2_1', 'v2_2', 'v2_3', 'v2_4'] as const).map((k) => (
                <li key={k} style={{ fontSize: 13, color: 'var(--p-ink2)', lineHeight: 1.55 }}>• {t(`about.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Pourquoi BuildPact */}
        <h2 style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--p-ink3)', margin: '36px 0 12px' }}>
          {t('about.whyTitle')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {PITCH_KEYS.map((k) => (
            <div key={k} style={{ ...card, padding: '18px 20px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--p-ink)' }}>{t(`about.${k}Title`)}</h3>
              <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.65, color: 'var(--p-ink2)' }}>{t(`about.${k}Body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
