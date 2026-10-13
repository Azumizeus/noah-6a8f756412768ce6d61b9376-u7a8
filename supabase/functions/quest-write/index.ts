// supabase/functions/quest-write/index.ts
// BuildPact — Journal de quetes V2 : reclamation manuelle des recompenses.
//
// Pourquoi une fonction separee de project-write : les quetes ne sont pas
// scopees a un project_pda (project-write l'exige en champ obligatoire),
// elles sont scopees a (wallet, semaine). Le principe de preuve reste le
// meme que "update"/"apply" dans project-write : signature ed25519 fraiche,
// message ancre (^...$) pour empecher tout rejeu croise entre actions.
//
// Le point de securite central : le CLIENT ne dit jamais "j'ai termine
// cette quete" sans preuve — le serveur reproduit EXACTEMENT le calcul de
// fetchWeeklyQuestProgress() (src/lib/gamification.ts) a partir de
// pact_events, et refuse la reclamation si la quete n'est pas reellement
// complete. Sans ca, un wallet pourrait signer un message et empocher l'XP
// sans avoir rien fait.
//
// Semaine = UTC, lundi 00:00 — pas l'heure locale du navigateur. src/lib/
// gamification.ts a ete aligne sur ce meme calcul UTC (voir startOfWeekIso).
//
// Aucun appel au programme Solana ici, aucune ecriture on-chain : cette
// fonction ne touche que Supabase (quest_claims, xp_events). Elle relit
// pact_events, deja peuple par project-write apres verification de vraies
// transactions — la preuve on-chain est donc deja etablie en amont.
//
// ⚠️ BUG CORRIGE LE 29/08 (nuit) : CLAIM_RE utilisait "reclamation de quete"
// / "Quete:" SANS accents, alors que le client (src/lib/gamification.ts,
// claimQuestReward) construit le message AVEC accents ("réclamation de
// quête" / "Quête:") — exactement le piège documente dans CERVEAU_PROMPT.md
// regle n°1 (une regex ancree qui ne correspond pas au caractere pres casse
// l'action). Chaque tentative de reclamation echouait avec "Message de
// signature invalide." Corrige en alignant la regex sur le texte reellement
// signe par le client.
//
// Deploiement : supabase functions deploy quest-write --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const WALLET_RE = new RegExp(`^${B58}$`);
const QUEST_KEYS = ['fund', 'approve', 'finalize'];

const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

const QUEST_XP: Record<string, number> = { fund: 40, approve: 30, finalize: 60 };
const COMPLETION_BONUS_XP = 150;

const CLAIM_RE = new RegExp(
  `^BuildPact — réclamation de quête\\nWallet: (${B58})\\nQuête: (fund|approve|finalize)\\nSemaine: (\\d{4}-\\d{2}-\\d{2})\\nTimestamp: (\\d{10,16})$`
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function verifySignatureBytes(wallet: string, message: string, signature: unknown): boolean {
  if (!Array.isArray(signature) || signature.length !== 64) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      Uint8Array.from(signature as number[]),
      bs58.decode(wallet)
    );
  } catch {
    return false;
  }
}

function isFresh(timestamp: number): boolean {
  const age = Date.now() - timestamp;
  return age <= MAX_AGE_MS && age >= -MAX_CLOCK_SKEW_MS;
}

function currentWeekStartUtc(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}

function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

interface RawEvent {
  kind: string;
  project_pda: string;
  created_at: string;
}

