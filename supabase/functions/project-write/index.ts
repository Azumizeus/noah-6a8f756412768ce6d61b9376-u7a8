// supabase/functions/project-write/index.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — Écriture SÉCURISÉE des tables off-chain restantes.
//
// Couvre quatre tables qui vivaient jusqu'ici sous des policies
// `INSERT with check (true)` :
//
//   pact_events     → journal d'activité      (action "event")
//   project_updates → fil d'avancement        (action "update")
//   role_interests  → candidatures            (action "apply")
//   project_media   → logo / bannière / about (action "media")
//
// Ce que la policy ouverte permettait concrètement, et qui n'était pas
// théorique :
//   • inscrire un faux « X a financé 40 SOL » dans le fil d'activité de
//     n'importe quel projet, sans qu'aucune transaction n'ait eu lieu ;
//   • poster une mise à jour signée du nom d'un membre du pact ;
//   • déposer des candidatures au nom d'un autre wallet ;
//   • et le plus visible : réécrire le logo, la bannière et le texte de
//     présentation de N'IMPORTE quel projet (project_media avait AUSSI une
//     policy UPDATE ouverte). Défacement d'une fiche publique en une
//     requête, sans authentification.
//
// Postgres ne peut pas trancher ces cas seul : il n'a aucun moyen de savoir
// qui contrôle une clé Solana. Il faut soit une signature ed25519, soit une
// preuve on-chain. Les deux sont utilisées ici, selon l'action.
//
// ── Deux régimes de preuve, et pourquoi ils diffèrent ───────────────
//
// "event" → PREUVE PAR LA TRANSACTION, aucune signature demandée.
//   Le journal est écrit automatiquement après chaque tx confirmée.
//   Exiger une signature y aurait ajouté un second popup wallet APRÈS
//   celui de la transaction — insupportable, et vite contourné en
//   désactivant le journal. On vérifie donc la tx elle-même : elle doit
//   exister on-chain, avoir réussi, invoquer notre programme, et avoir
//   `actor` parmi ses signataires. C'est strictement plus fort qu'une
//   signature (on prouve l'acte, pas seulement l'identité) et ça ne coûte
//   aucun clic.
//
// "update" / "apply" / "media" → SIGNATURE ed25519 fraîche.
//   Ce sont des actes délibérés et rares ; un popup y est acceptable.
//   "media" ajoute une vérification founder on-chain, parce qu'il touche
//   l'apparence publique du projet et pas seulement une ligne signée.
//
// Déploiement : supabase functions deploy project-write --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5';
import { PublicKey } from 'npm:@solana/web3.js@1.95.3';
import { Buffer } from 'node:buffer';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const WALLET_RE = new RegExp(`^${B58}$`);
const TXSIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

const PROGRAM_ID = '9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ';
// Discriminant Anchor du compte Project — identique à chat-moderate.
// ⚠️ Si l'ordre des champs de `Project` change dans lib.rs, le décodage de
// `creator` casse silencieusement (mauvaise pubkey → tout est refusé).
const PROJECT_DISCRIMINATOR = [205, 168, 189, 202, 181, 247, 142, 19];

const RPC_URL = Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com';

// Formats de messages signés — regex ANCRÉES (^…$).
// Non négociable : avec un simple `includes`, une signature obtenue pour
// une action pourrait être rejouée sur une autre. Les formats doivent
// rester mutuellement inacceptables.
const UPDATE_RE = new RegExp(
  `^BuildPact — mise à jour de projet\\nWallet: (${B58})\\nProjet: (${B58})\\nTimestamp: (\\d{10,16})$`
);
const APPLY_RE = new RegExp(
  `^BuildPact — candidature\\nWallet: (${B58})\\nProjet: (${B58})\\nTimestamp: (\\d{10,16})$`
);
const MEDIA_RE = new RegExp(
  `^BuildPact — médias du projet\\nWallet: (${B58})\\nProjet: (${B58})\\nTimestamp: (\\d{10,16})$`
);

const MAX_UPDATE_BODY = 500;
const MAX_LINK = 300;
const MAX_APPLY_MESSAGE = 400;
const MAX_ROLE_WANTED = 80;
const MAX_ABOUT = 4000;
const MAX_URL = 500;

