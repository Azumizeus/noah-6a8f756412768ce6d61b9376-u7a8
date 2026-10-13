// src/lib/gamification.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — Gamification V1 (XP / rangs / badges / classement).
//
// L'XP est un LEDGER append-only (table xp_events), écrit UNIQUEMENT côté
// serveur dans project-write (action "event"), juste après vérification
// d'une vraie transaction on-chain — jamais depuis ce fichier. Ce module ne
// fait QUE LIRE : agréger l'XP (vue wallet_xp), calculer le rang, et
// calculer les badges à la volée depuis pact_events (lecture publique,
// RLS `pact_events_public_read` / `xp_events_select_public`).
//
// Aucune table dédiée aux badges : les règles peuvent changer sans
// migration, au prix d'un recalcul à chaque lecture — largement
// suffisant au volume de cette V1.
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled, SUPABASE_PROJECT_URL } from './supabaseClient';

/**
 * ── Lectures qui RAPPORTENT l'échec ──────────────────────────────────
 *
 * Toutes les lectures ci-dessous renvoyaient auparavant leur valeur de
 * repli — `0`, `{}`, `[]`, `new Set()` — aussi bien quand la base est
 * injoignable que quand le wallet n'a réellement rien fait. L'écran ne
 * pouvait donc pas faire la différence, et un backend tombé s'affichait
 * comme « 0 XP, aucun badge, aucune quête » : c'est faux, et c'est
 * exactement le mensonge d'interface que `premium-data-reach.test.ts`
 * interdit aux pages premium (le patron avait déjà été corrigé côté
 * annuaire des builders, `listAllProfilesResult`).
 *
 * Le partage est le même qu'ailleurs : la variante `…Result` interroge la
 * base et dit ce qu'elle a obtenu, la variante d'origine délègue et
 * conserve le repli pour ses appelants legacy — aucune logique n'est
 * écrite deux fois, donc les deux ne peuvent pas diverger.
 */
export const GAMIFICATION_OFFLINE = 'gamification:offline';

// ── Rangs ────────────────────────────────────────────────────────────
export interface RankLevel {
  key: string; // clé i18n gamification.rankXxx
  xpThreshold: number;
}

export const RANKS: RankLevel[] = [
  { key: 'rankAnon', xpThreshold: 0 },
  { key: 'rankContributor', xpThreshold: 100 },
  { key: 'rankBuilder', xpThreshold: 400 },
  { key: 'rankShipwright', xpThreshold: 1000 },
  { key: 'rankArchitect', xpThreshold: 2500 },
  { key: 'rankVeteran', xpThreshold: 6000 },
  { key: 'rankLegendary', xpThreshold: 15000 },
];

export interface RankProgress {
  rankKey: string;
  xp: number;
  nextRankKey: string | null;
  xpToNext: number | null; // null si rang maximum atteint
  progressPct: number; // 0-100, position dans la tranche du rang courant
}

/** Calcule le rang + la progression vers le suivant à partir d'un total XP. */
export function computeRank(xp: number): RankProgress {
  let current = RANKS[0];
  let next: RankLevel | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].xpThreshold) {
      current = RANKS[i];
      next = RANKS[i + 1] ?? null;
    }
  }
  const band = next ? next.xpThreshold - current.xpThreshold : 1;
  const into = xp - current.xpThreshold;
  const progressPct = next ? Math.min(100, Math.max(0, Math.round((into / band) * 100))) : 100;
  return {
    rankKey: current.key,
    xp,
    nextRankKey: next?.key ?? null,
    xpToNext: next ? next.xpThreshold - xp : null,
    progressPct,
  };
}

/**
 * Total XP d'un wallet (vue agrégée wallet_xp), en distinguant les deux cas
 * que l'ancienne version confondait : `{ xp: 0 }` — le wallet n'a rien fait,
 * ce qui est une VÉRITÉ — et `{ error }` — la lecture a échoué, on ne sait
 * pas. Afficher 0 dans le second cas ferait passer une base tombée pour un
 * joueur inactif.
 */