function isQuestComplete(events: RawEvent[], questKey: string): boolean {
  if (questKey === 'fund') {
    const fundedProjects = new Set(events.filter((e) => e.kind === 'fund').map((e) => e.project_pda));
    return fundedProjects.size >= 2;
  }
  if (questKey === 'approve') {
    return events.filter((e) => e.kind === 'approve').length >= 1;
  }
  if (questKey === 'finalize') {
    return events.filter((e) => e.kind === 'finalize').length >= 1;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Methode non supportee.' }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const { message, signature, questKey } = payload as {
    message?: string;
    signature?: unknown;
    questKey?: string;
  };

  if (typeof questKey !== 'string' || !QUEST_KEYS.includes(questKey)) {
    return jsonResponse({ error: 'Quete inconnue.' }, 400);
  }
  if (typeof message !== 'string') {
    return jsonResponse({ error: 'Message de signature absent.' }, 400);
  }

  const parsed = CLAIM_RE.exec(message);
  if (!parsed) return jsonResponse({ error: 'Message de signature invalide.' }, 400);
  const [, wallet, signedQuest, signedWeek, ts] = parsed;

  if (signedQuest !== questKey) {
    return jsonResponse({ error: 'Signature emise pour une autre quete.' }, 400);
  }
  if (!WALLET_RE.test(wallet)) {
    return jsonResponse({ error: 'Wallet invalide.' }, 400);
  }
  if (!isFresh(Number(ts))) {
    return jsonResponse({ error: 'Signature expiree — reessaie.' }, 401);
  }
  if (!verifySignatureBytes(wallet, message, signature)) {
    return jsonResponse({ error: 'Signature invalide.' }, 401);
  }

  const serverWeek = currentWeekStartUtc();
  if (signedWeek !== serverWeek) {
    return jsonResponse({ error: 'Signature emise pour une autre semaine — recharge la page et reessaie.' }, 409);
  }

  const admin = adminClient();
  if (!admin) return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);

  const sinceIso = `${serverWeek}T00:00:00.000Z`;
  const { data: events, error: fetchErr } = await admin
    .from('pact_events')
    .select('kind, project_pda, created_at')
    .eq('actor', wallet)
    .gte('created_at', sinceIso);
  if (fetchErr) {
    console.error('[quest-write] fetch pact_events:', fetchErr.message);
    return jsonResponse({ error: fetchErr.message }, 500);
  }
  if (!isQuestComplete((events ?? []) as RawEvent[], questKey)) {
    return jsonResponse({ error: 'Quete pas encore terminee.', code: 'not_complete' }, 409);
  }

  const xp = QUEST_XP[questKey];
  const { error: claimErr } = await admin.from('quest_claims').insert({
    wallet,
    week_start: serverWeek,
    quest_key: questKey,
    xp_awarded: xp,
  });
  if (claimErr) {
    if ((claimErr as { code?: string }).code === '23505') {
      return jsonResponse({ ok: true, alreadyClaimed: true });
    }
    console.error('[quest-write] insert claim:', claimErr.message);
    return jsonResponse({ error: claimErr.message }, 500);
  }

  const { error: xpErr } = await admin.from('xp_events').insert({
    wallet,
    source: `quest_${questKey}`,
    amount: xp,
  });
  if (xpErr) console.error('[quest-write] insert xp_events (quest):', xpErr.message);

  let bonusAwarded = false;
  try {
    const { count } = await admin
      .from('quest_claims')
      .select('quest_key', { count: 'exact', head: true })
      .eq('wallet', wallet)
      .eq('week_start', serverWeek)
      .in('quest_key', QUEST_KEYS);
    if ((count ?? 0) >= QUEST_KEYS.length) {
      const { error: bonusErr } = await admin.from('quest_claims').insert({
        wallet,
        week_start: serverWeek,
        quest_key: 'bonus',
        xp_awarded: COMPLETION_BONUS_XP,
      });
      if (!bonusErr) {
        bonusAwarded = true;
        await admin.from('xp_events').insert({
          wallet,
          source: 'quest_bonus',
          amount: COMPLETION_BONUS_XP,
        });
      } else if ((bonusErr as { code?: string }).code !== '23505') {
        console.error('[quest-write] insert bonus claim:', bonusErr.message);
      }
    }
  } catch (e) {
    console.error('[quest-write] completion bonus check failed:', e);
  }

  return jsonResponse({ ok: true, xpAwarded: xp, bonusAwarded });
});
