// src/hooks/useActivityFeed.ts
import { useEffect, useState } from 'react';
import { fetchRecentEvents, subscribeToPactEvents, type PactEvent } from '../lib/activity';
import { isRemoteEnabled } from '../lib/supabaseClient';

/**
 * Fil d'activité Realtime d'un projet : charge l'historique récent puis
 * s'abonne aux nouveaux événements Supabase Realtime (INSERT sur pact_events).
 * Si Supabase n'est pas configuré (env absentes), renvoie juste une liste
 * vide sans erreur — le composant appelant doit gérer ce cas silencieusement.
 */
export function useActivityFeed(projectPda: string | null) {
  const [events, setEvents] = useState<PactEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectPda || !isRemoteEnabled) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchRecentEvents(projectPda).then((initial) => {
      if (!cancelled) {
        setEvents(initial);
        setLoading(false);
      }
    });

    const unsubscribe = subscribeToPactEvents(projectPda, (evt) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === evt.id)) return prev; // dédup si double livraison
        return [evt, ...prev].slice(0, 30);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectPda]);

  return { events, loading, enabled: isRemoteEnabled };
}
