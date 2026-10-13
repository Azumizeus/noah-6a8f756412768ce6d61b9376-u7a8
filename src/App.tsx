import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import { mwaAuthCache } from './lib/mwaAuthCache';
import { RPC_ENDPOINT } from './lib/constants';
import { useHashRoute, usePactPdaParam } from './lib/router';
import { useChatSessionCleanup } from './hooks/useChatSessionCleanup';
import { LanguageProvider } from './lib/i18n/LanguageContext';
import { ThemeProvider } from './lib/ThemeContext';
// Frontière d'erreur globale : montée juste sous le LanguageProvider (elle
// lit useLanguage pour ses libellés) et autour du contenu routé, pour qu'une
// exception dans une page affiche une fiche de secours au lieu d'effacer
// toute l'application.
import AppErrorBoundary from './components/ErrorBoundary';
// Premium v2 (défaut)
import PremiumDashboard from './pages/premium/PremiumDashboard';
import PremiumMarketplace from './pages/premium/PremiumMarketplace';
import PremiumPacts from './pages/premium/PremiumPacts';
import PremiumBuilders from './pages/premium/PremiumBuilders';
import PremiumTreasury from './pages/premium/PremiumTreasury';
import PremiumPact from './pages/premium/PremiumPact';
import PremiumProfil from './pages/premium/PremiumProfil';
import PremiumNetwork from './pages/premium/PremiumNetwork';
import PremiumDocs from './pages/premium/PremiumDocs';
// Rejeu scripté du parcours complet, sans wallet (tournage de la vidéo et
// vitrine juges). Aucune transaction : voir pages/premium/PremiumDemo.tsx.
import PremiumDemo from './pages/premium/PremiumDemo';
import PremiumAbout from './pages/premium/PremiumAbout';
import PremiumMyDashboard from './pages/premium/PremiumMyDashboard';
import PremiumNotFound from './pages/premium/PremiumNotFound';
// Chantier 2 : la création de pact passe au shell premium. /v1/create reste
// branché sur la page legacy tant que le chantier 3 (retrait de /v1) n'est
// pas lancé — c'est le filet de sécurité si le shell premium régresse.
import PremiumCreate from './pages/premium/PremiumCreate';
// Legacy v1
import DashboardPage from './pages/DashboardPage';
import PactsPage from './pages/PactsPage';
import CreatePactPage from './pages/CreatePactPage';
import MarketplacePage from './pages/MarketplacePage';
import AboutPage from './pages/AboutPage';
import DocsPage from './pages/DocsPage';
import PactPublicPage from './pages/PactPublicPage';
import MonProfilPage from './pages/MonProfilPage';
import TreasuryPage from './pages/TreasuryPage';
import BuildersPage from './pages/BuildersPage';
import NetworkPage from './pages/NetworkPage';

import '@solana/wallet-adapter-react-ui/styles.css';

// ─── Racine '/' : premium v2, que le wallet soit connecté ou non.
// La landing marketing legacy n'est plus servie par défaut (elle affichait
// l'ancien design sombre, en rupture avec le reste de l'app). Tout le
// legacy reste accessible sous '/v1' — voir le portail sur la page Profil.
function RootRoute() {
  return <PremiumDashboard />;
}

// Purge les jetons de session du chat dès que le wallet se déconnecte ou
// change de compte. Sans rendu : il doit vivre à l'intérieur du
// WalletProvider (il lit useWallet) et rester monté sur toutes les routes,
// puisqu'on se déconnecte rarement depuis la page d'un chat.
function ChatSessionCleanup() {
  useChatSessionCleanup();
  return null;
}

