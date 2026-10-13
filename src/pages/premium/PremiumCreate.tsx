// src/pages/premium/PremiumCreate.tsx
// ═══════════════════════════════════════════════════════════════════
// Chantier 2 — la création de pact dans le shell premium.
//
// Périmètre volontairement minuscule : cette page ne fait que DÉPLACER le
// wizard existant dans le nouveau shell. Elle ne le réécrit pas, ne le
// duplique pas, et ne touche à AUCUNE de ses fonctions — signature,
// construction de transaction, ancrage, médias, membres : le wizard est
// importé tel quel, avec les mêmes `onSuccess` / `onClose` que la page
// legacy (CreatePactPage), qui reste en place sous /v1/create.
//
// L'habillage est repris par le conteneur `.p-legacy-skin`
// (src/styles/premium.css) : il redéclare les variables historiques
// (`--canvas-*-rgb`, `--ink-*-rgb`, accents) avec les valeurs de la palette
// premium active, et remappe les couleurs sémantiques Tailwind du wizard sur
// les rôles premium. Le wizard suit donc palette ET mode clair/sombre sans
// qu'une seule de ses classes ait été renommée.
// ═══════════════════════════════════════════════════════════════════
import { CreatePactWizard } from '../../components/CreatePactWizard';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
import '../../styles/premium.css';

export default function PremiumCreate() {
  const { t } = useLanguage();

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="" />

        <p className="p-eyebrow">{t('createWizard.eyebrow')}</p>
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 8 }}>
          {t('createWizard.title')}
        </h1>
        <p style={{ color: 'var(--p-ink2)', marginTop: 10, maxWidth: 640, fontSize: 14 }}>
          {t('createWizard.step1Sub')}
        </p>

        {/* Peau historique scopée — voir l'en-tête de la section dans
            premium.css. La classe vit sur un ancêtre COMMUN aux étapes et à
            leurs modales : aucune modale du wizard n'est portée par un
            portail React (vérifié : aucun createPortal dans le wizard), donc
            toutes héritent des variables. */}
        <div className="p-legacy-skin" style={{ marginTop: 22 }}>
          {/* onSuccess = création confirmée ; le pact tout neuf apparaît avec
              mine=1. Le wizard purge lui-même son brouillon après succès. */}
          <CreatePactWizard
            onSuccess={() => { window.location.hash = '#/pacts?mine=1'; }}
            onClose={() => { window.location.hash = '#/pacts'; }}
          />
        </div>
      </div>
    </div>
  );
}