export async function fetchWalletXpResult(
  wallet: string
): Promise<{ xp: number } | { error: string }> {
  if (!supabase) return { error: GAMIFICATION_OFFLINE };
  const { data, error } = await supabase
    .from('wallet_xp')
    .select('xp_total')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) return { error: error.message };
  // `maybeSingle` : aucune ligne = aucun XP, pas une panne.
  if (!data) return { xp: 0 };
  return { xp: Number(data.xp_total) || 0 };
}

/** Lit le total XP d'un wallet. 0 si absent/erreur — voir fetchWalletXpResult
 *  pour la variante qui rapporte l'échec. */
export async function fetchWalletXp(wallet: string): Promise<number> {
  const r = await fetchWalletXpResult(wallet);
  return 'xp' in r ? r.xp : 0;
}

// ── Classement ───────────────────────────────────────────────────────
export interface LeaderboardRow {
  wallet: string;
  xp: number;
}

/** Classement global — lecture directe de la vue wallet_xp, déjà triable. */
export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('wallet_xp')
    .select('wallet, xp_total')
    .order('xp_total', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({ wallet: r.wallet as string, xp: Number(r.xp_total) }));
}

/**
 * Classement propre à un pact — pas de vue dédiée (trop peu de lignes par
 * projet pour justifier une vue Postgres), agrégation faite ici côté client
 * sur les xp_events filtrés par project_pda.
 */
