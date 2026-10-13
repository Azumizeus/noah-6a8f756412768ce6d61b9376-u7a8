// src/hooks/useOpenRoles.ts
// ═══════════════════════════════════════════════════════════════════
// Charge tous les rôles recherchés (Supabase, off-chain) en UN SEUL appel —
// évite un fetch par carte sur les listes (Marketplace). Même pattern que
// useProjectMedia : donnée annexe, volontairement séparée de useProjects().
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { fetchAllOpenRoles } from '../lib/openRoles';

export function useOpenRoles() {
  const [openRoles, setOpenRoles] = useState<Map<string, string[]>>(new Map());
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchAllOpenRoles().then((m) => {
      if (!cancelled) setOpenRoles(m);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { openRoles, refresh };
}

export default useOpenRoles;
