// Vérifie la connectivité RPC sans passer par la CLI Solana.
// Usage : node scripts/rpc-check.mjs [adresse]
//
// La CLI locale émet une requête HTTP malformée (ligne "POST /" sans
// version HTTP), ce qui provoque un 400 sur tous les fournisseurs RPC.
// Node utilise sa propre stack HTTP et n'est pas affecté.

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`RPC ${json.error.code}: ${json.error.message}`);
  }
  return json.result;
}

async function main() {
  const address = process.argv[2];

  console.log(`RPC      : ${RPC_URL}`);

  const version = await rpc("getVersion");
  console.log(`Version  : ${version["solana-core"]}`);

  const slot = await rpc("getSlot");
  console.log(`Slot     : ${slot}`);

  if (address) {
    const { value } = await rpc("getBalance", [address]);
    console.log(`Adresse  : ${address}`);
    console.log(`Solde    : ${value / 1_000_000_000} SOL`);
  } else {
    console.log("\nAstuce : passe une adresse en argument pour voir le solde.");
  }

  console.log("\nConnectivité RPC OK.");
}

main().catch((err) => {
  console.error(`\nÉchec : ${err.message}`);
  process.exit(1);
});
