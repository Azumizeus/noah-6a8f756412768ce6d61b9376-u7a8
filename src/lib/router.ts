// src/lib/router.ts
import { useEffect, useState } from 'react';

// Routes principales = premium v2. Legacy accessible sous /v1/*.
export type Route =
  | '/'
  | '/pacts'
  | '/marketplace'
  | '/treasury'
  | '/docs'
  | '/about'
  | '/profile'
  | '/home'
  | '/builders'
  | '/network'
  | '/create'
  | '/demo'
  | '/v1'
  | '/v1/pacts'
  | '/v1/marketplace'
  | '/v1/treasury'
  | '/v1/docs'
  | '/v1/about'
  | '/v1/profile'
  | '/v1/builders'
  | '/v1/network'
  | '/v1/create';

// ⚠️ Toute route absente de VALID retombe silencieusement sur '/' — pas de
// 404, pas d'avertissement. Ajouter une entrée au type sans l'ajouter ici
// donne un lien qui « ne fait rien » et se debug très mal.
const VALID: Route[] = [
  // Premium v2 (défaut)
  '/', '/pacts', '/marketplace', '/treasury', '/docs', '/about', '/profile',
  '/home', '/builders', '/network', '/create',
  // Rejeu scripté sans wallet (vidéo de démo / vitrine juges).
  '/demo',
  // Legacy v1
  '/v1', '/v1/pacts', '/v1/marketplace', '/v1/treasury', '/v1/docs',
  '/v1/about', '/v1/profile', '/v1/builders', '/v1/network', '/v1/create',
];

// Redirections v2 → nouvelles routes : les anciens bookmarks et liens
// partagés (#/v2, #/v2/pacts, …) restent valides.
const V2_REDIRECTS: Record<string, string> = {
  '/v2': '/',
  '/v2/pacts': '/pacts',
  '/v2/marketplace': '/marketplace',
  '/v2/treasury': '/treasury',
  '/v2/docs': '/docs',
  '/v2/about': '/about',
  '/v2/profile': '/profile',
  '/v2/builders': '/builders',
  '/v2/network': '/network',
};

function readHash(): Route {
  const raw = window.location.hash.replace(/^#/, '');
  // Route dynamique #/pact/<pda> — gérée séparément par usePactPdaParam(),
  // on la laisse passer telle quelle pour ne pas la faire retomber sur '/'.
  if (raw.startsWith('/pact/') || raw.startsWith('/v1/pact/') || raw.startsWith('/v2/pact/')) return raw as Route;
  // Une route peut porter un ?paramètre (ex: /pacts?mine=1) — on compare
  // uniquement le chemin, le paramètre est lu séparément (voir usePactsMineParam).
  const path = raw.split('?')[0];
  // Redirect v2 → nouvelle route
  if (V2_REDIRECTS[path]) {
    window.location.hash = '#' + V2_REDIRECTS[path];
    return V2_REDIRECTS[path] as Route;
  }
  return (VALID as string[]).includes(path) ? (path as Route) : '/';
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => readHash());

  useEffect(() => {
    const onHashChange = () => setRoute(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

// Format base58 Solana (32-44 caractères, alphabet sans 0/O/I/l), avec un
// éventuel suffixe ?doc=<id> pour lier directement vers un document du vault
// (voir useVaultDocParam ci-dessous et VaultPanel.tsx).
const PDA_RE = /^(?:\/v[12])?\/pact\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/;

function extractPactPda(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  const m = raw.match(PDA_RE);
  return m ? m[1] : null;
}

/** Extrait ?doc=<id> du hash courant (#/pact/<pda>?doc=42) — null si absent/invalide. */
export function useVaultDocParam(): number | null {
  const [docId, setDocId] = useState<number | null>(() => readDocId());
  useEffect(() => {
    const onHashChange = () => setDocId(readDocId());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return docId;
}

function readDocId(): number | null {
  const raw = window.location.hash.replace(/^#/, '');
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(raw.slice(qIdx + 1));
  const doc = params.get('doc');
  const n = doc ? Number(doc) : NaN;
  return Number.isInteger(n) ? n : null;
}

/** Construit un lien direct vers un document précis du vault (nécessite d'être membre + déverrouiller). */
export function vaultDocUrl(pdaBase58: string, documentId: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#/pact/${pdaBase58}?doc=${documentId}`;
}

/** Détecte #/pacts?mine=1 — permet au Dashboard de renvoyer directement vers
 *  la page Pacts avec le filtre "Mes Pacts" déjà sélectionné (voir PactsPage). */
export function usePactsMineParam(): boolean {
  const read = () => {
    const raw = window.location.hash.replace(/^#/, '');
    const qIdx = raw.indexOf('?');
    if (qIdx === -1) return false;
    return new URLSearchParams(raw.slice(qIdx + 1)).get('mine') === '1';
  };
  const [mine, setMine] = useState<boolean>(() => read());
  useEffect(() => {
    const onHashChange = () => setMine(read());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return mine;
}

/**
 * Hook indépendant du routeur principal : détecte une URL de type
 * `#/pact/<pda>` (page publique lecture seule, partagée sans wallet).
 * Volontairement séparé de useHashRoute() pour ne pas toucher au type
 * `Route` ni au comportement de navigation existant (Dashboard/Pacts/...).
 */
export function usePactPdaParam(): string | null {
  const [pda, setPda] = useState<string | null>(() => extractPactPda());

  useEffect(() => {
    const onHashChange = () => setPda(extractPactPda());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return pda;
}

/** Construit l'URL complète (avec origin) vers la page publique d'un pact. */
export function pactPublicUrl(pdaBase58: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#/pact/${pdaBase58}`;
}
