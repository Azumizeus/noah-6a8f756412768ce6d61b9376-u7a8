// supabase/functions/chat-moderate/index.ts
// Écriture SÉCURISÉE du chat de projet (post + delete + revoke).
// Seul chemin d'écriture vers project_chat_messages : la table n'a que
// SELECT public. `author_wallet` est renseigné par le SERVEUR à partir du
// wallet dont la signature vient d'être validée.
//   POST   → jeton de SESSION signé une fois pour SESSION_TTL_HOURS
//   DELETE → signature unitaire fraîche, liée à l'id, founder only
//   REVOKE → signature unitaire fraîche, pose un cutoff par wallet
// Regex ANCRÉES : les trois formats doivent rester mutuellement
// inacceptables, sinon une signature de suppression servirait de session.
// Déploiement : supabase functions deploy chat-moderate --no-verify-jwt
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

/** Fenêtre stricte des signatures unitaires (suppression, révocation). */
const UNIT_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

/** ⚠️ Doit rester synchronisé avec CHAT_SESSION_TTL_HOURS dans
 *  src/lib/chatSession.ts — la valeur est écrite en toutes lettres dans le
 *  message signé. */
const SESSION_TTL_HOURS = 24;
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

const REVOCATION_SKEW_MS = MAX_CLOCK_SKEW_MS;

const MAX_BODY_LEN = 500;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 10;

const SESSION_RE = new RegExp(
  `^BuildPact — session chat\\nWallet: (${B58})\\nProjet: (${B58})\\nValidité: ${SESSION_TTL_HOURS} h\\nTimestamp: (\\d{10,16})$`
);
const DELETE_RE = new RegExp(
  `^BuildPact — suppression d'un message\\nWallet: (${B58})\\nProjet: (${B58})\\nMessage: (\\d+)\\nTimestamp: (\\d{10,16})$`
);
const REVOKE_RE = new RegExp(
  `^BuildPact — révocation des sessions chat\\nWallet: (${B58})\\nTimestamp: (\\d{10,16})$`
);

// Discriminant Anchor du compte Project (cf. buildpact_idl.json).
const PROJECT_DISCRIMINATOR = [205, 168, 189, 202, 181, 247, 142, 19];

const RPC_URL = Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com';

/** Langue d'écriture déclarée par le client. Whitelist stricte : la
 *  colonne `lang` est relue par le front pour DÉCIDER de ne pas traduire,
 *  une valeur libre y ferait passer n'importe quoi. Inconnue → null,
 *  c'est-à-dire « langue non mesurée », pas « français ». */
function cleanLang(v: unknown): string | null {
  return v === 'fr' || v === 'en' ? v : null;
}

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

function isFresh(timestamp: number, maxAgeMs: number): boolean {
  const age = Date.now() - timestamp;
  return age <= maxAgeMs && age >= -MAX_CLOCK_SKEW_MS;
}

/** Lit `project.creator` on-chain. null si le compte n'existe pas ou n'est
 *  pas un compte Project (discriminant différent). */
async function fetchProjectCreator(projectPda: string): Promise<string | null> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [projectPda, { encoding: 'base64', commitment: 'confirmed' }],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);

  const json = await res.json();
  const b64 = json?.result?.value?.data?.[0];
  if (typeof b64 !== 'string') return null;

  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length < 40) return null;
  for (let i = 0; i < 8; i++) {
    if (raw[i] !== PROJECT_DISCRIMINATOR[i]) return null;
  }
  return bs58.encode(raw.slice(8, 40));
}

function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/** Cutoff de révocation d'un wallet, en ms epoch. Lève en cas d'erreur SQL :
 *  traiter une panne de lecture comme « pas de révocation » ressusciterait
 *  des jetons que l'utilisateur croit morts. */
