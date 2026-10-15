// supabase/functions/translate/index.ts
// ═══════════════════════════════════════════════════════════════════
// Traduction à la demande pour chat / contact / network. Chemin par
// défaut (aucune config utilisateur) : DeepL, gratuit jusqu'à 500k
// caractères/mois, détection automatique de la langue source incluse.
//
// Requiert le secret DEEPL_API_KEY (Supabase → Edge Functions → Secrets).
// Clé gratuite : https://www.deepl.com/pro-api → "DeepL API Free".
//
// Cache : voir supabase/migrations/20260918120000_create_translation_cache.sql
// — un texte déjà traduit vers une langue donnée n'est jamais renvoyé à
// DeepL une seconde fois.
//
// Le chemin BYOK (l'utilisateur fournit sa propre clé OpenAI/Anthropic)
// NE PASSE PAS par cette fonction — il appelle le fournisseur directement
// depuis le navigateur, comme l'assistant Nexus. Cette fonction ne sert
// que le chemin par défaut. DeepL est exclu du BYOK (pas de CORS, voir
// src/lib/translation.ts).
//
// ⚠️ Cette fonction n'a pas de vérification de signature comme
// project-write/push (un popup wallet à chaque message lu serait
// inutilisable), donc le seul rempart contre l'abus est le quota
// ci-dessous. `DEEPL_API_KEY` est partagée par toute l'app (500k
// caractères/mois) : sans plafond, un script tapant cette fonction en
// boucle l'épuiserait en quelques minutes pour tout le monde. Le
// compteur est best-effort (une IP usurpée ou un wallet non signé
// peuvent le contourner) — c'est un frein contre l'abus trivial, pas
// une preuve d'identité.
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEEPL_API_KEY = Deno.env.get('DEEPL_API_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Plafond par (wallet ou IP) par jour. 8000 caractères ≈ largement de quoi
// lire un fil de chat/network actif en continu sans jamais approcher la
// limite ; 60 lecteurs actifs/jour à ce plafond tiennent dans le quota
// mensuel gratuit (8000 × 60 × 30 ≈ 480k, sous les 500k). À ajuster une
// fois l'usage réel observé.
const DAILY_CHAR_LIMIT = 8000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// DeepL utilise des codes langue en MAJUSCULES ('EN', 'FR') — l'app en
// interne parle 'en'/'fr' (voir src/lib/i18n). Mapping minimal, à étendre
// si d'autres langues sont ajoutées à l'app un jour.
const LANG_TO_DEEPL: Record<string, string> = { fr: 'FR', en: 'EN-US' };

// ─────────────────────────────────────────────────────────────────────
// CORS restreint (15/10/2026). `*` laissait n'importe quel site appeler
// cette fonction depuis le navigateur d'un visiteur. Désormais seule une
// origine de la liste est répercutée ; les autres reçoivent une réponse
// SANS en-tête Access-Control-Allow-Origin (le navigateur la bloque).
// Surcharge possible sans redéployer le code :
//   supabase secrets set ALLOWED_ORIGINS="https://a.example,https://b.example"
// Les appels hors navigateur (curl, serveur) ne sont pas concernés : le
// CORS protège le navigateur, pas l'API — l'auth reste la signature.
// ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  'https://buildpact-solana.vercel.app,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get('Origin');
  const headers = new Headers(res.headers);
  headers.set('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.delete('Access-Control-Allow-Origin');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { text?: string; targetLang?: string; wallet?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const text = (body.text ?? '').trim();
  const targetLang = body.targetLang;

  if (!text) return json({ error: 'text is required' }, 400);
  if (targetLang !== 'fr' && targetLang !== 'en') {
    return json({ error: "targetLang must be 'fr' or 'en'" }, 400);
  }
  if (text.length > 2000) return json({ error: 'text too long (max 2000 chars)' }, 400);

  if (!DEEPL_API_KEY) {
    return json(
      {
        error:
          "Service de traduction non configuré (DEEPL_API_KEY manquant côté serveur) — le message reste affiché dans sa langue d'origine.",
      },
      503
    );
  }

  const hash = await sha256Hex(text);

  // ── Quota — voir en-tête du fichier ──────────────────────────────────
  // `usage_key` a un check (usage_key <> '') côté SQL : le repli 'unknown'
  // garantit qu'on n'écrit jamais une chaîne vide (un en-tête
  // x-forwarded-for présent mais vide donnerait '' sans ce garde-fou).
  const usageKey =
    body.wallet?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const today = new Date().toISOString().slice(0, 10);

  const { data: usage, error: usageErr } = await supabase
    .from('translation_usage')
    .select('chars_used')
    .eq('usage_key', usageKey)
    .eq('usage_day', today)
    .maybeSingle();

  // Échec FERMÉ (15/10/2026) : si le compteur est illisible, on refuse au
  // lieu de laisser passer — sinon une panne SQL ouvrirait un robinet DeepL
  // illimité sur la clé partagée de toute l'app.
  if (usageErr) {
    console.error('[translate] quota read error:', usageErr.message);
    return json({ error: 'Vérification du quota indisponible — réessaie.' }, 503);
  }

  if ((usage?.chars_used ?? 0) + text.length > DAILY_CHAR_LIMIT) {
    return json(
      { error: 'Quota de traduction quotidien atteint — réessaie demain.' },
      429
    );
  }

  // 1) Cache — évite un appel DeepL si ce texte exact a déjà été traduit
  //    vers cette langue. Volontairement AVANT l'incrément de quota : une
  //    lecture servie par le cache ne coûte rien à DeepL, donc elle ne
  //    doit rien consommer du plafond.
  const { data: cached } = await supabase
    .from('translation_cache')
    .select('translated_text, detected_source_lang')
    .eq('content_hash', hash)
    .eq('target_lang', targetLang)
    .eq('provider', 'deepl')
    .maybeSingle();

  if (cached) {
    return json({
      translatedText: cached.translated_text,
      detectedSourceLang: cached.detected_source_lang,
      cached: true,
    });
  }

  // 2) Appel DeepL — pas de source_lang envoyé : détection automatique.
  const deeplRes = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: LANG_TO_DEEPL[targetLang],
    }),
  });

  if (!deeplRes.ok) {
    const detail = await deeplRes.text().catch(() => '');
    console.error('[translate] DeepL error:', deeplRes.status, detail);
    return json({ error: 'Échec de la traduction — réessaie dans un instant.' }, 502);
  }

  const deeplJson = await deeplRes.json();
  const translation = deeplJson?.translations?.[0];
  if (!translation?.text) {
    return json({ error: 'Réponse de traduction invalide.' }, 502);
  }

  const translatedText: string = translation.text;
  const detectedSourceLang: string | undefined =
    translation.detected_source_language?.toLowerCase();

  // 3) Écriture cache — best-effort, pas d'await : la réponse ne doit pas
  //    attendre l'écriture. `upsert` plutôt qu'`insert` parce que deux
  //    lecteurs demandant le même message en même temps passent tous les
  //    deux la vérif cache et violeraient l'index unique.
  supabase
    .from('translation_cache')
    .upsert(
      {
        content_hash: hash,
        target_lang: targetLang,
        provider: 'deepl',
        source_text: text,
        translated_text: translatedText,
        detected_source_lang: detectedSourceLang ?? null,
      },
      { onConflict: 'content_hash,target_lang,provider' }
    )
    .then(({ error }) => {
      if (error) console.warn('[translate] cache write failed:', error.message);
    });

  // 4) Incrément du quota — seulement sur un appel DeepL réel.
  supabase
    .from('translation_usage')
    .upsert(
      {
        usage_key: usageKey,
        usage_day: today,
        chars_used: (usage?.chars_used ?? 0) + text.length,
      },
      { onConflict: 'usage_key,usage_day' }
    )
    .then(({ error }) => {
      if (error) console.warn('[translate] usage write failed:', error.message);
    });

  return json({ translatedText, detectedSourceLang, cached: false });
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
