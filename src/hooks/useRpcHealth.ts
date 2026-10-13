// src/hooks/useRpcHealth.ts
// ═══════════════════════════════════════════════════════════════════
// Pont React vers lib/rpcHealth.ts.
//
// Trois responsabilités, et rien d'autre :
//   1. sonder l'endpoint PRINCIPAL (celui que `constants.ts` met en tête de
//      liste) sans marteler le réseau — cache court + requête mutualisée ;
//   2. s'abonner au journal des rotations, pour que l'écran se rafraîchisse
//      au moment de la bascule et pas au rechargement suivant ;
//   3. rendre un résumé affichable (`SanteRpc`), où les URL sont déjà
//      masquées.
//
// ⚠️ Pourquoi un cache AU MODULE et pas dans le composant : `PremiumNav`
// est monté par CHAQUE page premium, donc démonté/remonté à chaque
// changement de route. Un état local aurait relancé une sonde (jusqu'à 4 s
// de timeout sur un endpoint mort) à chaque clic de navigation.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  READ_RPC_ENDPOINTS,
  getReadRpcEndpoint,
  getDerniereRotation,
  subscribeRotationsRpc,
  type RotationRpc,
} from '../lib/constants';
import { resumerSante, sonderEndpoint, type SanteRpc, type SondeRpc } from '../lib/rpcHealth';

/** Durée de validité d'une sonde. Assez court pour suivre un incident
 *  pendant une démo, assez long pour ne pas sonder à chaque navigation. */
const TTL_MS = 60_000;

interface EntreeCache {
  url: string;
  sonde: SondeRpc;
  a: number;
}

let cache: EntreeCache | null = null;
let enVol: { url: string; promesse: Promise<SondeRpc> } | null = null;

/**
 * Sonde l'endpoint donné, en réutilisant le résultat récent s'il existe.
 * Deux appels simultanés (deux onglets-montages) partagent la MÊME requête :
 * sonder quatre fois un endpoint mort ferait attendre quatre timeouts.
 */
export async function sonderPrimaire(url: string): Promise<{ sonde: SondeRpc; a: number }> {
  if (cache && cache.url === url && Date.now() - cache.a < TTL_MS) {
    return { sonde: cache.sonde, a: cache.a };
  }
  if (enVol && enVol.url === url) {
    const sonde = await enVol.promesse;
    return { sonde, a: cache?.a ?? Date.now() };
  }

  const promesse = sonderEndpoint(url).then((sonde) => {
    const a = Date.now();
    cache = { url, sonde, a };
    return sonde;
  });
  enVol = { url, promesse };
  try {
    const sonde = await promesse;
    return { sonde, a: cache?.a ?? Date.now() };
  } finally {
    if (enVol?.promesse === promesse) enVol = null;
  }
}

/** Vide le cache — réservé aux tests. */
export function oublierCacheSante(): void {
  cache = null;
  enVol = null;
}

export interface SanteRpcHook {
  sante: SanteRpc;
  /** Une sonde est en cours. */
  enCours: boolean;
  /** Force un nouveau contrôle (bouton « Revérifier »). */
  verifier: () => void;
}

export function useRpcHealth(): SanteRpcHook {
  // L'endpoint principal est une constante de module : figée au chargement,
  // comme les listes qu'elle domine (voir constants.ts).
  const primaire = READ_RPC_ENDPOINTS[0] ?? '';

  const [sonde, setSonde] = useState<SondeRpc | null>(null);
  const [verifieA, setVerifieA] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Le journal vit hors de React : on s'abonne pour être notifié des
  // bascules décidées dans anchor.ts, et on amorce avec ce qui existe déjà
  // (une rotation peut avoir eu lieu avant le montage de ce composant).
  // Prochain endpoint de la liste : il n'est pas encore utilisé (aucune
  // rotation), mais c'est lui qui prendra le relais. Le bandeau le nomme
  // pour dire à l'utilisateur à quoi s'attendre, au lieu de lui laisser
  // croire qu'il ne reste rien.
  const repli = READ_RPC_ENDPOINTS[1] ?? '';
  const [rotation, setRotation] = useState<RotationRpc | null>(() => getDerniereRotation());
  // Force un nouveau rendu pour relire getReadRpcEndpoint() : l'index de
  // rotation est un compteur de module, React ne le voit pas changer.
  const [actif, setActif] = useState<string>(() => getReadRpcEndpoint());

  const verifier = useCallback(() => {
    if (!primaire) {
      setSonde({ verdict: 'endpoint-absent', httpStatus: 0, detail: 'aucun endpoint configuré' });
      setVerifieA(Date.now());
      return;
    }
    setEnCours(true);
    sonderPrimaire(primaire)
      .then(({ sonde: s, a }) => {
        setSonde(s);
        setVerifieA(a);
      })
      .catch(() => {
        // `sonderEndpoint` ne rejette jamais (toute erreur devient un
        // verdict) : ce catch n'existe que pour ne pas laisser le bandeau
        // bloqué sur « Vérification… » si l'imprévu arrive.
        setSonde(null);
        setVerifieA(Date.now());
      })
      .finally(() => setEnCours(false));
  }, [primaire]);

  useEffect(() => {
    verifier();
  }, [verifier]);

  useEffect(
    () =>
      subscribeRotationsRpc((r) => {
        setRotation(r);
        // Relire l'endpoint courant est le but de cette bascule : sans ce
        // setState, `actif` resterait figé sur la valeur du premier rendu.
        setActif(getReadRpcEndpoint());
      }),
    []
  );

  const sante = useMemo(
    () => resumerSante({ sonde, primaire, actif, repli, rotation, verifieA }),
    [sonde, primaire, actif, repli, rotation, verifieA]
  );

  return { sante, enCours, verifier };
}