async function fetchRevocationCutoff(
  admin: ReturnType<typeof createClient>,
  wallet: string
): Promise<number | null> {
  const { data, error } = await admin
    .from('chat_session_revocations')
    .select('revoked_before')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.revoked_before) return null;
  return new Date(data.revoked_before as string).getTime();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non supportée.' }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const {
    action,
    projectPda,
    messageId,
    body,
    sessionMessage,
    sessionSignature,
    message,
    signature,
    lang,
  } = (payload ?? {}) as {
    action?: string;
    projectPda?: string;
    messageId?: number;
    body?: string;
    sessionMessage?: string;
    sessionSignature?: unknown;
    message?: string;
    signature?: unknown;
    lang?: unknown;
  };

  if (action !== 'post' && action !== 'delete' && action !== 'revoke') {
    return jsonResponse({ error: 'Action inconnue.' }, 400);
  }

  const admin = adminClient();
  if (!admin) return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);

  // REVOKE — invalider toutes les sessions du wallet, côté serveur
  if (action === 'revoke') {
    if (typeof message !== 'string') {
      return jsonResponse({ error: 'Message de signature absent.' }, 400);
    }
    const parsedRevoke = REVOKE_RE.exec(message);
    if (!parsedRevoke) return jsonResponse({ error: 'Message de signature invalide.' }, 400);

    const [, revokeWallet, revokeTs] = parsedRevoke;

    if (!isFresh(Number(revokeTs), UNIT_MAX_AGE_MS)) {
      return jsonResponse({ error: 'Signature expirée — réessaie.' }, 401);
    }
    if (!verifySignatureBytes(revokeWallet, message, signature)) {
      return jsonResponse(
        { error: 'Signature invalide — impossible de prouver que tu contrôles ce wallet.' },
        401
      );
    }

    const revokedBefore = new Date().toISOString();
    const { error: revokeError } = await admin
      .from('chat_session_revocations')
      .upsert(
        { wallet: revokeWallet, revoked_before: revokedBefore, updated_at: revokedBefore },
        { onConflict: 'wallet' }
      );

    if (revokeError) {
      console.error('[chat-moderate] revoke error:', revokeError.message);
      return jsonResponse({ error: `Échec de la révocation — ${revokeError.message}` }, 500);
    }
    return jsonResponse({ ok: true, revokedBefore });
  }

  if (typeof projectPda !== 'string' || !WALLET_RE.test(projectPda)) {
    return jsonResponse({ error: 'Projet invalide.' }, 400);
  }

  // POST — publier un message, autorisé par un jeton de session
  if (action === 'post') {
    if (typeof sessionMessage !== 'string') {
      return jsonResponse({ error: 'Session absente.', code: 'session_invalid' }, 401);
    }

    const parsed = SESSION_RE.exec(sessionMessage);
    if (!parsed) {
      return jsonResponse({ error: 'Session invalide.', code: 'session_invalid' }, 401);
    }
    const [, sessionWallet, sessionProject, sessionTs] = parsed;

    if (sessionProject !== projectPda) {
      return jsonResponse(
        { error: 'Session émise pour un autre projet.', code: 'session_invalid' },
        401
      );
    }
    if (!isFresh(Number(sessionTs), SESSION_TTL_MS)) {
      return jsonResponse({ error: 'Session expirée.', code: 'session_expired' }, 401);
    }
    if (!verifySignatureBytes(sessionWallet, sessionMessage, sessionSignature)) {
      return jsonResponse(
        { error: 'Session invalide — signature non vérifiable.', code: 'session_invalid' },
        401
      );
    }

    const authorWallet = sessionWallet;

    let cutoff: number | null;
    try {
      cutoff = await fetchRevocationCutoff(admin, authorWallet);
    } catch (e) {
      console.error('[chat-moderate] revocation lookup failed:', (e as Error).message);
      return jsonResponse({ error: 'Vérification de session indisponible — réessaie.' }, 503);
    }
    if (cutoff !== null && Number(sessionTs) < cutoff - REVOCATION_SKEW_MS) {
      return jsonResponse(
        { error: 'Session révoquée — une nouvelle signature est requise.', code: 'session_revoked' },
        401
      );
    }

    if (typeof body !== 'string') return jsonResponse({ error: 'Message invalide.' }, 400);
    const trimmed = body.trim();
    if (!trimmed) return jsonResponse({ error: 'Message vide.' }, 400);
    if (trimmed.length > MAX_BODY_LEN) {
      return jsonResponse({ error: `Message trop long (max ${MAX_BODY_LEN} caractères).` }, 400);
    }

    let creator: string | null;
    try {
      creator = await fetchProjectCreator(projectPda);
    } catch {
      return jsonResponse({ error: 'RPC Solana injoignable — réessaie.' }, 503);
    }
    if (!creator) return jsonResponse({ error: 'Projet introuvable on-chain.' }, 404);

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countError } = await admin
      .from('project_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('author_wallet', authorWallet)
      .gte('created_at', since);

    if (!countError && (count ?? 0) >= RATE_LIMIT_MAX_MESSAGES) {
      return jsonResponse({ error: 'Trop de messages envoyés — attends une minute.' }, 429);
    }

    const { data, error } = await admin
      .from('project_chat_messages')
      .insert({
        project_pda: projectPda,
        author_wallet: authorWallet,
        body: trimmed,
        lang: cleanLang(lang),
      })
      .select('id, project_pda, author_wallet, body, created_at, lang')
      .single();

    if (error) {
      console.error('[chat-moderate] insert error:', error.message);
      return jsonResponse({ error: `Échec de l'envoi — ${error.message}` }, 500);
    }
    return jsonResponse({ ok: true, message: data });
  }

  // DELETE — modération founder-only, signature unitaire et fraîche
  if (typeof message !== 'string') {
    return jsonResponse({ error: 'Message de signature absent.' }, 400);
  }
  const parsedDelete = DELETE_RE.exec(message);
  if (!parsedDelete) return jsonResponse({ error: 'Message de signature invalide.' }, 400);

  const [, delWallet, delProject, delMessageId, delTs] = parsedDelete;

  if (delProject !== projectPda || Number(delMessageId) !== messageId) {
    return jsonResponse({ error: 'Message de signature incohérent.' }, 400);
  }
  if (!Number.isInteger(messageId) || (messageId as number) <= 0) {
    return jsonResponse({ error: 'Message invalide.' }, 400);
  }
  if (!isFresh(Number(delTs), UNIT_MAX_AGE_MS)) {
    return jsonResponse({ error: 'Signature expirée — réessaie.' }, 401);
  }
  if (!verifySignatureBytes(delWallet, message, signature)) {
    return jsonResponse(
      { error: 'Signature invalide — impossible de prouver que tu contrôles ce wallet.' },
      401
    );
  }

  let creator: string | null;
  try {
    creator = await fetchProjectCreator(projectPda);
  } catch {
    return jsonResponse({ error: 'RPC Solana injoignable — réessaie.' }, 503);
  }
  if (!creator) return jsonResponse({ error: 'Projet introuvable on-chain.' }, 404);

  if (creator !== delWallet) {
    return jsonResponse({ error: 'Seul le founder du projet peut supprimer un message.' }, 403);
  }

  // Le `.eq('project_pda', projectPda)` enferme la suppression dans le
  // projet dont on vient de prouver que l'appelant est founder.
  const { data, error } = await admin
    .from('project_chat_messages')
    .delete()
    .eq('id', messageId as number)
    .eq('project_pda', projectPda)
    .select('id');

  if (error) {
    console.error('[chat-moderate] delete error:', error.message);
    return jsonResponse({ error: `Échec de la suppression — ${error.message}` }, 500);
  }
  if (!data || data.length === 0) {
    return jsonResponse({ error: 'Message introuvable dans ce projet.' }, 404);
  }

  return jsonResponse({ ok: true });
});
