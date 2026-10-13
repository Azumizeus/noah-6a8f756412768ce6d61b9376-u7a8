// scripts/idl-check.mjs
// ═══════════════════════════════════════════════════════════════════
// Vérifie que src/idl/buildpact.json décrit bien le programme DÉPLOYÉ,
// et que les bornes de src/lib/onchainLimits.ts correspondent au binaire
// réellement en ligne.
//
// Usage : node scripts/idl-check.mjs
//         RPC_URL=https://... node scripts/idl-check.mjs
//         VERBOSE=1 node scripts/idl-check.mjs      (logs de simulation)
//
// ── Pourquoi ce script existe ──────────────────────────────────────
// Le champ "address" de l'IDL est purement DÉCLARATIF : on peut l'éditer à
// la main sans que le reste du fichier bouge. Un IDL peut donc porter la
// bonne adresse tout en décrivant une version périmée du programme. Rien
// ne le signale au build — ça casse au moment de signer, avec un message
// illisible.
//
// Symétriquement, `PROGRAM_UPGRADED` dans onchainLimits.ts est un booléen
// écrit à la main. S'il est optimiste, le formulaire accepte jusqu.a 800 octets de
// description et l'utilisateur se prend un InvalidParameter (6005) APRÈS
// avoir tout rempli.
//
// Ces deux fichiers ne peuvent pas se vérifier l'un l'autre : ils peuvent
// parfaitement être cohérents entre eux et faux tous les deux. Seule la
// chaîne fait foi — d'où ce script.
//
// ── Ce qu'il fait ──────────────────────────────────────────────────
//   1. le compte programme existe, est exécutable, depuis quel slot,
//      avec quelle upgrade authority ;
//   2. le discriminant de compte Project décode bien les comptes réels ;
//   3. l'instruction update_description EXISTE-t-elle on-chain
//      (marqueur du build du 27/08) ;
//   4. quelle est la VRAIE valeur de MAX_DESC_LEN on-chain — testée, pas
//      déduite de la présence d'une instruction ;
//   5. verdict comparé à onchainLimits.ts.
//
// Tout se fait par SIMULATION : aucune transaction n'est envoyée, aucun
// compte n'est modifié, aucune clé privée n'est nécessaire.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';

const idl = JSON.parse(readFileSync(new URL('../src/idl/buildpact.json', import.meta.url)));
const limitsSrc = readFileSync(new URL('../src/lib/onchainLimits.ts', import.meta.url), 'utf8');

const PROGRAM_ID = new PublicKey(idl.address);
const BPF_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

/**
 * Longueur de description utilisée pour sonder la borne réelle.
 * Doit être STRICTEMENT entre l'ancienne borne (280) et la nouvelle (500) :
 * c'est ce qui rend le test discriminant. 400 laisse une marge confortable
 * des deux côtés.
 */
const PROBE_DESC_LEN = 400;
const OLD_DESC_LEN = 280;
const NEW_DESC_LEN = 800;

function ok(m) { console.log(`  \u2713 ${m}`); }
function bad(m) { console.log(`  \u2717 ${m}`); }
function warn(m) { console.log(`  ! ${m}`); }
function info(m) { console.log(`    ${m}`); }

