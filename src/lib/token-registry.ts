// src/lib/token-registry.ts
// ═══════════════════════════════════════════════════════════════════
// Résolution nom/logo d'un token via l'API Tokens officielle (Option A).
// https://api.tokens.xyz/v1 — GET /v1/assets/:assetId?include=profile,
// auth par header x-api-key.
//
// Fonction PURE (même convention que rpcProxy.ts) : ni DOM, ni
// `import.meta.env` — la clé arrive en paramètre, lue par l'appelant
// (composant) depuis l'environnement. Testable sans réseau ni build.
//
// Sécurité (règle du dépôt : jamais de clé dans le livré) : en PRODUCTION
// la clé ne part pas dans le bundle — passer par le relais Supabase Edge
// (même motif que le RPC, cf. .env.example). En dev local seul,
// VITE_TOKENS_API_KEY peut être posée dans .env.local (ignoré par git).
// Sans clé : null, l'affichage garde l'adresse tronquée.
// ═══════════════════════════════════════════════════════════════════

export const TOKENS_API_DEFAULT_BASE = 'https://api.tokens.xyz/v1';

export interface RegistryTokenInfo {
  assetId: string;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
}

export function buildAssetUrl(apiBase: string, mint: string): string {
  const base = apiBase.replace(/\/+$/, '');
  return `${base}/assets/${encodeURIComponent(mint.trim())}?include=profile`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Extrait le profil utile du payload /v1/assets/:assetId. */
export function parseAssetPayload(json: unknown): RegistryTokenInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const asset = (json as Record<string, unknown>).asset;
  if (typeof asset !== 'object' || asset === null) return null;
  const a = asset as Record<string, unknown>;
  const assetId = str(a.assetId);
  if (!assetId) return null;
  const primary = (a.primaryVariant ?? null) as Record<string, unknown> | null;
  const market = (primary?.market ?? null) as Record<string, unknown> | null;
  return {
    assetId,
    name: str(a.name) ?? str(market?.name),
    symbol: str(a.symbol) ?? str(market?.symbol),
    imageUrl: str(a.imageUrl) ?? str(primary?.logoURI) ?? str(market?.logoURI),
  };
}

export interface RegistryOptions {
  apiBase?: string;
  timeoutMs?: number;
}

/** Résout un mint → nom/symbole/logo. Ne jette jamais (null en échec). */
export async function resolveRegistryProfile(
  mint: string,
  apiKey: string | undefined,
  opts: RegistryOptions = {},
): Promise<RegistryTokenInfo | null> {
  const key = apiKey?.trim();
  if (!key || !mint?.trim()) return null;
  const { apiBase = TOKENS_API_DEFAULT_BASE, timeoutMs = 8000 } = opts;
  try {
    const res = await fetch(buildAssetUrl(apiBase, mint), {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return parseAssetPayload(await res.json());
  } catch {
    return null;
  }
}
