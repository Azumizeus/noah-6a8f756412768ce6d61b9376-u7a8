// src/lib/translation.ts
// ═══════════════════════════════════════════════════════════════════
// Traduction à la volée pour chat / contact / network — voir
// supabase/functions/translate/index.ts pour le chemin par défaut (DeepL,
// aucune config utilisateur requise) et translation_cache pour le cache
// serveur qui évite de repayer un texte déjà traduit.
//
// La traduction a lieu côté LECTEUR : chaque composant appelle
// translateMessage() au RENDU d'un message déjà en base, jamais à
// l'envoi. L'original n'est jamais modifié ni remplacé — ni en base, ni
// à l'écran (voir le lien "Voir l'original" de TranslatedMessage).
//
// Deux chemins, comme l'assistant Nexus :
//  - Par défaut : POST vers l'Edge Function `translate` (clé DeepL du
//    projet, jamais exposée au client).
//  - BYOK : si l'utilisateur a renseigné sa propre clé (OpenAI ou
//    Anthropic — DeepL exclu, pas de CORS depuis un navigateur), on
//    appelle SON fournisseur directement depuis le navigateur — sa clé
//    n'atteint jamais nos serveurs.
// ═══════════════════════════════════════════════════════════════════
import { SUPABASE_PROJECT_URL, isRemoteEnabled } from './supabaseClient';
import type { Lang } from './i18n/types';

const TRANSLATE_URL = SUPABASE_PROJECT_URL
  ? `${SUPABASE_PROJECT_URL}/functions/v1/translate`
  : null;
export const translationEnabled = isRemoteEnabled && !!TRANSLATE_URL;

export interface TranslateResult {
  translatedText: string;
  detectedSourceLang?: string;
  cached: boolean;
}

/**
 * Traduit `text` vers `targetLang` via le service par défaut (DeepL, côté
 * serveur). `wallet` est optionnel (un visiteur non connecté peut quand
 * même lire le Network traduit) — sert au rate-limit côté serveur, avec
 * repli sur l'IP en son absence. Ne lève jamais.
 */
export async function translateDefault(
  text: string,
  targetLang: Lang,
  wallet?: string | null
): Promise<TranslateResult | { error: string }> {
  if (!TRANSLATE_URL) return { error: 'Service de traduction non configuré.' };
  if (!text.trim()) return { translatedText: text, cached: true };

  try {
    const res = await fetch(TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang, wallet: wallet ?? undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: (json.error as string) ?? `Erreur ${res.status}.` };
    return json as TranslateResult;
  } catch {
    return { error: 'Réseau indisponible — traduction impossible pour le moment.' };
  }
}

// ── Diagnostic du chemin par défaut ────────────────────────────────────
// translateDefault() aplatit tout échec en `{ error: string }` : c'est le
// bon comportement au rendu d'un message (le lecteur n'a rien à faire du
// code HTTP), mais ça rend le service indiagnosticable depuis l'app. Les
// trois pannes possibles — fonction non déployée, secret DEEPL_API_KEY
// absent, fonction déployée AVEC vérification de JWT — produisent la même
// phrase à l'écran alors qu'elles demandent trois gestes différents côté
// projet. D'où cette seconde voie d'appel qui, elle, conserve le statut.
//
// Volontairement séparée de translateMessage : pas de mémo, pas de repli
// BYOK, pas de silence. Elle ne sert qu'au panneau de réglages.

export type TranslationHealth =
  | 'ok' // 200 — traduction revenue, tout marche
  | 'quota' // 429 — plafond atteint : déployée ET clé valide
  | 'key-missing' // 503 — DEEPL_API_KEY absent des secrets Supabase
  | 'not-deployed' // 404 — la fonction n'existe pas sur le projet
  | 'auth-blocked' // 401/403 — déployée sans --no-verify-jwt
  | 'upstream' // 502 — DeepL refuse (clé invalide, plan expiré)
  | 'unreachable' // fetch rejeté — réseau coupé, ou CORS
  | 'disabled' // pas d'URL Supabase dans le build
  | 'unknown'; // statut non prévu

export interface TranslationDiagnosis {
  health: TranslationHealth;
  /** Code HTTP quand il y en a un — affiché tel quel pour que le retour
   *  utilisateur soit exploitable sans avoir à rouvrir la console. */
  status?: number;
  /** Message d'erreur renvoyé par la fonction, s'il y en a un. */
  detail?: string;
}

// Texte sonde volontairement minuscule et FIXE : le cache serveur
// (translation_cache, clé = hash du texte + langue) fait que seul le tout
// premier test de l'historique du projet atteint DeepL. Tous les suivants
// sont servis par la base et ne consomment ni quota ni caractères — un
// bouton de diagnostic ne doit pas pouvoir coûter le quota mensuel.
const PROBE_TEXT = 'ping';

