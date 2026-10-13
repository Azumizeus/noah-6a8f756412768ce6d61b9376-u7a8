// Page affichée pour un hash inconnu (#/acts, #/pact/pas-une-adresse…).
// Elle ne réutilise pas le registre : une route fausse ne doit pas
// ressembler à « 0 pact ».
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
import '../../styles/premium.css';

export default function PremiumNotFound() {
  const { t } = useLanguage();
  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '20px 24px 96px' }}>
        <PremiumNav active="" />
        <p className="p-eyebrow">{t('v2.notFound.eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', margin: '8px 0' }}>
          {t('v2.notFound.title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--p-ink2)', maxWidth: 520, lineHeight: 1.65 }}>
          {t('v2.notFound.body')}
        </p>
        <a className="p-btn primary" href="#/" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 18, width: 'auto', flex: '0 0 auto', padding: '0 16px', textDecoration: 'none' }}>
          {t('v2.notFound.home')}
        </a>
      </div>
    </div>
  );
}
