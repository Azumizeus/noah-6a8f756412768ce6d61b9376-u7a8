// src/lib/tournage.ts
// ═══════════════════════════════════════════════════════════════════
// Mode tournage — `#/demo?tournage=1`.
//
// Ce que le mode change, et rien d'autre :
//   • la page de démo démarre le rejeu toute seule au chargement ;
//   • le bandeau de santé RPC est masqué (il parle d'infrastructure, la
//     vidéo parle du produit — et un bandeau qui apparaît en pleine prise
//     redemande une nouvelle prise).
//
// ── Rythme du rejeu (`?pas=`, en SECONDES) ──────────────────────────
// Deuxième réglage du même genre, et il vit dans l'URL pour la même raison :
// une prise enregistrée à 2,4 s/étape se rejoue et se reprend à l'identique
// depuis un lien, sans rien régler à la main. Il porte sur le rejeu lui-même
// (pas seulement sur le mode tournage) : la lecture automatique manuelle en
// bénéficie aussi.
//
// Toute valeur absente, illisible ou hors bornes retombe sur la durée par
// défaut — même doctrine que `lireModeTournage` : on ne devine pas un
// réglage. La page AFFICHE la durée effective (`demo.tournageOn`), donc une
// valeur refusée se voit à l'écran au lieu d'être silencieuse.
//
// ── Cadrage (1000 px, voir echelleCadrage) ──────────────────────────
// Le mode tournage fixe le CADRE (1000 × 1000 px) et non la mise en page :
// le contenu garde exactement la disposition compacte validée à l'écran, et
// c'est le rendu qui est mis à l'échelle pour tenir dans la fenêtre. Deux
// prises sur deux machines différentes montrent donc la même page.
//
// Pourquoi un module PUR (aucun import) : c'est ce qui permet de le tester
// hors navigateur, comme lib/rpcMask.ts et lib/demoScenario.ts. Le jour où
// le paramètre de hash change de forme, le test le dit sans qu'on ait à
// lancer l'app.
//
// Pourquoi un petit STORE en plus du hash : changer le hash ne re-rend pas
// forcément les composants montés (useHashRoute compare des chemins, et
// `#/demo` → `#/demo?tournage=1` garde le même chemin). Sans ce store, le
// bandeau resterait affiché au moment précis où on veut le masquer. Le hash
// reste la source de vérité au CHARGEMENT (lien partagé, rechargement) ;
// le store prend le relais en cours de session.
// ═══════════════════════════════════════════════════════════════════

/** Nom du paramètre. Exposé pour que les liens partagés ne l'écrivent pas en dur. */
export const PARAM_TOURNAGE = 'tournage';

/** Valeurs acceptées comme « vrai » (une valeur vide compte : `?tournage`). */
const VRAI = new Set(['', '1', 'true', 'on', 'oui', 'yes']);