/** Discriminant Anchor : 8 premiers octets de sha256("global:<nom_snake_case>"). */
function ixDiscriminator(name) {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

/** Encode une String Borsh : 4 octets de longueur (LE) + octets UTF-8. */
function borshString(s) {
  const bytes = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function bs58Encode(buf) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = [0];
  for (const byte of buf) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (const byte of buf) {
    if (byte === 0) out += '1';
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

/**
 * Décode un compte Project en suivant le layout Borsh.
 *
 * Les String sont sérialisées en [4 octets de longueur][octets] : les champs
 * ne sont donc PAS à offsets fixes et il faut marcher la structure. C'est
 * précisément pour ça qu'on ne peut pas se contenter d'un `subarray` figé
 * au-delà de `creator`.
 *
 * Ordre des champs (cf. idl.types.Project) :
 *   creator pubkey | project_id string | title string | description string
 *   | members vec<Member> | status enum | protocol_wallet pubkey | bump u8
 */
function decodeProject(data) {
  let o = 8; // discriminant de compte
  const creator = new PublicKey(data.subarray(o, o + 32)); o += 32;

  const readStr = () => {
    const len = data.readUInt32LE(o); o += 4;
    const s = data.subarray(o, o + len).toString('utf8'); o += len;
    return s;
  };

  const projectId = readStr();
  const title = readStr();
  const description = readStr();

  const memberCount = data.readUInt32LE(o); o += 4;
  const members = [];
  for (let i = 0; i < memberCount; i++) {
    const wallet = new PublicKey(data.subarray(o, o + 32)); o += 32;
    const role = readStr();
    const shareBps = data.readUInt16LE(o); o += 2;
    const approved = data[o] === 1; o += 1;
    members.push({ wallet, role, shareBps, approved });
  }

  const status = data[o] === 0 ? 'Open' : 'Finalized'; o += 1;

  return { creator, projectId, title, description, members, status };
}

/** Extrait le code d'erreur custom Anchor d'un résultat de simulation. */
function customErrorCode(sim) {
  const err = sim.value.err;
  // Forme : { InstructionError: [0, { Custom: 6005 }] }
  const inner = err?.InstructionError?.[1];
  if (inner && typeof inner === 'object' && 'Custom' in inner) return inner.Custom;
  return null;
}

function errorName(code) {
  if (code === 101) return 'InstructionFallbackNotFound (instruction inconnue du programme)';
  if (code === 2001) return 'ConstraintHasOne (le signataire n\'est pas le creator)';
  if (code === 2006) return 'ConstraintSeeds (PDA incorrect)';
  const e = idl.errors?.find((x) => x.code === code);
  return e ? `${e.name} — ${e.msg}` : `code inconnu ${code}`;
}

/** Simule une instruction update_description avec la description donnée. */
async function simulateUpdateDescription(connection, projectPubkey, creatorPubkey, description) {
  const data = Buffer.concat([
    ixDiscriminator('update_description'),
    borshString(description),
  ]);

  // Les trois comptes attendus, dans l'ordre de l'IDL. Fournir la liste
  // complète évite de confondre « instruction absente » avec « il manque
  // un compte » : ces deux cas remontent des erreurs différentes, mais
  // autant ne pas s'en remettre à cette subtilité.
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: projectPubkey, isSigner: false, isWritable: true },
      { pubkey: creatorPubkey, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: creatorPubkey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();

  // sigVerify: false → aucune clé privée nécessaire. On ne lit que le motif
  // de l'échec, jamais un résultat écrit.
  return connection.simulateTransaction(new VersionedTransaction(msg), {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
}

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log(`\nRPC         : ${RPC_URL}`);
  console.log(`IDL address : ${idl.address}`);
  console.log(`IDL         : ${idl.metadata?.name} v${idl.metadata?.version}`);
  console.log(`Instructions: ${idl.instructions.map((i) => i.name).join(', ')}\n`);

  // ── 1. Le programme existe-t-il, et depuis quand ? ────────────────
  console.log('1. Compte programme');
  const programInfo = await connection.getAccountInfo(PROGRAM_ID);
  if (!programInfo) {
    bad("le programme n'existe pas à cette adresse (fermé, ou mauvais cluster)");
    process.exit(1);
  }
  if (!programInfo.executable) {
    bad("le compte existe mais n'est pas exécutable");
    process.exit(1);
  }
  ok(`déployé, owner ${programInfo.owner.toBase58()}`);

  if (programInfo.owner.equals(BPF_UPGRADEABLE)) {
    // Layout ProgramAccount : [4 octets d'enum][32 octets programdata address]
    const programDataAddr = new PublicKey(programInfo.data.subarray(4, 36));
    const pd = await connection.getAccountInfo(programDataAddr);
    if (pd) {
      // Layout ProgramData : [4 enum][8 slot][1 option authority][32 authority]
      const slot = Number(pd.data.readBigUInt64LE(4));
      const hasAuthority = pd.data[12] === 1;
      const authority = hasAuthority
        ? new PublicKey(pd.data.subarray(13, 45)).toBase58()
        : null;
      info(`dernier déploiement au slot ${slot}`);
      info(`upgrade authority : ${authority ?? 'AUCUNE (programme figé définitivement)'}`);
      info(`taille du binaire : ${pd.data.length} octets`);

      // Le slot seul ne dit rien d'exploitable ; on le convertit en date.
      try {
        const ts = await connection.getBlockTime(slot);
        if (ts) info(`soit le ${new Date(ts * 1000).toISOString()}`);
      } catch {
        info('(date du slot indisponible — le RPC a pu élaguer ce bloc)');
      }
    }
  }

  // ── 2. Le discriminant de compte Project est-il le bon ? ──────────
  console.log('\n2. Discriminant du compte Project');
  const projectDisc = Buffer.from(idl.accounts.find((a) => a.name === 'Project').discriminator);
  const projectAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58Encode(projectDisc) } }],
  });
  const allAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    dataSlice: { offset: 0, length: 0 },
  });

  if (projectAccounts.length > 0) {
    ok(`${projectAccounts.length} compte(s) Project décodable(s) sur ${allAccounts.length}`);
  } else if (allAccounts.length === 0) {
    info('aucun compte détenu par le programme (programme vierge) — rien à vérifier');
  } else {
    bad(`0 compte Project alors que le programme en détient ${allAccounts.length}`);
    bad("→ le discriminant de l'IDL ne correspond pas au programme déployé");
  }

  // ── 3 & 4. Sondes on-chain ────────────────────────────────────────
  console.log('\n3. Instruction update_description (marqueur du build du 27/08)');
  const inIdl = idl.instructions.some((i) => i.name === 'update_description');
  info(`présente dans le fichier IDL : ${inIdl ? 'OUI' : 'NON'}`);

  // On cherche un compte Project au statut Open : `update_description`
  // refuse les projets finalisés (AlreadyFinalized), ce qui masquerait le
  // test de la borne à l'étape 4.
  let probe = null;
  for (const acc of projectAccounts) {
    try {
      const decoded = decodeProject(acc.account.data);
      if (decoded.status === 'Open') {
        probe = { pubkey: acc.pubkey, ...decoded };
        break;
      }
    } catch {
      // Compte illisible avec ce layout : soit l'IDL est périmé, soit le
      // compte est d'une version antérieure. On passe au suivant.
    }
  }

  let deployedHasUpdate = null;
  let deployedDescLimit = null;

  if (!probe) {
    warn('aucun compte Project au statut Open — sondes on-chain impossibles');
    info('crée un pact sur devnet puis relance ce script pour un verdict complet');
  } else {
    info(`compte sondé : ${probe.pubkey.toBase58()}`);
    info(`creator      : ${probe.creator.toBase58()}`);
    info(`description  : ${Buffer.byteLength(probe.description, 'utf8')} octets actuellement`);

    // ── 3. Présence de l'instruction ────────────────────────────────
    // Une description d'1 octet passe toutes les bornes imaginables : si
    // ça échoue en 101, c'est que le dispatcher ne connaît pas
    // l'instruction, donc que le binaire est antérieur au 27/08.
    const simPresence = await simulateUpdateDescription(
      connection, probe.pubkey, probe.creator, 'x'
    );
    const presenceCode = customErrorCode(simPresence);
    if (process.env.VERBOSE) {
      console.log('\n--- logs sonde présence ---\n' + (simPresence.value.logs ?? []).join('\n'));
    }

    if (presenceCode === 101) {
      deployedHasUpdate = false;
      bad("ABSENTE du programme déployé → c'est l'ancien build (avant 27/08)");
    } else {
      deployedHasUpdate = true;
      ok('PRÉSENTE dans le programme déployé → build du 27/08 en ligne');
      if (presenceCode !== null) {
        info(`(la simulation échoue en aval, c'est normal : ${errorName(presenceCode)})`);
      }
    }

    // ── 4. Borne réelle de la description ───────────────────────────
    console.log(`\n4. MAX_DESC_LEN réel on-chain (sonde à ${PROBE_DESC_LEN} octets)`);
    if (deployedHasUpdate === false) {
      info('instruction absente — borne non sondable par cette voie');
      info(`déduction : le binaire est l'ancien, donc MAX_DESC_LEN = ${OLD_DESC_LEN}`);
      deployedDescLimit = OLD_DESC_LEN;
    } else {
      // `require!(description.len() <= MAX_DESC_LEN)` est la PREMIÈRE ligne
      // du handler, avant même le contrôle de statut. Une réponse 6005 sur
      // 400 octets prouve donc que la borne déployée est inférieure à 400.
      const simLimit = await simulateUpdateDescription(
        connection, probe.pubkey, probe.creator, 'x'.repeat(PROBE_DESC_LEN)
      );
      const limitCode = customErrorCode(simLimit);
      if (process.env.VERBOSE) {
        console.log('\n--- logs sonde borne ---\n' + (simLimit.value.logs ?? []).join('\n'));
      }

      const invalidParameter = idl.errors.find((e) => e.name === 'InvalidParameter')?.code ?? 6005;
      if (limitCode === invalidParameter) {
        deployedDescLimit = OLD_DESC_LEN;
        bad(`${PROBE_DESC_LEN} octets REFUSÉS (InvalidParameter) → borne déployée < ${PROBE_DESC_LEN}`);
        info(`c'est l'ancienne borne : ${OLD_DESC_LEN} octets`);
      } else if (limitCode === null && !simLimit.value.err) {
        deployedDescLimit = NEW_DESC_LEN;
        ok(`${PROBE_DESC_LEN} octets ACCEPTÉS → borne déployée ≥ ${PROBE_DESC_LEN} (${NEW_DESC_LEN})`);
      } else {
        // Échec pour une autre raison (fonds du creator, contrainte…).
        // On ne conclut PAS : un verdict inventé ici serait pire que pas
        // de verdict, puisqu'il servirait à décider du drapeau.
        warn(`résultat non concluant : ${limitCode !== null ? errorName(limitCode) : JSON.stringify(simLimit.value.err)}`);
        info('relance avec VERBOSE=1 pour voir les logs complets');
      }
    }
  }

  // ── 5. Verdict vs onchainLimits.ts ────────────────────────────────
  console.log('\n5. Cohérence avec src/lib/onchainLimits.ts');
  const flagMatch = /export const PROGRAM_UPGRADED\s*=\s*(true|false)/.exec(limitsSrc);
  const flag = flagMatch ? flagMatch[1] === 'true' : null;

  if (flag === null) {
    warn('impossible de lire PROGRAM_UPGRADED (le fichier a-t-il changé de forme ?)');
  } else {
    info(`PROGRAM_UPGRADED = ${flag}`);
    info(`le front enverra donc jusqu'à ${flag ? NEW_DESC_LEN : OLD_DESC_LEN} octets de description`);

    if (deployedDescLimit === null) {
      warn('borne on-chain indéterminée — verdict impossible, ne touche pas au drapeau');
    } else if (flag === (deployedDescLimit === NEW_DESC_LEN)) {
      ok('COHÉRENT — le front et le programme déployé sont alignés');
    } else if (flag && deployedDescLimit === OLD_DESC_LEN) {
      bad('INCOHÉRENT ET DANGEREUX — le front autorise plus que le programme');
      info(`→ l'utilisateur remplira jusqu'à ${NEW_DESC_LEN} octets puis échouera en 6005 au moment de signer`);
      info('→ correctif immédiat : PROGRAM_UPGRADED = false, puis planifier l\'upgrade');
    } else {
      warn('INCOHÉRENT mais sans danger — le programme accepte plus que le front n\'envoie');
      info(`→ PROGRAM_UPGRADED peut passer à true pour débloquer ${NEW_DESC_LEN} octets`);
    }

    if (deployedHasUpdate !== null && flag !== deployedHasUpdate) {
      bad(`CAN_UPDATE_DESCRIPTION = ${flag} alors que l'instruction est ${deployedHasUpdate ? 'présente' : 'ABSENTE'} on-chain`);
      if (flag && !deployedHasUpdate) {
        info('→ MigratePactButton s\'affiche et échouera : instruction inconnue du programme');
      }
    }
  }

  console.log('');
}

main().catch((err) => {
  console.error(`\nÉchec : ${err.message}\n`);
  process.exit(1);
});
