// src/lib/router.ts
import { useEffect, useState } from 'react';
import { classifyHash, type AppRoute } from './hashRoute';

// Routes principales = premium v2. Legacy accessible sous /v1/*.
// Le classement (valide / 404 / redirection /v2) vit dans hashRoute.ts,
// testable sans window. Ce fichier ne fait que le brancher sur le hash.
export type Route = AppRoute;

function readHash(): Route {
  const classified = classifyHash(window.location.hash);
  if (classified.redirectTo && window.location.hash.replace(/^#/, '').split('?')[0] !== classified.redirectTo) {
    window.location.hash = '#' + classified.redirectTo;
  }
  return classified.route;
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

function extractPactPda(): string | null {
  return classifyHash(window.location.hash).pactPda;
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
