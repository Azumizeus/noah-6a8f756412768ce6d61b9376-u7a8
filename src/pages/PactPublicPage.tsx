// src/pages/PactPublicPage.tsx
// ═══════════════════════════════════════════════════════════════════
// Route #/pact/<pda> — fiche publique en lecture seule, accessible SANS
// wallet connecté (c'est le lien partagé par le founder). Les actions
// on-chain restent disponibles si un wallet est branché : chaque membre
// approuve avec SON wallet depuis cette page, sans passer par le wizard.
// ═══════════════════════════════════════════════════════════════════
import { usePublicPact, usePactActions, useProjects } from '../hooks/useProjects';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePactPdaParam } from '../lib/router';
import { useProjectMedia } from '../hooks/useProjectMedia';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import PactCard from '../components/PactCard';
import TxBanner from '../components/TxBanner';
import ChatBox from '../components/ChatBox';
import VaultPanel from '../components/VaultPanel';

interface Props {
  // App.tsx passe le PDA extrait du hash. Optionnel pour rester utilisable
  // sans prop (la page sait le relire elle-même via usePactPdaParam).
  pda?: string;
}

export default function PactPublicPage({ pda: pdaProp }: Props = {}) {
  const { t } = useLanguage();
  const pdaFromHash = usePactPdaParam();
  const pda = pdaProp ?? pdaFromHash;
  const { connected } = useWallet();
  const { pact, loading, error } = usePublicPact(pda);
  const { media, refresh: refreshMedia } = useProjectMedia();

  // refresh() global : après une action on-chain (approve/fund/finalize) la
  // liste ET cette fiche doivent repartir du RPC. usePublicPact se recharge
  // via son propre effet quand le wallet change ; ici on force un remount
  // par rechargement de route pour rester simple et ne pas dupliquer l'état.
  const { refresh } = useProjects();
  const actions = usePactActions(refresh);

  if (loading) {
    return <div className="skeleton h-64 w-full rounded-2xl" aria-hidden="true" />;
  }

  if (error || !pact) {
    return (
      <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
        {t('common.rpcErrorPrefix')} {error ?? 'Pact introuvable.'}
      </p>
    );
  }

  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
    <div className="space-y-6">
      {actions.txState && (
        <TxBanner state={actions.txState} onDismiss={actions.clearTxState} />
      )}

      <FadeInUp>
        <PactCard
          pact={pact}
          walletConnected={connected}
          busyAction={actions.busyAction}
          onFund={actions.runFund}
          onFinalize={actions.runFinalize}
          clearTopBanner={actions.clearTxState}
          onDistributed={refresh}
          media={media.get(pact.pda.toBase58())}
          onMediaUpdated={refreshMedia}
          showOpenSheetButton={false}
        />
      </FadeInUp>

      {/* ⚠️ RÉGRESSION CORRIGÉE — le chat avait disparu de cette page.

          Un commentaire de PactCard.tsx annonçait explicitement que la fiche
          publique « rend chat + vault juste en dessous », mais la page ne
          montait plus que <PactCard>. Les composants existaient toujours et
          fonctionnaient, l'historique des messages était intact en base : ils
          n'étaient simplement plus montés nulle part, perdus dans un refactor.

          C'est le pire profil de bug : aucune erreur, aucun log, la page
          s'affiche normalement. Seule une fonctionnalité entière manque. */}
      <FadeInUp>
        <ChatBox
          projectPda={pact.pda.toBase58()}
          creatorWallet={pact.creator.toBase58()}
        />
      </FadeInUp>

      <FadeInUp>
        <VaultPanel
          projectPda={pact.pda.toBase58()}
          members={pact.members}
          creatorWallet={pact.creator.toBase58()}
        />
      </FadeInUp>
    </div>
    </DashboardLayout>
  );
}