const EVENT_KINDS = ['approve', 'fund', 'finalize', 'distribute', 'add_member'];

// ── Upload de fichier média (logo/bannière) — mêmes bornes que
// src/lib/media.ts, à ne PAS faire diverger : un mismatch laisserait le
// client valider un fichier que le serveur refuse, ou l'inverse.
const MEDIA_BUCKET = 'project-media';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error?.message ?? 'RPC error');
  return json.result;
}

/** Lit `project.creator` on-chain, ou null si le compte n'est pas un Project. */
async function fetchProjectCreator(projectPda: string): Promise<string | null> {
  const result = (await rpc('getAccountInfo', [
    projectPda,
    { encoding: 'base64', commitment: 'confirmed' },
  ])) as { value?: { data?: string[] } } | null;

  const b64 = result?.value?.data?.[0];
  if (typeof b64 !== 'string') return null;

  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length < 40) return null;
  for (let i = 0; i < 8; i++) {
    if (raw[i] !== PROJECT_DISCRIMINATOR[i]) return null;
  }
  return bs58.encode(raw.slice(8, 40));
}

/**
 * Vérifie qu'une transaction confirmée prouve bien l'événement déclaré.
 *
 * Quatre conditions, chacune fermant un abus distinct :
 *   1. la tx existe on-chain          → interdit d'inventer une signature ;
 *   2. elle a RÉUSSI (err === null)   → une tx échouée ne finance rien, la
 *      journaliser afficherait un versement qui n'a pas eu lieu ;
 *   3. elle invoque NOTRE programme   → interdit de recycler un transfert
 *      SOL quelconque comme preuve ;
 *   4. `actor` en est signataire      → interdit d'attribuer la tx d'un
 *      autre à soi-même, ou l'inverse.
 *
 * Retourne un message d'erreur, ou null si tout est bon.
 */
async function verifyEventTx(txSig: string, actor: string): Promise<string | null> {
  let tx: {
    meta?: { err?: unknown } | null;
    transaction?: { message?: { accountKeys?: { pubkey: string; signer: boolean }[] } };
  } | null;

  try {
    tx = (await rpc('getTransaction', [
      txSig,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ])) as typeof tx;
  } catch {
    return 'RPC Solana injoignable.';
  }

  // Le client appelle juste après confirmation ; l'indexation du RPC peut
  // avoir une seconde de retard. On distingue ce cas (404, réessayable) du
  // rejet définitif, sinon un événement légitime serait perdu pour un
  // simple décalage.
  if (!tx) return 'TX_NOT_FOUND';
  if (tx.meta?.err) return 'La transaction a échoué on-chain.';

  const keys = tx.transaction?.message?.accountKeys ?? [];
  if (!keys.some((k) => k.pubkey === PROGRAM_ID)) {
    return "La transaction n'invoque pas le programme BuildPact.";
  }
  if (!keys.some((k) => k.pubkey === actor && k.signer)) {
    return "L'acteur déclaré n'a pas signé cette transaction.";
  }
  return null;
}

/** Extension de fichier depuis le mimeType — DOIT rester identique à
 *  extFromFile() dans src/lib/media.ts : sinon le chemin calculé ici et
 *  celui que le client attend divergent, et getPublicUrl() pointe dans le
 *  vide. */
function extFromMime(mimeType: string): string {
  const fromType = mimeType.split('/')[1];
  return fromType === 'jpeg' ? 'jpg' : fromType || 'png';
}

/**
 * Redérive le PDA `project` à partir du wallet et du project_id, exactement
 * comme findProjectPda() côté client (seeds ["project", creator, project_id],
 * voir programs/workspace/src/lib.rs).
 *
 * Sert UNIQUEMENT quand le projet n'existe pas encore on-chain (upload de
 * logo/bannière pendant CreatePactWizard, avant l'instruction createProject).
 * Dans ce cas fetchProjectCreator() renvoie null — impossible de lire
 * project.creator puisque le compte n'existe pas — donc on prouve autrement
 * que CE wallet est bien celui qui EN SERA le creator : si la redérivation
 * du PDA avec (wallet, projectId) correspond au projectPda annoncé, c'est
 * cryptographiquement garanti, sans lecture RPC.
 */
