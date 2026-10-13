// src/lib/supabaseClient.ts
// ═══════════════════════════════════════════════════════════════════
// Client Supabase PARTAGÉ — une seule instance pour tout le frontend
// (profils builders, fil d'activité Realtime, futur chat projet...).
// Évite l'avertissement "Multiple GoTrueClient instances" et garde une
// seule connexion Realtime WebSocket ouverte.
// ═══════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Valeurs de secours : URL du projet + clé ANON (publique par conception —
// elle est de toute façon embarquée dans le bundle JS, la sécurité repose
// sur les policies RLS). Évite que le client se désactive silencieusement
// sur une plateforme où les variables d'env ne sont pas injectées (preview
// trynoah). Les variables d'env, si présentes, restent prioritaires.
const FALLBACK_SUPABASE_URL = 'https://xkznmflyiilgmxhvgega.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhrem5tZmx5aWlsZ214aHZnZWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzQ1ODQsImV4cCI6MjEwMjcxMDU4NH0.aMLj1FYKDPhvcTMhOPJDQKO8X4kO4uBnv0gH5aeh3vo';

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_SUPABASE_ANON_KEY;

/** true si les variables d'env Supabase sont présentes (Vercel + .env local) */
export const isRemoteEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** URL de base du projet — utile pour construire l'URL d'une Edge Function
 *  (`${SUPABASE_PROJECT_URL}/functions/v1/<nom>`), voir lib/profileRemote.ts. */
export const SUPABASE_PROJECT_URL = SUPABASE_URL;

export const supabase: SupabaseClient | null = isRemoteEnabled
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  : null;
