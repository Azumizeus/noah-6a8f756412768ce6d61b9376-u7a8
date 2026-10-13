// src/pages/CreatePactPage.tsx
// Page hôte du wizard de création. Était un trou noir : le composant
// CreatePactWizard (973 lignes, complet et testé) existait depuis le début
// mais n'était importé par AUCUNE page — aucun chemin utilisateur ne
// menait à la création d'un pact via l'UI (audit 19/09, critique nº1).
// Route : `#/create` — ajoutée à VALID dans router.ts.
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import { CreatePactWizard } from '../components/CreatePactWizard';
import { useLanguage } from '../lib/i18n/LanguageContext';

export default function CreatePactPage() {
  const { t } = useLanguage();
  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">{t('createWizard.eyebrow')}</p>
          <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('createWizard.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">
            {t('createWizard.step1Sub')}
          </p>
        </header>
      </FadeInUp>
      {/* onSuccess = création confirmée ; PactsPage mine=1 montre le pact
          tout neuf. Le wizard purge lui-même son brouillon après succès. */}
      <CreatePactWizard
        onSuccess={() => { window.location.hash = '#/pacts?mine=1'; }}
        onClose={() => { window.location.hash = '#/pacts'; }}
      />
    </DashboardLayout>
  );
}