export async function fetchPactLeaderboard(
  projectPda: string,
  limit = 50
): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('xp_events')
    .select('wallet, amount')
    .eq('project_pda', projectPda);
  if (error || !data) return [];
  const totals = new Map<string, number>();
  for (const row of data) {
    const w = row.wallet as string;
    totals.set(w, (totals.get(w) ?? 0) + Number(row.amount));
  }
  return Array.from(totals.entries())
    .map(([wallet, xp]) => ({ wallet, xp }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

// ── Badges — calculés à la volée depuis pact_events (lecture publique) ─
export type BadgeId =
  | 'serialFounder'
  | 'whaleBacker'
  | 'loyalBacker'
  | 'trustedApprover'
  | 'speedFinalizer'
  | 'nightOwl'
  | 'firstMover';

/** Ordre d'affichage stable — `Object.keys(BADGE_META)` marcherait mais
 *  laisserait l'ordre à la merci d'un réarrangement de l'objet. */
export const BADGE_ORDER: BadgeId[] = [
  'serialFounder',
  'whaleBacker',
  'loyalBacker',
  'trustedApprover',
  'speedFinalizer',
  'nightOwl',
  'firstMover',
];

export const BADGE_META: Record<BadgeId, { emoji: string; labelKey: string; descKey: string }> = {
  serialFounder: {
    emoji: '🌱',
    labelKey: 'gamification.badgeSerialFounder',
    descKey: 'gamification.badgeSerialFounderDesc',
  },
  whaleBacker: {
    emoji: '🐋',
    labelKey: 'gamification.badgeWhaleBacker',
    descKey: 'gamification.badgeWhaleBackerDesc',
  },
  loyalBacker: {
    emoji: '🔁',
    labelKey: 'gamification.badgeLoyalBacker',
    descKey: 'gamification.badgeLoyalBackerDesc',
  },
  trustedApprover: {
    emoji: '🤝',
    labelKey: 'gamification.badgeTrustedApprover',
    descKey: 'gamification.badgeTrustedApproverDesc',
  },
  speedFinalizer: {
    emoji: '⚡',
    labelKey: 'gamification.badgeSpeedFinalizer',
    descKey: 'gamification.badgeSpeedFinalizerDesc',
  },
  nightOwl: {
    emoji: '🌙',
    labelKey: 'gamification.badgeNightOwl',
    descKey: 'gamification.badgeNightOwlDesc',
  },
  firstMover: {
    emoji: '🎯',
    labelKey: 'gamification.badgeFirstMover',
    descKey: 'gamification.badgeFirstMoverDesc',
  },
};

/** Cible affichée pour la barre de progression d'un badge à seuil numérique.
 *  speedFinalizer/firstMover sont binaires (0 ou 1) — pas de "presque 5/24h". */
export const BADGE_TARGET: Record<BadgeId, number> = {
  serialFounder: 3,
  whaleBacker: 5, // SOL, pas un compte — voir computeBadgeProgressFromEvents
  loyalBacker: 3,
  trustedApprover: 10,
  speedFinalizer: 1,
  nightOwl: 5,
  firstMover: 1,
};

export interface BadgeProgress {
  unlocked: boolean;
  current: number;
  target: number;
}

interface RawEvent {
  kind: string;
  project_pda: string;
  amount_sol: number | null;
  created_at: string;
  actor?: string; // présent uniquement dans le calcul groupé (fetchBadgeRarity)
}

/**
 * Cœur pur des règles de badges — sépare le calcul (testable, réutilisable)
 * de l'accès réseau. Utilisé à la fois pour UN wallet (computeBadgeProgress)
 * et en masse pour TOUS les wallets (fetchBadgeRarity), sans dupliquer les
 * règles à deux endroits qui pourraient diverger.
 *
 * `creatorRank` : rang (0-based) du tout premier événement 'create' de ce
 * wallet parmi TOUS les événements 'create' du protocole, déjà trié par
 * date — évite une requête COUNT séparée par wallet quand on a déjà
 * l'ensemble complet des événements sous la main (cas de fetchBadgeRarity).
 * `undefined` déclenche un calcul via requête réseau (cas mono-wallet).
 */
function computeBadgeProgressFromEvents(
  events: RawEvent[],
  creatorRank?: number
): Record<BadgeId, BadgeProgress> {
  const creates = events.filter((e) => e.kind === 'create');
  const funds = events.filter((e) => e.kind === 'fund');
  const approveProjects = new Set(
    events.filter((e) => e.kind === 'approve').map((e) => e.project_pda)
  );
  const finalizes = events.filter((e) => e.kind === 'finalize');

  const fundsByProject = new Map<string, number>();
  for (const f of funds) {
    fundsByProject.set(f.project_pda, (fundsByProject.get(f.project_pda) ?? 0) + 1);
  }
  const maxFundsOnOneProject = Math.max(0, ...Array.from(fundsByProject.values()));
  const maxSingleFundSol = Math.max(0, ...funds.map((f) => f.amount_sol ?? 0));

  const speedy = finalizes.some((fin) => {
    const create = creates.find((c) => c.project_pda === fin.project_pda);
    if (!create) return false;
    const diffMs = new Date(fin.created_at).getTime() - new Date(create.created_at).getTime();
    return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
  });

  const nightCount = events.filter((e) => {
    const h = new Date(e.created_at).getUTCHours();
    return h >= 0 && h < 5;
  }).length;

  const isFirstMover = creatorRank !== undefined ? creatorRank < 50 : false;

  return {
    serialFounder: { unlocked: creates.length >= 3, current: Math.min(creates.length, 3), target: 3 },
    whaleBacker: {
      unlocked: maxSingleFundSol >= 5,
      current: Math.min(Math.round(maxSingleFundSol * 10) / 10, 5),
      target: 5,
    },
    loyalBacker: {
      unlocked: maxFundsOnOneProject >= 3,
      current: Math.min(maxFundsOnOneProject, 3),
      target: 3,
    },
    trustedApprover: {
      unlocked: approveProjects.size >= 10,
      current: Math.min(approveProjects.size, 10),
      target: 10,
    },
    speedFinalizer: { unlocked: speedy, current: speedy ? 1 : 0, target: 1 },
    nightOwl: { unlocked: nightCount >= 5, current: Math.min(nightCount, 5), target: 5 },
    firstMover: { unlocked: isFirstMover, current: isFirstMover ? 1 : 0, target: 1 },
  };
}

/**
 * Calcule la progression (débloqué + compteur courant/cible) de TOUS les
 * badges d'un wallet. Remplace l'ancien computeBadges() qui ne renvoyait
 * que la liste des débloqués — BadgeShelf V2 affiche aussi les verrouillés
 * en grisé avec leur compteur (ex. "7/10"), ce que la V1 jetait après calcul.
 */
/**
 * Progression de tous les badges d'un wallet, en distinguant « aucun badge »
 * de « pact_events illisible ». Un tableau vide de faits produit exactement
 * le même rendu que « tous les badges verrouillés » : sans cette variante,
 * une base tombée se lirait comme un joueur qui n'a jamais rien fait.
 */
export async function computeBadgeProgressResult(
  wallet: string
): Promise<{ badges: Record<BadgeId, BadgeProgress> } | { error: string }> {
  if (!supabase) return { error: GAMIFICATION_OFFLINE };
  const { data, error } = await supabase
    .from('pact_events')
    .select('kind, project_pda, amount_sol, created_at')
    .eq('actor', wallet);
  if (error) return { error: error.message };
  const events = (data ?? []) as RawEvent[];

  let creatorRank: number | undefined;
  const firstCreate = events
    .filter((e) => e.kind === 'create')
    .reduce<string | null>((min, c) => (min === null || c.created_at < min ? c.created_at : min), null);
  if (firstCreate) {
    const { count } = await supabase
      .from('pact_events')
      .select('actor', { count: 'exact', head: true })
      .eq('kind', 'create')
      .lt('created_at', firstCreate);
    creatorRank = count ?? 0;
  }

  return { badges: computeBadgeProgressFromEvents(events, creatorRank) };
}

export async function computeBadgeProgress(wallet: string): Promise<Record<BadgeId, BadgeProgress>> {
  const r = await computeBadgeProgressResult(wallet);
  return 'badges' in r ? r.badges : computeBadgeProgressFromEvents([], undefined);
}

/** Compat V1 : liste des badges débloqués uniquement. Conservé au cas où
 *  un appelant futur n'a besoin que de ça — BadgeShelf est passé à
 *  computeBadgeProgress() pour l'affichage grisé/compteur. */
export async function computeBadges(wallet: string): Promise<BadgeId[]> {
  const progress = await computeBadgeProgress(wallet);
  return BADGE_ORDER.filter((id) => progress[id].unlocked);
}

/**
 * Rareté de chaque badge = % de wallets actifs (ayant au moins un
 * pact_event) qui l'ont débloqué. Calculée en UNE lecture de pact_events
 * (49 lignes à ce stade du projet — largement dans le budget d'un fetch
 * client unique) plutôt qu'une requête par wallet : on regroupe par
 * `actor`, on rejoue les mêmes règles que computeBadgeProgressFromEvents
 * pour chacun, en mémoire, sans aller-retour réseau supplémentaire — y
 * compris pour firstMover, dont le rang se déduit directement du tri des
 * 'create' déjà en main.
 */
export async function fetchBadgeRarity(): Promise<Record<BadgeId, number>> {
  const zero = BADGE_ORDER.reduce((acc, id) => ({ ...acc, [id]: 0 }), {} as Record<BadgeId, number>);
  if (!supabase) return zero;
  const { data, error } = await supabase
    .from('pact_events')
    .select('kind, project_pda, amount_sol, created_at, actor');
  if (error || !data || data.length === 0) return zero;
  const all = data as Required<RawEvent>[];

  const byWallet = new Map<string, RawEvent[]>();
  for (const e of all) {
    const list = byWallet.get(e.actor) ?? [];
    list.push(e);
    byWallet.set(e.actor, list);
  }

  // Rang de création de CHAQUE wallet — tri global des 'create' une seule
  // fois, puis premier index par wallet, au lieu d'une requête par wallet.
  const createsSorted = all
    .filter((e) => e.kind === 'create')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const firstCreateRank = new Map<string, number>();
  createsSorted.forEach((e, i) => {
    if (!firstCreateRank.has(e.actor)) firstCreateRank.set(e.actor, i);
  });

  const totalWallets = byWallet.size;
  if (totalWallets === 0) return zero;

  const holders: Record<BadgeId, number> = { ...zero };
  for (const [wallet, events] of byWallet) {
    const progress = computeBadgeProgressFromEvents(events, firstCreateRank.get(wallet));
    for (const id of BADGE_ORDER) {
      if (progress[id].unlocked) holders[id] += 1;
    }
  }

  const pct: Record<BadgeId, number> = { ...zero };
  for (const id of BADGE_ORDER) {
    pct[id] = Math.round((holders[id] / totalWallets) * 100);
  }
  return pct;
}

// ── Quêtes hebdomadaires ─────────────────────────────────────────────
// Pas de table dédiée : la "semaine en cours" est calculée à la volée
// (lundi 00:00 local → maintenant) et le progrès vient directement de
// pact_events. Rejouer la page ne perd rien, changer les cibles ne
// demande aucune migration.
export interface QuestProgress {
  fund: { done: number; target: number };
  approve: { done: number; target: number };
  finalize: { done: number; target: number };
}

/**
 * Lundi 00:00 **UTC** de la semaine en cours, au format ISO complet.
 *
 * ⚠️ Cette fonction calculait la semaine en heure LOCALE du navigateur
 * (`getDay()`, `setHours()`). L'Edge Function `quest-write` — qui revérifie
 * la complétion avant de créditer l'XP — raisonne, elle, en UTC strict
 * (`currentWeekStartUtc`). Les deux bornes divergeaient donc de plusieurs
 * heures : un joueur en UTC+2 voyait sa quête passer « terminée » le lundi
 * à 2 h du matin locale alors que le serveur était encore en semaine
 * précédente, et la réclamation repartait en « Quête pas encore terminée »
 * sans explication compréhensible. Aligné sur UTC pour que les deux côtés
 * découpent la semaine au même instant.
 */
function startOfWeekIso(): string {
  return `${startOfWeekUtcDateStr()}T00:00:00.000Z`;
}

/**
 * Progression des 3 quêtes de la semaine — variante qui rapporte l'échec.
 * `{ progress: … done: 0 }` est un vrai « rien fait cette semaine » ;
 * `{ error }` est « je n'ai pas pu lire ». L'écran doit pouvoir le dire,
 * sinon une base tombée s'affiche comme une semaine vierge.
 */
export async function fetchWeeklyQuestProgressResult(
  wallet: string
): Promise<{ progress: QuestProgress } | { error: string }> {
  const empty: QuestProgress = {
    fund: { done: 0, target: 2 },
    approve: { done: 0, target: 1 },
    finalize: { done: 0, target: 1 },
  };
  if (!supabase) return { error: GAMIFICATION_OFFLINE };
  const since = startOfWeekIso();
  const { data, error } = await supabase
    .from('pact_events')
    .select('kind, project_pda')
    .eq('actor', wallet)
    .gte('created_at', since);
  if (error) return { error: error.message };
  const rows = data ?? [];

  const fundedProjects = new Set(
    rows.filter((e) => e.kind === 'fund').map((e) => e.project_pda as string)
  );
  const approveCount = rows.filter((e) => e.kind === 'approve').length;
  const finalizeCount = rows.filter((e) => e.kind === 'finalize').length;

  return {
    progress: {
      fund: { done: Math.min(fundedProjects.size, empty.fund.target), target: empty.fund.target },
      approve: {
        done: Math.min(approveCount, empty.approve.target),
        target: empty.approve.target,
      },
      finalize: {
        done: Math.min(finalizeCount, empty.finalize.target),
        target: empty.finalize.target,
      },
    },
  };
}

export async function fetchWeeklyQuestProgress(wallet: string): Promise<QuestProgress> {
  const r = await fetchWeeklyQuestProgressResult(wallet);
  return 'progress' in r
    ? r.progress
    : {
        fund: { done: 0, target: 2 },
        approve: { done: 0, target: 1 },
        finalize: { done: 0, target: 1 },
      };
}

// ═══════════════════════════════════════════════════════════════════
// Quêtes V2 — réclamation manuelle, série hebdomadaire, historique
// ═══════════════════════════════════════════════════════════════════
// Différence de fond avec la V1 : terminer une quête ne crédite plus
// l'XP automatiquement. Il faut CLIQUER pour réclamer, et le clic fait
// signer un message au wallet. Le geste délibéré (clic + popup wallet)
// EST la mécanique d'habitude recherchée — une récompense encaissée
// passivement ne crée aucun rendez-vous.
//
// Tout passe par la table `quest_claims` : une ligne par réclamation
// (wallet, week_start, quest_key, xp_awarded, claimed_at), clé primaire
// composite sur les 3 premières colonnes. Cette clé composite EST la
// garantie anti-doublon — `quest-write` s'appuie sur le code d'erreur
// Postgres 23505 pour distinguer « déjà réclamé » d'un vrai échec.
// Lecture publique (policy `quest_claims_public_read`), écriture
// impossible depuis le navigateur : seule l'Edge Function, en
// service_role, insère — sinon n'importe qui s'auto-créditerait l'XP.

export type QuestKey = 'fund' | 'approve' | 'finalize';

/** Les 3 quêtes de base. `bonus` en est volontairement absent : ce n'est
 *  pas une quête réclamable, c'est une ligne posée par le serveur quand
 *  les 3 autres sont acquises. */
export const QUEST_KEYS: QuestKey[] = ['fund', 'approve', 'finalize'];

/** XP par quête — miroir EXACT de `QUEST_XP` dans quest-write/index.ts.
 *  Sert uniquement à afficher la récompense AVANT réclamation ; le montant
 *  réellement crédité est celui du serveur, jamais celui-ci.
 *
 *  Nommé `QUEST_CLAIM_XP` côté client (et non `QUEST_XP` comme côté
 *  serveur) pour que la lecture d'un composant dise explicitement « XP
 *  obtenu en réclamant », par opposition à l'XP passif de la V1. */
export const QUEST_CLAIM_XP: Record<QuestKey, number> = { fund: 40, approve: 30, finalize: 60 };

/** Bonus versé quand les 3 quêtes d'une même semaine sont réclamées.
 *  Miroir de `COMPLETION_BONUS_XP` dans quest-write/index.ts. */
export const QUEST_BONUS_XP = 150;

/**
 * Lundi 00:00 UTC de la semaine contenant `d`, au format `YYYY-MM-DD` —
 * exactement la valeur stockée dans `quest_claims.week_start` (type `date`)
 * et recalculée côté serveur par `currentWeekStartUtc()`. Toute la
 * mécanique de semaine repose sur cette fonction : la modifier sans
 * modifier son jumeau serveur casserait silencieusement les réclamations.
 */
export function startOfWeekUtcDateStr(d: Date = new Date()): string {
  const day = d.getUTCDay(); // 0 = dimanche
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday)
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Quêtes déjà réclamées cette semaine par ce wallet — ce qui permet au
 * journal d'afficher « Réclamé ✓ » plutôt qu'un bouton qui échouerait en
 * 23505. Inclut `'bonus'` s'il a été versé.
 */
/**
 * Quêtes déjà réclamées cette semaine par ce wallet, en distinguant « rien de
 * réclamé » de « quest_claims illisible ». Le repli `new Set()` faisait
 * afficher des boutons « Réclamer » sur des quêtes déjà payées : au mieux un
 * aller-retour pour rien, au pire le joueur croit avoir perdu sa récompense.
 */
export async function fetchClaimedThisWeekResult(
  wallet: string
): Promise<{ claimed: Set<QuestKey | 'bonus'> } | { error: string }> {
  if (!supabase) return { error: GAMIFICATION_OFFLINE };
  const { data, error } = await supabase
    .from('quest_claims')
    .select('quest_key')
    .eq('wallet', wallet)
    .eq('week_start', startOfWeekUtcDateStr());
  if (error) return { error: error.message };
  return { claimed: new Set((data ?? []).map((r) => r.quest_key as QuestKey | 'bonus')) };
}

/**
 * Variante historique : Set VIDE en cas d'échec. Un `Set` vide reste
 * distinguable de `null`, qui sert d'état « pas encore chargé » — les
 * appelants legacy continuent de fonctionner à l'identique.
 */
export async function fetchClaimedThisWeek(
  wallet: string
): Promise<Set<QuestKey | 'bonus'>> {
  const r = await fetchClaimedThisWeekResult(wallet);
  return 'claimed' in r ? r.claimed : new Set();
}

// ── Chronique du wallet ──────────────────────────────────────────────
// Le fil brut de ce qu'un wallet a réellement fait on-chain, toutes
// semaines confondues — à ne pas confondre avec `fetchQuestHistory`, qui
// lit `quest_claims` (ce qui a été RÉCLAMÉ). Ici on lit `pact_events`
// (ce qui a été FAIT), déjà peuplé par project-write après vérification
// d'une vraie transaction.
export interface ChronicleEntry {
  kind: string; // create | approve | fund | finalize | distribute | add_member
  projectPda: string;
  amountSol: number | null; // null pour les actions sans montant
  createdAt: string; // ISO
}

/**
 * Chronique d'un wallet (ce qu'il a FAIT on-chain), variante qui rapporte
 * l'échec. Une chronique vide et une lecture en panne produisaient le même
 * écran « Aucun événement » : le second cas doit se dire.
 */
export async function fetchWalletChronicleResult(
  wallet: string,
  limit = 30
): Promise<{ entries: ChronicleEntry[] } | { error: string }> {
  if (!supabase) return { error: GAMIFICATION_OFFLINE };
  const { data, error } = await supabase
    .from('pact_events')
    .select('kind, project_pda, amount_sol, created_at')
    .eq('actor', wallet)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  return {
    entries: (data ?? []).map((r) => ({
      kind: r.kind as string,
      projectPda: r.project_pda as string,
      // `amount_sol` est nullable en base : un `approve` n'a pas de montant.
      // On préserve le null tel quel plutôt que de le replier sur 0, sinon
      // l'UI afficherait « 0.00 SOL » sur des actions qui n'en portent pas.
      amountSol: r.amount_sol === null ? null : Number(r.amount_sol),
      createdAt: r.created_at as string,
    })),
  };
}

export async function fetchWalletChronicle(
  wallet: string,
  limit = 30
): Promise<ChronicleEntry[]> {
  const r = await fetchWalletChronicleResult(wallet, limit);
  return 'entries' in r ? r.entries : [];
}

/**
 * Série de semaines COMPLÈTES consécutives (les 3 quêtes réclamées).
 *
 * Le décompte ignore délibérément la semaine en cours : une série ne se
 * compte qu'une fois la semaine acquise, sinon le chiffre monterait puis
 * redescendrait selon l'avancement du lundi — un compteur qui recule est
 * la meilleure façon de casser l'habitude qu'il est censé entretenir.
 */
export async function fetchQuestStreak(wallet: string): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('quest_claims')
    .select('week_start, quest_key')
    .eq('wallet', wallet);
  if (error || !data || data.length === 0) return 0;

  // Regroupe par semaine, puis ne garde que celles où les 3 quêtes de base
  // sont présentes. On ne se fie PAS à la seule ligne 'bonus' : elle peut
  // manquer si son insertion a échoué après coup (quest-write ne la
  // considère pas comme bloquante et se contente de logger).
  const keysByWeek = new Map<string, Set<string>>();
  for (const row of data) {
    const week = row.week_start as string;
    const set = keysByWeek.get(week) ?? new Set<string>();
    set.add(row.quest_key as string);
    keysByWeek.set(week, set);
  }
  const completeWeeks = Array.from(keysByWeek.entries())
    .filter(([, keys]) => QUEST_KEYS.every((k) => keys.has(k)))
    .map(([week]) => week)
    .sort((a, b) => b.localeCompare(a)); // plus récente d'abord
  if (completeWeeks.length === 0) return 0;

  const currentWeek = startOfWeekUtcDateStr();
  // Point de départ du décompte : la semaine complète la plus récente qui
  // n'est PAS la semaine en cours (sinon un streak "en cours de semaine"
  // se compterait avant d'être vraiment acquis).
  // `const` et non `let` comme dans la source collée : le curseur n'est
  // jamais réassigné (la boucle avance via `i`), et `prefer-const` le
  // rejetait en erreur de lint. Comportement strictement identique.
  const cursor = completeWeeks[0] === currentWeek ? 1 : 0;
  if (cursor >= completeWeeks.length) return 0;

  let streak = 1;
  let cursorDate = new Date(`${completeWeeks[cursor]}T00:00:00.000Z`);
  for (let i = cursor + 1; i < completeWeeks.length; i++) {
    const prevWeek = new Date(cursorDate);
    prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
    if (completeWeeks[i] === prevWeek.toISOString().slice(0, 10)) {
      streak += 1;
      cursorDate = prevWeek;
    } else {
      break;
    }
  }
  return streak;
}

// ── Historique des semaines passées (29/08, soir — "un vrai historique
// visuel des semaines passées", demande explicite après refonte du
// journal) ──────────────────────────────────────────────────────────
// Aucune nouvelle table : `quest_claims` (lecture publique, policy
// `quest_claims_public_read`) contient déjà une ligne par réclamation
// (wallet, week_start, quest_key, xp_awarded, claimed_at) — exactement
// ce qu'il faut pour reconstituer semaine par semaine ce qui a été
// réclamé, sans rien recalculer côté serveur.
export interface QuestWeekHistory {
  weekStart: string; // YYYY-MM-DD, lundi UTC
  claimedKeys: Array<QuestKey | 'bonus'>;
  xpTotal: number;
}

/**
 * Semaines passées (ce qui a été RÉCLAMÉ), variante qui rapporte l'échec.
 * Un historique vide et un `quest_claims` injoignable s'affichaient tous deux
 * « Rien pour l'instant » — le second décourage un joueur qui avait bien
 * réclamé sa semaine.
 */
export async function fetchQuestHistoryResult(
  wallet: string,
  weeksLimit = 8
): Promise<{ weeks: QuestWeekHistory[] } | { error: string }> {
  if (!supabase) return { error: GAMIFICATION_OFFLINE };
  const { data, error } = await supabase
    .from('quest_claims')
    .select('week_start, quest_key, xp_awarded')
    .eq('wallet', wallet)
    .order('week_start', { ascending: false });
  if (error) return { error: error.message };
  const rows = data ?? [];
  if (rows.length === 0) return { weeks: [] };

  const byWeek = new Map<string, QuestWeekHistory>();
  for (const row of rows) {
    const week = row.week_start as string;
    const entry = byWeek.get(week) ?? { weekStart: week, claimedKeys: [], xpTotal: 0 };
    entry.claimedKeys.push(row.quest_key as QuestKey | 'bonus');
    entry.xpTotal += Number(row.xp_awarded ?? 0);
    byWeek.set(week, entry);
  }
  return {
    weeks: Array.from(byWeek.values())
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, weeksLimit),
  };
}

