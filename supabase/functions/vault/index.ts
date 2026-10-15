// supabase/functions/vault/index.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — Vault de documents privés par projet.
//
// Pourquoi une Edge Function (et pas des policies RLS ouvertes comme
// project_media/pact_events) : un document déposé ici est un LIVRABLE
// CONFIDENTIEL — il ne doit être visible que par les membres du projet
// concerné, et son statut (approuvé / à revoir) ne doit être modifiable
// QUE par le founder. RLS/Postgres ne sait pas lire un compte Solana, donc
// cette fonction vérifie :
//   1. une signature signMessage (preuve que l'appelant contrôle le wallet)
//   2. l'appartenance au projet EN LISANT LE COMPTE PROJECT ON-CHAIN (même
//      IDL Anchor que le frontend) — le founder est project.creator, les
//      membres sont project.members[].wallet.
// Seulement après ces deux vérifications elle utilise la service_role key
// (bypass RLS + accès au bucket privé) pour lire/écrire.
//
// Déploiement (depuis la racine du repo) :
//   supabase functions deploy vault --no-verify-jwt
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement)
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.95.3';
import { AnchorProvider, Program } from 'npm:@coral-xyz/anchor@0.30.1';
import idl from './buildpact_idl.json' with { type: 'json' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const WALLET_RE = new RegExp(`^${B58}$`);
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

// Regex ANCRÉE (^…$). Non négociable : avec un simple `includes`, une
// signature obtenue pour une AUTRE action (update-profile, contact…)
// pourrait être rejouée ici tant qu'elle contient le wallet quelque part.
const VAULT_RE = new RegExp(`^BuildPact — accès au vault\\nWallet: (${B58})\\nTimestamp: (\\d{10,16})$`);

const BUCKET = 'project-documents';
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 Mo — suffisant pour un PDF/zip de démo
const SIGNED_URL_TTL_S = 600; // 10 min

const PROGRAM_ID = new PublicKey('9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ');
const RPC_URL = Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Vérifie signature ed25519 + anti-replay. Le wallet est extrait DU
 *  MESSAGE SIGNÉ (jamais du payload) — voir project-write/index.ts. */
function verifyWalletSignature(message: unknown, signature: unknown): { wallet: string } | { error: string } {
  if (typeof message !== 'string') return { error: 'Message de signature absent.' };
  const parsed = VAULT_RE.exec(message);
  if (!parsed) return { error: 'Message de signature invalide.' };
  const [, wallet, tsStr] = parsed;

  if (!Array.isArray(signature) || signature.length !== 64) return { error: 'Signature invalide.' };

  const age = Date.now() - Number(tsStr);
  if (age > MAX_MESSAGE_AGE_MS || age < -MAX_CLOCK_SKEW_MS) return { error: 'Signature expirée — réessaie.' };

  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(signature as number[]);
    const pubkeyBytes = bs58.decode(wallet);
    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes)) {
      return { error: 'Signature invalide — impossible de prouver que tu contrôles ce wallet.' };
    }
  } catch {
    return { error: 'Signature invalide.' };
  }
  return { wallet };
}

/** Lit le compte Project on-chain (même décodage Anchor que le frontend). */
async function fetchProjectAccount(projectPda: string) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
  const program = new Program(idl as any, provider);
  return await (program.account as any).project.fetch(new PublicKey(projectPda));
}

