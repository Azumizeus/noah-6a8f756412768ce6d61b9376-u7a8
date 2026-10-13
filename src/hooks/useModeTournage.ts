// src/hooks/useModeTournage.ts
// ═══════════════════════════════════════════════════════════════════
// Pont React vers lib/tournage.ts.
//
// Trois choses, et rien d'autre :
//   1. amorcer l'état depuis le hash au montage (lien partagé, rechargement) ;
//   2. suivre le hash quand il change ailleurs (navigation, bouton retour) ;
//   3. exposer un basculeur qui écrit DANS LES DEUX : le store (pour que les
//      composants déjà montés se mettent à jour) et le hash (pour que le mode
//      survive à un rechargement et reste partageable).
//
// Il expose aussi le RYTHME du rejeu (`?pas=`, en secondes) : même source
// (le hash), même raison d'être partageable. Le rythme n'a pas de store —
// seul le rejeu le lit, il n'a donc pas besoin de réveiller le bandeau.
//
// ⚠️ Ce hook est monté par le bandeau de santé (les deux shells) ET par la
// page de démo. C'est volontaire : le mode doit pouvoir être lu là où il
// agit. Le store de lib/tournage.ts est au niveau du MODULE, donc les deux
// montages voient le même booléen.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import {
  hashAvecDelaiEtape,
  hashAvecModeTournage,
  lireDelaiEtape,
  lireModeTournage,
  modeTournageActif,
  setModeTournage,
  subscribeModeTournage,
} from '../lib/tournage';

export interface ModeTournage {
  actif: boolean;
  /** Allume/éteint le mode (et le reflète dans l'URL). */
  basculer: (valeur: boolean) => void;
  /** Durée d'affichage d'une étape, en millisecondes (`?pas=` en secondes). */
  delaiMs: number;
  /** Change le rythme et l'inscrit dans l'URL. */
  setDelaiMs: (ms: number) => void;
}

export function useModeTournage(): ModeTournage {
  // Amorçage depuis le hash. ⚠️ On n'écrit PAS dans le store ici : un
  // initialiseur de useState s'exécute PENDANT le rendu, et `setModeTournage`
  // notifierait les abonnés déjà montés — donc un setState sur un autre
  // composant pendant le rendu. Constaté en console le 12/10/2026 :
  // « Cannot update a component (RpcHealthBanner) while rendering a different
  // component (PremiumDemo) ». Le store est aligné juste après, dans un effet.
  const [actif, setActif] = useState<boolean>(() =>
    lireModeTournage(window.location.hash)
  );
  const [delaiMs, setDelai] = useState<number>(() => lireDelaiEtape(window.location.hash));

  useEffect(() => {
    // Alignement APRÈS le rendu. Tous les montages lisent le même hash, donc
    // ils amorcent la même valeur : le store ne peut pas se contredire.
    if (modeTournageActif() !== actif) setModeTournage(actif);
  }, [actif]);

  useEffect(() => subscribeModeTournage(setActif), []);

  useEffect(() => {
    // Un seul écouteur pour les deux réglages : ils viennent du même hash et
    // un `hashchange` les concerne toujours ensemble.
    const surHash = () => {
      setModeTournage(lireModeTournage(window.location.hash));
      setDelai(lireDelaiEtape(window.location.hash));
    };
    window.addEventListener('hashchange', surHash);
    return () => window.removeEventListener('hashchange', surHash);
  }, []);

  const basculer = useCallback((valeur: boolean) => {
    setModeTournage(valeur);
    const cible = hashAvecModeTournage(window.location.hash, valeur);
    if (cible !== window.location.hash) window.location.hash = cible;
  }, []);

  const setDelaiMs = useCallback((ms: number) => {
    // L'état local d'abord : le rejeu doit changer de rythme immédiatement,
    // même si le hash n'a pas bougé (valeur identique, navigateur qui refuse
    // l'écriture…). L'URL reste la source de vérité au chargement suivant.
    setDelai(ms);
    const cible = hashAvecDelaiEtape(window.location.hash, ms);
    if (cible !== window.location.hash) window.location.hash = cible;
  }, []);

  return { actif, basculer, delaiMs, setDelaiMs };
}

export default useModeTournage;