export async function fetchQuestHistory(wallet: string, weeksLimit = 8): Promise<QuestWeekHistory[]> {
  const r = await fetchQuestHistoryResult(wallet, weeksLimit);
  return 'weeks' in r ? r.weeks : [];
}

const QUEST_WRITE_URL = SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/functions/v1/quest-write` : '';

export interface ClaimQuestResult {
  ok: boolean;
  error?: string;
  xpAwarded?: number;
  bonusAwarded?: boolean;
  alreadyClaimed?: boolean;
}

/**
 * Réclame la récompense d'une quête hebdomadaire terminée. Fait signer un
 * message au wallet (le geste de clic + popup wallet EST la mécanique
 * d'habitude recherchée, voir GAMIFICATION_PLAN.md V2), envoie signature +
 * message à quest-write, qui revérifie la complétion réelle côté serveur
 * avant de créditer l'XP — jamais sur la seule foi du client.
 */
export async function claimQuestReward(
  wallet: string,
  questKey: QuestKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<ClaimQuestResult> {
  if (!isRemoteEnabled || !QUEST_WRITE_URL) {
    return { ok: false, error: 'Service indisponible.' };
  }
  const week = startOfWeekUtcDateStr();
  const timestamp = Date.now();
  // ⚠️ Ce texte est reproduit AU CARACTÈRE PRÈS par la regex ancrée
  // CLAIM_RE dans quest-write/index.ts. Accents compris : « réclamation de
  // quête » et « Quête: » ont déjà cassé toutes les réclamations une fois
  // parce que la regex serveur était écrite sans accents. Toute retouche
  // ici doit être répercutée là-bas dans le même commit.
  const message = `BuildPact — réclamation de quête\nWallet: ${wallet}\nQuête: ${questKey}\nSemaine: ${week}\nTimestamp: ${timestamp}`;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signMessage(new TextEncoder().encode(message));
    // `unknown` et non `any` comme dans la source collée (règle de lint
    // no-explicit-any) — même lecture défensive du message derrière.
  } catch (e: unknown) {
    const msg: string = (e as { message?: string } | null)?.message ?? '';
    if (msg.toLowerCase().includes('user rejected')) {
      return { ok: false, error: 'Signature refusée.' };
    }
    return { ok: false, error: 'Ce wallet ne supporte pas la signature de message.' };
  }

  try {
    const res = await fetch(QUEST_WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questKey, message, signature: Array.from(signatureBytes) }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error ?? 'Échec de la réclamation.' };
    return { ok: true, xpAwarded: json?.xpAwarded, bonusAwarded: json?.bonusAwarded, alreadyClaimed: json?.alreadyClaimed };
  } catch {
    return { ok: false, error: 'Réseau injoignable — réessaie.' };
  }
}
