// src/hooks/useProjectMedia.ts
// ═══════════════════════════════════════════════════════════════════
// Charge tous les logos/bannières (Supabase, off-chain) en UN SEUL appel —
// évite un fetch par carte sur les listes (Pacts, Marketplace). Volontairement
// séparé de useProjects() : le média est une donnée annexe, pas on-chain,
// on ne veut pas faire dépendre le fetch des comptes Solana de Supabase.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { fetchAllProjectMedia, type ProjectMedia } from '../lib/media';

export function useProjectMedia() {
  const [media, setMedia] = useState<Map<string, ProjectMedia>>(new Map());
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchAllProjectMedia().then((m) => {
      if (!cancelled) setMedia(m);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { media, refresh };
}

export default useProjectMedia;
