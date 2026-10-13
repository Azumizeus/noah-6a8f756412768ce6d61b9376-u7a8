// src/lib/hashRoute.ts
// ═══════════════════════════════════════════════════════════════════
// Classement PUR d'un hash (#/marketplace, #/acts, #/pact/<pda>).
// Aucun accès à window : le hook React (lib/router.ts) applique les
// redirections ; les tests importent ce module sans navigateur.
//
// Une route inconnue ne retombe PAS sur l'accueil. L'accueil affiche le
// registre des pacts, et pendant le chargement ce registre dit « 0 pact » —
// un #/acts tapé de travers ressemblait donc à une liste vide.
// ═══════════════════════════════════════════════════════════════════

export type AppRoute =
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
  | '/dashboard'
  | '/404'
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

const VALID: readonly AppRoute[] = [
  '/', '/pacts', '/marketplace', '/treasury', '/docs', '/about', '/profile',
  '/home', '/builders', '/network', '/create', '/demo', '/dashboard',
  '/v1', '/v1/pacts', '/v1/marketplace', '/v1/treasury', '/v1/docs',
  '/v1/about', '/v1/profile', '/v1/builders', '/v1/network', '/v1/create',
];

/** Anciens bookmarks #/v2/… — toujours valides, renvoyés vers la route actuelle. */
export const V2_REDIRECTS: Record<string, AppRoute> = {
  '/v2': '/',
  '/v2/pacts': '/pacts',
  '/v2/marketplace': '/marketplace',
  '/v2/treasury': '/treasury',
  '/v2/docs': '/docs',
  '/v2/about': '/about',
  '/v2/profile': '/profile',
  '/v2/builders': '/builders',
  '/v2/network': '/network',
  '/v2/dashboard': '/dashboard',
};

const PDA_RE = /^(?:\/v[12])?\/pact\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/;

export interface ClassifiedHash {
  route: AppRoute;
  /** Présent quand le hash doit être réécrit (bookmarks /v2). */
  redirectTo?: AppRoute;
  /** PDA d'une fiche pact, ou null. */
  pactPda: string | null;
}

export function classifyHash(hash: string): ClassifiedHash {
  const raw = hash.replace(/^#/, '');
  const pact = raw.match(PDA_RE);
  if (pact) return { route: '/', pactPda: pact[1] };
  // #/pact/… mal formé (trop court, caractères hors base58) : page 404,
  // pas le registre.
  if (raw.startsWith('/pact/') || raw.startsWith('/v1/pact/') || raw.startsWith('/v2/pact/')) {
    return { route: '/404', pactPda: null };
  }
  const path = raw.split('?')[0];
  if (path === '' || path === '/') return { route: '/', pactPda: null };
  const redirected = V2_REDIRECTS[path];
  if (redirected) return { route: redirected, redirectTo: redirected, pactPda: null };
  if ((VALID as readonly string[]).includes(path)) return { route: path as AppRoute, pactPda: null };
  return { route: '/404', pactPda: null };
}