/** Paramètres du hash, sans le `#`. */
function parametres(hash: string): URLSearchParams {
  const brut = hash.replace(/^#/, '');
  const i = brut.indexOf('?');
  return new URLSearchParams(i === -1 ? '' : brut.slice(i + 1));
}

/**
 * Lit `?tournage=` dans un hash. Toute valeur non reconnue vaut FAUX : un
 * mode tournage activé par accident masquerait un incident RPC réel, ce qui
 * est exactement le problème que le bandeau existe pour éviter.
 */
export function lireModeTournage(hash: string): boolean {
  const valeur = parametres(hash).get(PARAM_TOURNAGE);
  if (valeur === null) return false;
  return VRAI.has(valeur.trim().toLowerCase());
}

/**
 * Réécrit un hash avec (ou sans) le paramètre, en préservant le chemin et
 * les autres paramètres — `#/demo?mine=1` doit rester `?mine=1`.
 */
export function hashAvecModeTournage(hash: string, actif: boolean): string {
  const brut = hash.replace(/^#/, '') || '/';
  const i = brut.indexOf('?');
  const chemin = i === -1 ? brut : brut.slice(0, i);
  const params = parametres(hash);
  if (actif) params.set(PARAM_TOURNAGE, '1');
  else params.delete(PARAM_TOURNAGE);
  const requete = params.toString();
  return `#${chemin}${requete ? `?${requete}` : ''}`;
}

// ─── Cadrage de tournage ────────────────────────────────────────────

/**
 * Côté du cadre de tournage, en pixels CSS. CARRÉ (1000 × 1000) : c'est la
 * forme qui tient à l'écran et dans un montage vidéo sans bandes noires
 * inégales, et le contenu de la page (participants, vault, étape, paiements,
 * chronologie) a été mesuré pour tenir dans cette hauteur.
 */
export const CADRAGE_PX = 1000;

/** Marge laissée à la fenêtre au-dessus du cadre (barres, arrondis). */
export const CADRAGE_MARGE_PX = 8;

/**
 * Échelle minimale du cadre. En dessous, le texte de 12,5 px descendrait
 * sous ~9 px équivalents : le rejeu ne serait plus lisible, donc plus
 * filmable. On plafonne et on laisse le défilement revenir plutôt que de
 * rendre une vidéo illisible.
 */
export const ECHELLE_CADRAGE_MIN = 0.7;

/**
 * Échelle à appliquer au cadre pour qu'il tienne dans la fenêtre.
 *
 * Pourquoi une échelle et pas un simple plafond de largeur : le contenu de
 * la page tient dans 1000 px de haut (mesuré), mais une fenêtre d'ordinateur
 * portable n'en fait que 700 à 900. Sans échelle, « la répartition est
 * visible sans défiler » ne serait vrai que sur un grand écran — et faux
 * exactement sur le poste qui sert à tourner. Le cadre garde donc sa taille
 * logique (1000 px, mise en page identique d'une machine à l'autre) et c'est
 * le RENDU qui s'adapte.
 *
 * FONCTION PURE : bornes et cas dégénérés testés sans navigateur.
 *
 * @param hauteurFenetre hauteur utile de la fenêtre, en pixels CSS
 * @param hauteurCadre  côté du cadre (défaut : CADRAGE_PX)
 * @returns un facteur dans [ECHELLE_CADRAGE_MIN, 1] — jamais 0, jamais > 1
 */
export function echelleCadrage(
  hauteurFenetre: number,
  hauteurCadre: number = CADRAGE_PX,
  margePx: number = CADRAGE_MARGE_PX
): number {
  if (!Number.isFinite(hauteurFenetre) || hauteurFenetre <= 0) return 1;
  if (!Number.isFinite(hauteurCadre) || hauteurCadre <= 0) return 1;
  const utile = hauteurFenetre - margePx;
  return Math.max(ECHELLE_CADRAGE_MIN, Math.min(1, utile / hauteurCadre));
}

// ─── Rythme du rejeu ────────────────────────────────────────────────

/** Nom du paramètre de rythme. Valeur en SECONDES (décimales acceptées). */
export const PARAM_PAS = 'pas';

/** Durée d'affichage d'une étape par défaut, en millisecondes. */
export const DELAI_MS_DEFAUT = 2400;

/**
 * Bornes du rythme. Volontairement larges (0,4 s → 30 s) : en deçà on ne
 * lit plus l'étape à l'écran, au-delà la prise dépasse le temps imparti de
 * la vidéo. Hors bornes, on retombe sur le défaut plutôt que de rogner en
 * silence : un réglage refusé doit être VISIBLE (la page affiche le rythme
 * effectif), pas appliqué à moitié.
 */
export const DELAI_MS_MIN = 400;
export const DELAI_MS_MAX = 30_000;

/**
 * Lit `?pas=` dans un hash et rend la durée en millisecondes.
 *
 * L'unité du paramètre est la SECONDE (`?pas=3`, `?pas=2.4`) : c'est l'unité
 * dans laquelle on parle d'un rythme de vidéo, et une durée en millisecondes
 * écrite à la main (`2400`) se confond trop facilement avec des secondes.
 * La virgule décimale est acceptée en plus du point : `?pas=2,4` est ce
 * qu'on tape avec un clavier français.
 */
export function lireDelaiEtape(hash: string): number {
  const brut = parametres(hash).get(PARAM_PAS);
  if (brut === null) return DELAI_MS_DEFAUT;
  const secondes = Number(brut.trim().replace(',', '.'));
  if (!Number.isFinite(secondes)) return DELAI_MS_DEFAUT;
  const ms = Math.round(secondes * 1000);
  if (ms < DELAI_MS_MIN || ms > DELAI_MS_MAX) return DELAI_MS_DEFAUT;
  return ms;
}

/**
 * Réécrit un hash avec `?pas=` (en secondes, sans zéros inutiles) — même
 * règle que `hashAvecModeTournage` : chemin et autres paramètres préservés.
 */
export function hashAvecDelaiEtape(hash: string, ms: number): string {
  const brut = hash.replace(/^#/, '') || '/';
  const i = brut.indexOf('?');
  const chemin = i === -1 ? brut : brut.slice(0, i);
  const params = parametres(hash);
  params.set(PARAM_PAS, String(ms / 1000));
  const requete = params.toString();
  return `#${chemin}${requete ? `?${requete}` : ''}`;
}

// ─── Store minimal ──────────────────────────────────────────────────
// Un booléen + des abonnés. Aucune dépendance : c'est ce qui lui permet
// d'être lu par le bandeau (shell premium ET legacy) et la page de démo
// sans que l'un dépende de l'autre.

let actif = false;
const abonnes = new Set<(valeur: boolean) => void>();

/** État courant du mode tournage. */
export function modeTournageActif(): boolean {
  return actif;
}

/** Fixe l'état et notifie. Sans changement, ne notifie pas (pas de boucle). */
export function setModeTournage(valeur: boolean): void {
  if (valeur === actif) return;
  actif = valeur;
  for (const cb of abonnes) cb(actif);
}

/** S'abonne ; rend la fonction de désabonnement. */
export function subscribeModeTournage(cb: (valeur: boolean) => void): () => void {
  abonnes.add(cb);
  return () => {
    abonnes.delete(cb);
  };
}

/** Remet le store à zéro — réservé aux tests. */
export function oublierModeTournage(): void {
  actif = false;
  abonnes.clear();
}