export async function diagnoseTranslation(): Promise<TranslationDiagnosis> {
  if (!TRANSLATE_URL) return { health: 'disabled' };

  let res: Response;
  try {
    res = await fetch(TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: PROBE_TEXT, targetLang: 'en' }),
    });
  } catch {
    // Un échec de préflight CORS arrive ici sous la même forme qu'une
    // coupure réseau : le navigateur ne donne aucun moyen de les
    // distinguer depuis JS. Le libellé doit donc couvrir les deux.
    return { health: 'unreachable' };
  }

  const json = (await res.json().catch(() => ({}))) as { error?: string };
  const detail = typeof json.error === 'string' ? json.error : undefined;

  if (res.ok) return { health: 'ok', status: res.status };

  const byStatus: Partial<Record<number, TranslationHealth>> = {
    401: 'auth-blocked',
    403: 'auth-blocked',
    404: 'not-deployed',
    429: 'quota',
    502: 'upstream',
    503: 'key-missing',
  };

  return { health: byStatus[res.status] ?? 'unknown', status: res.status, detail };
}

// ── BYOK (clé personnelle de l'utilisateur) ────────────────────────────
// DeepL est volontairement absent de cette liste : son API ne renvoie pas
// d'en-têtes CORS, un fetch direct depuis le navigateur échoue toujours.
// Le seul chemin DeepL possible est l'Edge Function.
export type TranslationProvider = 'openai' | 'anthropic';

export interface TranslationByokConfig {
  provider: TranslationProvider;
  apiKey: string;
}

const BYOK_KEY = 'buildpact_translation_byok';

export function loadTranslationByok(): TranslationByokConfig | null {
  try {
    const raw = localStorage.getItem(BYOK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.provider && parsed?.apiKey) return parsed as TranslationByokConfig;
    return null;
  } catch {
    return null;
  }
}

export function saveTranslationByok(config: TranslationByokConfig | null): void {
  try {
    if (config) localStorage.setItem(BYOK_KEY, JSON.stringify(config));
    else localStorage.removeItem(BYOK_KEY);
  } catch {
    /* non bloquant */
  }
}

const LANG_NAME: Record<Lang, string> = { fr: 'French', en: 'English' };

export async function translateWithByok(
  text: string,
  targetLang: Lang,
  config: TranslationByokConfig
): Promise<TranslateResult | { error: string }> {
  if (!text.trim()) return { translatedText: text, cached: false };
  try {
    if (config.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Translate the user's message to ${LANG_NAME[targetLang]}. Reply with ONLY the translation, no quotes, no explanation. If the message is already in ${LANG_NAME[targetLang]}, reply with it unchanged.`,
            },
            { role: 'user', content: text },
          ],
          temperature: 0,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: json?.error?.message ?? `Erreur OpenAI ${res.status}.` };
      const translated = json?.choices?.[0]?.message?.content?.trim();
      if (!translated) return { error: 'Réponse OpenAI invalide.' };
      return { translatedText: translated, cached: false };
    }

    // anthropic
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        // Sans cet en-tête, l'API Anthropic refuse tout appel venant d'un
        // navigateur (garde-fou anti-fuite de clé). Ici c'est assumé :
        // c'est la clé de l'utilisateur, dans son propre navigateur.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `Translate the user's message to ${LANG_NAME[targetLang]}. Reply with ONLY the translation, no quotes, no explanation. If the message is already in ${LANG_NAME[targetLang]}, reply with it unchanged.`,
        messages: [{ role: 'user', content: text }],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json?.error?.message ?? `Erreur Anthropic ${res.status}.` };
    const translated = json?.content?.[0]?.text?.trim();
    if (!translated) return { error: 'Réponse Anthropic invalide.' };
    return { translatedText: translated, cached: false };
  } catch {
    return { error: 'Réseau indisponible — traduction impossible pour le moment.' };
  }
}

// Mémo de session (vidé au rechargement de la page). Le cache serveur
// évite de repayer DeepL, mais pas l'aller-retour réseau : sans ce mémo,
// re-monter un fil de chat ou rouvrir les commentaires d'un post relance
// un fetch par message à chaque fois. Clé = langue cible + texte exact.
const memo = new Map<string, TranslateResult>();

export async function translateMessage(
  text: string,
  targetLang: Lang,
  wallet?: string | null
): Promise<TranslateResult | { error: string }> {
  const key = `${targetLang}\u0000${text}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const byok = loadTranslationByok();
  const result = byok
    ? await translateWithByok(text, targetLang, byok)
    : await translateDefault(text, targetLang, wallet);

  // Les erreurs ne sont jamais mémorisées : un quota atteint ou un réseau
  // coupé doit pouvoir se retenter au rendu suivant.
  if (!('error' in result)) memo.set(key, result);
  return result;
}