// ⚠️ REVERT volontaire vers SolanaMobileWalletAdapter (package legacy) après
// une tentative de migration vers registerMwa (package "recommandé") qui a
// dégradé la fiabilité au lieu de l'améliorer. C'est CETTE configuration
// exacte (SolanaMobileWalletAdapter + VersionedTransaction dans anchor.ts)
// qui a produit 2 signatures réussies d'affilée sur Seed Vault natif. On ne
// change plus rien ici tant que ce n'est pas retesté et confirmé stable.
//
// ⚠️ FIX appIdentity.uri : cette valeur était codée en dur sur une ANCIENNE
// URL de déploiement Vercel (buildpact-9y9o4gx0g-...). Or Vercel génère une
// URL différente à CHAQUE déploiement — on en a eu au moins 6 différentes
// pendant cette session. Une identité d'app qui ne correspond pas à l'origine
// réelle de la page peut perturber l'autorisation MWA de façon incohérente.
// On utilise maintenant window.location.origin, qui s'adapte automatiquement.
// Aussi aligné sur `chain: 'solana:devnet'` (équivalent à cluster: 'devnet'
// en interne, mais c'est la forme qui a été confirmée fonctionner ailleurs).
export default function App() {
  const wallets = useMemo(
    () => [
      // ⭐ MWA — Seed Vault / Seeker (critère hackathon)
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'BuildPact',
          uri: typeof window !== 'undefined' ? window.location.origin : '',
          icon: '/favicon.png',
        },
        authorizationResultCache: mwaAuthCache,
        chain: 'solana:devnet',
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );
  const route = useHashRoute();
  const pactPda = usePactPdaParam();

  return (
    <LanguageProvider>
      <ConnectionProvider endpoint={RPC_ENDPOINT}>
        <WalletProvider wallets={wallets} autoConnect>
          {/* ThemeProvider DOIT être à l'intérieur du WalletProvider : il lit
              useWallet() pour mémoriser la palette par wallet. Monté au-dessus,
              il planterait au rendu. */}
          <ThemeProvider>
          <WalletModalProvider>
            <AppErrorBoundary fallbackHash="#/">
            <ChatSessionCleanup />
            {pactPda ? (
              // Fiche pact : premium par défaut, legacy si préfixe /v1/
              window.location.hash.includes('/v1/pact/') ? (
                <PactPublicPage pda={pactPda} />
              ) : (
                <PremiumPact pda={pactPda} />
              )
            ) : route === '/pacts' ? (
              <PremiumPacts />
            ) : route === '/create' ? (
              <PremiumCreate />
            ) : route === '/marketplace' ? (
              <PremiumMarketplace />
            ) : route === '/demo' ? (
              <PremiumDemo />
            ) : route === '/docs' ? (
              <PremiumDocs />
            ) : route === '/profile' ? (
              <PremiumProfil />
            ) : route === '/treasury' ? (
              <PremiumTreasury />
            ) : route === '/builders' ? (
              <PremiumBuilders />
            ) : route === '/network' ? (
              <PremiumNetwork />
            ) : route === '/about' ? (
              <PremiumAbout />
            ) : route === '/dashboard' ? (
              <PremiumMyDashboard />
            ) : route === '/404' ? (
              <PremiumNotFound />
            ) : route === '/' || route === '/home' ? (
              <RootRoute />
            ) : route === '/v1' ? (
              <DashboardPage />
            ) : route === '/v1/pacts' ? (
              <PactsPage />
            ) : route === '/v1/create' ? (
              <CreatePactPage />
            ) : route === '/v1/marketplace' ? (
              <MarketplacePage />
            ) : route === '/v1/docs' ? (
              <DocsPage />
            ) : route === '/v1/about' ? (
              <AboutPage />
            ) : route === '/v1/profile' ? (
              <MonProfilPage />
            ) : route === '/v1/treasury' ? (
              <TreasuryPage />
            ) : route === '/v1/builders' ? (
              <BuildersPage />
            ) : route === '/v1/network' ? (
              <NetworkPage />
            ) : (
              <PremiumNotFound />
            )}
            </AppErrorBoundary>
          </WalletModalProvider>
          </ThemeProvider>
        </WalletProvider>
      </ConnectionProvider>
    </LanguageProvider>
  );
}