function deriveProjectPda(creatorWallet: string, projectId: string): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('project'), new PublicKey(creatorWallet).toBuffer(), Buffer.from(projectId)],
    new PublicKey(PROGRAM_ID)
  );
  return pda.toBase58();
}

function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
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

  const action = payload.action;
  const projectPda = payload.projectPda;

  if (typeof projectPda !== 'string' || !WALLET_RE.test(projectPda)) {
    return jsonResponse({ error: 'Projet invalide.' }, 400);
  }

  const admin = adminClient();
  if (!admin) return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);

  // ══════════════════════════════════════════════════════════════════
  // EVENT — journal d'activité, prouvé par la transaction elle-même
  // ══════════════════════════════════════════════════════════════════
  if (action === 'event') {
    const { kind, actor, amountSol, txSig } = payload as {
      kind?: string;
      actor?: string;
      amountSol?: number | null;
      txSig?: string;
    };

    if (typeof kind !== 'string' || !EVENT_KINDS.includes(kind)) {
      return jsonResponse({ error: "Type d'événement inconnu." }, 400);
    }
    if (typeof actor !== 'string' || !WALLET_RE.test(actor)) {
      return jsonResponse({ error: 'Acteur invalide.' }, 400);
    }
    if (typeof txSig !== 'string' || !TXSIG_RE.test(txSig)) {
      return jsonResponse({ error: 'Signature de transaction invalide.' }, 400);
    }
    if (amountSol != null && (typeof amountSol !== 'number' || !Number.isFinite(amountSol) || amountSol < 0)) {
      return jsonResponse({ error: 'Montant invalide.' }, 400);
    }

    const problem = await verifyEventTx(txSig, actor);
    if (problem === 'TX_NOT_FOUND') {
      // 409 et pas 400 : le client peut réessayer une fois. Refuser
      // définitivement ferait disparaître des événements réels du fil
      // uniquement parce que le RPC n'avait pas fini d'indexer.
      return jsonResponse({ error: 'Transaction pas encore visible on-chain.', code: 'tx_not_found' }, 409);
    }
    if (problem) return jsonResponse({ error: problem }, 403);

    // tx_sig porte une contrainte UNIQUE (voir migration) : rejouer le même
    // événement ne peut pas gonfler artificiellement le fil.
    const { error } = await admin.from('pact_events').insert({
      project_pda: projectPda,
      kind,
      actor,
      amount_sol: amountSol ?? null,
      tx_sig: txSig,
    });
    if (error) {
      // 23505 = doublon sur la contrainte unique. Ce n'est pas une erreur
      // du point de vue de l'appelant : l'événement est déjà journalisé.
      if ((error as { code?: string }).code === '23505') return jsonResponse({ ok: true, duplicate: true });
      console.error('[project-write] event insert:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  }

  // ── Les trois actions suivantes exigent une signature fraîche ──────
  const message = payload.message;
  const signature = payload.signature;
  if (typeof message !== 'string') {
    return jsonResponse({ error: 'Message de signature absent.' }, 400);
  }

  // ══════════════════════════════════════════════════════════════════
  // UPDATE — fil d'avancement
  // ══════════════════════════════════════════════════════════════════
  if (action === 'update') {
    const parsed = UPDATE_RE.exec(message);
    if (!parsed) return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    const [, wallet, signedProject, ts] = parsed;

    if (signedProject !== projectPda) {
      return jsonResponse({ error: 'Signature émise pour un autre projet.' }, 400);
    }
    if (!isFresh(Number(ts))) return jsonResponse({ error: 'Signature expirée — réessaie.' }, 401);
    if (!verifySignatureBytes(wallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    const body = clean(payload.body, MAX_UPDATE_BODY);
    if (!body) return jsonResponse({ error: 'Message vide.' }, 400);
    const link = clean(payload.link, MAX_LINK);
    if (link) {
      try {
        new URL(link);
      } catch {
        return jsonResponse({ error: 'Lien invalide.' }, 400);
      }
    }

    // `author_wallet` vient du wallet PROUVÉ, jamais d'un champ client.
    const { error } = await admin.from('project_updates').insert({
      project_pda: projectPda,
      author_wallet: wallet,
      body,
      link: link || null,
    });
    if (error) {
      console.error('[project-write] update insert:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  }

  // ══════════════════════════════════════════════════════════════════
  // APPLY — candidature sur un rôle ouvert
  // ══════════════════════════════════════════════════════════════════
  if (action === 'apply') {
    const parsed = APPLY_RE.exec(message);
    if (!parsed) return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    const [, wallet, signedProject, ts] = parsed;

    if (signedProject !== projectPda) {
      return jsonResponse({ error: 'Signature émise pour un autre projet.' }, 400);
    }
    if (!isFresh(Number(ts))) return jsonResponse({ error: 'Signature expirée — réessaie.' }, 401);
    if (!verifySignatureBytes(wallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    const roleWanted = clean(payload.roleWanted, MAX_ROLE_WANTED);
    if (!roleWanted) return jsonResponse({ error: 'Rôle manquant.' }, 400);

    const { error } = await admin.from('role_interests').insert({
      project_pda: projectPda,
      role_wanted: roleWanted,
      applicant_wallet: wallet,
      message: clean(payload.applyMessage, MAX_APPLY_MESSAGE),
    });
    if (error) {
      console.error('[project-write] apply insert:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  }

  // ══════════════════════════════════════════════════════════════════
  // MEDIA-UPLOAD-URL — autorise l'upload d'un fichier logo/bannière vers
  // le bucket Storage. Depuis la fermeture des policies publiques sur
  // storage.objects (migration 20260828190000), le client ne peut plus
  // écrire directement au bucket : il doit d'abord obtenir une URL signée
  // ici, prouvant qu'il a le droit d'écrire À CE chemin précis.
  //
  // Même message signé que "media" (MEDIA_RE) — un seul popup wallet sert
  // aux deux appels (upload-url puis media), la signature étant réutilisée
  // telle quelle par l'appelant. Rien n'empêche cette réutilisation : les
  // deux actions sont idempotentes (ré-uploader ou ré-enregistrer la même
  // URL ne change rien), donc rejouer la même signature dans sa fenêtre de
  // fraîcheur (5 min) n'ouvre aucun abus.
  //
  // Le fichier lui-même ne transite JAMAIS par cette fonction — seul le
  // token d'autorisation est émis ici, l'upload part directement du
  // navigateur vers le bucket via supabase.storage.uploadToSignedUrl().
  // ══════════════════════════════════════════════════════════════════
  if (action === 'media-upload-url') {
    const parsed = MEDIA_RE.exec(message);
    if (!parsed) return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    const [, wallet, signedProject, ts] = parsed;

    if (signedProject !== projectPda) {
      return jsonResponse({ error: 'Signature émise pour un autre projet.' }, 400);
    }
    if (!isFresh(Number(ts))) return jsonResponse({ error: 'Signature expirée — réessaie.' }, 401);
    if (!verifySignatureBytes(wallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    const kind = payload.kind;
    if (kind !== 'logo' && kind !== 'banner') {
      return jsonResponse({ error: 'Type de média invalide.' }, 400);
    }
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : '';
    if (!ALLOWED_MEDIA_TYPES.includes(mimeType)) {
      return jsonResponse({ error: 'Format de fichier non autorisé (PNG/JPEG/WebP/GIF uniquement).' }, 400);
    }
    const sizeBytes = Number(payload.sizeBytes);
    const maxBytes = kind === 'logo' ? MAX_LOGO_BYTES : MAX_BANNER_BYTES;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
      return jsonResponse({ error: `Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} Mo).` }, 400);
    }

    // Autorisation : deux cas selon que le projet existe déjà on-chain.
    //  1. Il existe (édition depuis EditMediaModal) → le signataire doit
    //     être project.creator, lu on-chain comme dans l'action "media".
    //  2. Il n'existe pas encore (upload pendant CreatePactWizard, juste
    //     après la transaction createProject mais le compte peut ne pas
    //     être encore visible du RPC) → on prouve autrement, en redérivant
    //     le PDA depuis (wallet, projectId) fourni par le client. Sans ce
    //     deuxième cas, N'IMPORTE QUEL wallet pourrait demander une URL
    //     d'upload pour le PDA d'un projet en cours de création par
    //     quelqu'un d'autre, en devinant son project_id — cette
    //     redérivation ferme exactement ce trou.
    let existingCreator: string | null;
    try {
      existingCreator = await fetchProjectCreator(projectPda);
    } catch {
      return jsonResponse({ error: 'RPC Solana injoignable — réessaie.' }, 503);
    }

    let authorized: boolean;
    if (existingCreator) {
      authorized = existingCreator === wallet;
    } else {
      const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
      if (!projectId) {
        return jsonResponse(
          { error: 'Projet introuvable on-chain — réessaie dans un instant.' },
          409
        );
      }
      try {
        authorized = deriveProjectPda(wallet, projectId) === projectPda;
      } catch {
        return jsonResponse({ error: 'Wallet ou identifiant de projet invalide.' }, 400);
      }
    }
    if (!authorized) {
      return jsonResponse({ error: 'Seul le founder du projet peut uploader ses médias.' }, 403);
    }

    const path = `${projectPda}/${kind}.${extFromMime(mimeType)}`;
    const { data: signedUpload, error: signErr } = await admin.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signErr || !signedUpload) {
      console.error('[project-write] createSignedUploadUrl media error:', signErr?.message);
      return jsonResponse({ error: "Échec de préparation de l'upload — réessaie." }, 500);
    }

    return jsonResponse({ path, token: signedUpload.token });
  }

  // ══════════════════════════════════════════════════════════════════
  // MEDIA — logo / bannière / vidéo / À propos, FOUNDER UNIQUEMENT
  // ══════════════════════════════════════════════════════════════════
  if (action === 'media') {
    const parsed = MEDIA_RE.exec(message);
    if (!parsed) return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    const [, wallet, signedProject, ts] = parsed;

    if (signedProject !== projectPda) {
      return jsonResponse({ error: 'Signature émise pour un autre projet.' }, 400);
    }
    if (!isFresh(Number(ts))) return jsonResponse({ error: 'Signature expirée — réessaie.' }, 401);
    if (!verifySignatureBytes(wallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    // Une signature valide prouve seulement l'identité. Ici il faut aussi
    // l'AUTORISATION : sans ce contrôle, n'importe quel wallet signerait
    // son propre message et remplacerait la bannière d'un projet tiers.
    let creator: string | null;
    try {
      creator = await fetchProjectCreator(projectPda);
    } catch {
      return jsonResponse({ error: 'RPC Solana injoignable — réessaie.' }, 503);
    }
    if (!creator) return jsonResponse({ error: 'Projet introuvable on-chain.' }, 404);
    if (creator !== wallet) {
      return jsonResponse({ error: 'Seul le founder du projet peut modifier ses médias.' }, 403);
    }

    // Construction par liste blanche de champs : un upsert à partir d'un
    // objet client permettrait d'écrire des colonnes non prévues.
    const patch: Record<string, unknown> = {
      project_pda: projectPda,
      updated_at: new Date().toISOString(),
    };
    const fields: Array<[string, string, number]> = [
      ['logoUrl', 'logo_url', MAX_URL],
      ['bannerUrl', 'banner_url', MAX_URL],
      ['pitchVideoUrl', 'pitch_video_url', MAX_URL],
      ['aboutText', 'about_text', MAX_ABOUT],
      ['aboutTextEn', 'about_text_en', MAX_ABOUT],
    ];
    let touched = false;
    for (const [inKey, col, max] of fields) {
      if (!(inKey in payload)) continue; // champ absent = inchangé
      const raw = payload[inKey];
      if (raw === null || raw === '') {
        patch[col] = null; // effacement explicite
      } else {
        patch[col] = clean(raw, max);
      }
      touched = true;
    }
    if (!touched) return jsonResponse({ error: 'Rien à mettre à jour.' }, 400);

    const { error } = await admin
      .from('project_media')
      .upsert(patch, { onConflict: 'project_pda' });
    if (error) {
      console.error('[project-write] media upsert:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Action inconnue.' }, 400);
});