function isFounder(project: any, wallet: string): boolean {
  return (project.creator as PublicKey).toBase58() === wallet;
}
function isMember(project: any, wallet: string): boolean {
  if (isFounder(project, wallet)) return true;
  return (project.members as any[]).some((m) => (m.wallet as PublicKey).toBase58() === wallet);
}

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non supportée.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const { action, projectPda, message, signature } = body ?? {};

  const sigResult = verifyWalletSignature(message, signature);
  if ('error' in sigResult) return jsonResponse({ error: sigResult.error }, 401);
  const wallet = sigResult.wallet;

  if (typeof projectPda !== 'string' || !WALLET_RE.test(projectPda)) {
    return jsonResponse({ error: 'Projet invalide.' }, 400);
  }

  let project: any;
  try {
    project = await fetchProjectAccount(projectPda);
  } catch {
    return jsonResponse({ error: 'Projet introuvable on-chain.' }, 404);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ═══ upload-url : un membre demande une URL d'upload signée ═══
  if (action === 'upload-url') {
    if (!isMember(project, wallet)) {
      return jsonResponse({ error: "Tu n'es pas membre de ce projet." }, 403);
    }
    const title = String(body.title ?? '').slice(0, 120) || 'Document';
    const mimeType = String(body.mimeType ?? 'application/octet-stream').slice(0, 100);
    const sizeBytes = Number(body.sizeBytes ?? 0);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
      return jsonResponse({ error: `Fichier invalide (max ${MAX_FILE_BYTES / 1024 / 1024} Mo).` }, 400);
    }

    // supersedesId optionnel : ré-upload d'une nouvelle version d'un document
    // existant plutôt que d'écraser — doit appartenir au MÊME projet.
    let supersedesId: number | null = null;
    if (body.supersedesId != null) {
      const candidate = Number(body.supersedesId);
      if (!Number.isInteger(candidate)) {
        return jsonResponse({ error: 'Document remplacé invalide.' }, 400);
      }
      const { data: prevDoc } = await admin
        .from('project_documents')
        .select('id')
        .eq('id', candidate)
        .eq('project_pda', projectPda)
        .maybeSingle();
      if (!prevDoc) {
        return jsonResponse({ error: 'Document remplacé introuvable pour ce projet.' }, 400);
      }
      supersedesId = candidate;
    }

    const path = `${projectPda}/${crypto.randomUUID()}`;
    const { data: signedUpload, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signedUpload) {
      console.error('[vault] createSignedUploadUrl error:', signErr?.message);
      return jsonResponse({ error: "Échec de préparation de l'upload — réessaie." }, 500);
    }

    const { data: row, error: insertErr } = await admin
      .from('project_documents')
      .insert({
        project_pda: projectPda,
        uploader_wallet: wallet,
        title,
        file_path: path,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        status: 'pending',
        supersedes_id: supersedesId,
      })
      .select('id')
      .single();
    if (insertErr || !row) {
      console.error('[vault] insert error:', insertErr?.message);
      return jsonResponse({ error: "Échec de l'enregistrement — réessaie." }, 500);
    }

    return jsonResponse({
      uploadUrl: signedUpload.signedUrl,
      token: signedUpload.token,
      path,
      documentId: row.id,
    });
  }

  // ═══ list : tout membre (ou founder) liste les documents du projet ═══
  if (action === 'list') {
    if (!isMember(project, wallet)) {
      return jsonResponse({ error: "Tu n'es pas membre de ce projet." }, 403);
    }
    const { data: rows, error: listErr } = await admin
      .from('project_documents')
      .select('*')
      .eq('project_pda', projectPda)
      .order('created_at', { ascending: false });
    if (listErr) {
      console.error('[vault] list error:', listErr.message);
      return jsonResponse({ error: 'Échec du chargement.' }, 500);
    }

    const documents = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(r.file_path as string, SIGNED_URL_TTL_S);
        return {
          id: r.id,
          title: r.title,
          uploaderWallet: r.uploader_wallet,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
          status: r.status,
          founderNote: r.founder_note,
          reviewedBy: r.reviewed_by,
          reviewedAt: r.reviewed_at,
          createdAt: r.created_at,
          supersedesId: r.supersedes_id ?? null,
          url: signed?.signedUrl ?? null,
        };
      })
    );

    return jsonResponse({ documents, isFounder: isFounder(project, wallet) });
  }

  // ═══ review : SEUL le founder approuve / demande des changements ═══
  if (action === 'review') {
    if (!isFounder(project, wallet)) {
      return jsonResponse({ error: 'Seul le founder peut réviser un document.' }, 403);
    }
    const documentId = Number(body.documentId);
    const status = String(body.status ?? '');
    const note = String(body.note ?? '').slice(0, 500);
    if (!Number.isInteger(documentId)) {
      return jsonResponse({ error: 'Document invalide.' }, 400);
    }
    if (status !== 'approved' && status !== 'changes_requested') {
      return jsonResponse({ error: 'Statut invalide.' }, 400);
    }

    const { error: updateErr } = await admin
      .from('project_documents')
      .update({
        status,
        founder_note: note,
        reviewed_by: wallet,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('project_pda', projectPda);
    if (updateErr) {
      console.error('[vault] review error:', updateErr.message);
      return jsonResponse({ error: 'Échec de la révision — réessaie.' }, 500);
    }

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Action inconnue.' }, 400);
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
