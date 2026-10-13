// scripts/keys-check.mjs
// ═══════════════════════════════════════════════════════════════════
// Inventaire et VÉRIFICATION des clés du projet.
//
// Usage : node scripts/keys-check.mjs
//
// Ce que ça résout concrètement : un fichier de keypair est un simple
// tableau de 64 octets. Rien, en le regardant, ne dit à quelle adresse il
// correspond. On peut donc parfaitement déployer avec la mauvaise clé et ne
// s'en apercevoir qu'au moment où `anchor upgrade` répond « authority
// mismatch » — c'est-à-dire trop tard, en pleine démo.
//
// Le script dérive l'adresse réelle de chaque keypair trouvé et la compare
// à l'upgrade authority attendue.
//
// ⚠️ Ces fichiers contiennent des CLÉS PRIVÉES. RÈGLE : aucune clé privée
// n'est jamais committée (voir .gitignore). Les keypairs devnet vivent en
// local, hors dépôt, et leur chemin est fourni par variables d'environnement
// (voir .env.example). Toute clé autrefois rendue publique via Git doit être
// considérée comme compromise : la régénérer, jamais la réutiliser.
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';

const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';

// Valeurs attendues — source de vérité : Anchor.toml + src/lib/constants.ts.
const EXPECTED_AUTHORITY = '8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6';
const EXPECTED_PROGRAM_ID = '9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ';

// Chemins des keypairs, configurables par variables d'environnement.
//
// `contracts/target/wallet/wallet.json` a été RETIRÉ du dépôt
// (il contenait une clé privée publiée dans l'historique Git). Le fichier
// peut toujours exister en local — il est ignoré par git — mais son
// emplacement ne doit plus être codé en dur : chaque machine (dev, CI) le
// fournit via BUILDPACT_KEYPAIR_DIR.
//
//   BUILDPACT_KEYPAIR_DIR       dossier des keypairs de travail
//                               (défaut : contracts/target/wallet)
//   BUILDPACT_PROGRAM_KEYPAIR   keypair du PROGRAMME (défaut :
//                               contracts/target/deploy/workspace-keypair.json)
const KEYPAIR_DIR = process.env.BUILDPACT_KEYPAIR_DIR ?? 'contracts/target/wallet';
const KEYPAIRS = [
  `${KEYPAIR_DIR}/wallet.json`,
  `${KEYPAIR_DIR}/id.json`,
  // Keypair du PROGRAMME. Absente du dépôt, et c'est sans gravité : elle
  // n'est requise que pour le PREMIER déploiement à une adresse donnée. Un
  // upgrade du programme existant ne demande que l'upgrade authority.
  // Elle ne peut pas être reconstruite — si un jour un déploiement à une
  // adresse neuve est nécessaire, ce sera un nouveau program ID, donc une
  // migration des comptes existants.
  process.env.BUILDPACT_PROGRAM_KEYPAIR ?? 'contracts/target/deploy/workspace-keypair.json',
];

const IDLS = ['src/idl/buildpact.json', 'contracts/target/idl/workspace.json'];

function ok(m) { console.log(`  ✓ ${m}`); }
function bad(m) { console.log(`  ✗ ${m}`); }
function info(m) { console.log(`    ${m}`); }

function loadKeypair(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw) || (raw.length !== 64 && raw.length !== 32)) {
    throw new Error(`format inattendu (${Array.isArray(raw) ? raw.length : typeof raw} octets)`);
  }
  return raw.length === 64
    ? Keypair.fromSecretKey(Uint8Array.from(raw))
    : Keypair.fromSeed(Uint8Array.from(raw));
}

async function main() {
  console.log('\n── Keypairs ───────────────────────────────────────────');
  let authorityFound = false;

  for (const path of KEYPAIRS) {
    if (!existsSync(path)) {
      info(`${path} — absent`);
      continue;
    }
    try {
      const kp = loadKeypair(path);
      const addr = kp.publicKey.toBase58();
      if (addr === EXPECTED_AUTHORITY) {
        ok(`${path} → ${addr} (upgrade authority attendue)`);
        authorityFound = true;
      } else {
        bad(`${path} → ${addr}`);
        info(`attendu : ${EXPECTED_AUTHORITY}`);
      }
    } catch (e) {
      bad(`${path} — illisible : ${e.message}`);
    }
  }

  if (!authorityFound) {
    bad("aucun fichier ne correspond à l'upgrade authority — un upgrade échouerait");
  }

  console.log('\n── IDL ────────────────────────────────────────────────');
  for (const path of IDLS) {
    if (!existsSync(path)) {
      bad(`${path} — absent`);
      continue;
    }
    const idl = JSON.parse(readFileSync(path, 'utf8'));
    const addrOk = idl.address === EXPECTED_PROGRAM_ID;
    // Coquille historique : une version de l'IDL portait "instructaions".
    // Anchor n'aurait alors construit AUCUNE instruction, sans lever
    // d'erreur au chargement — les appels échouaient plus loin, avec un
    // message sans rapport.
    const hasIx = Array.isArray(idl.instructions) && idl.instructions.length > 0;
    if (addrOk && hasIx) {
      ok(`${path} — ${idl.instructions.length} instruction(s), address correcte`);
    } else {
      if (!addrOk) bad(`${path} — address ${idl.address} ≠ ${EXPECTED_PROGRAM_ID}`);
      if (!hasIx) bad(`${path} — aucune instruction (clé "instructions" absente ou vide ?)`);
    }
  }

  console.log('\n── On-chain ───────────────────────────────────────────');
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(EXPECTED_PROGRAM_ID);
  const acc = await connection.getAccountInfo(programId);
  if (!acc) {
    bad(`programme introuvable sur ${RPC_URL}`);
    return;
  }
  ok(`programme déployé, exécutable : ${acc.executable}`);

  const BPF = 'BPFLoaderUpgradeab1e11111111111111111111111';
  if (acc.owner.toBase58() === BPF) {
    const programData = new PublicKey(acc.data.subarray(4, 36));
    const pd = await connection.getAccountInfo(programData);
    if (pd) {
      const hasAuthority = pd.data[12] === 1;
      const authority = hasAuthority ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : null;
      if (!authority) {
        bad('AUCUNE upgrade authority — le programme est figé définitivement');
      } else if (authority === EXPECTED_AUTHORITY) {
        ok(`upgrade authority on-chain = ${authority}`);
      } else {
        bad(`upgrade authority on-chain = ${authority}, attendue ${EXPECTED_AUTHORITY}`);
      }
    }
  }
  console.log('');
}

main().catch((e) => {
  console.error(`\nÉchec : ${e.message}\n`);
  process.exit(1);
});
