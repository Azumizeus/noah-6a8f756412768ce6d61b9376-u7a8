import { base58 } from '@scure/base';

/** Decode one of the explicitly supported x402 key formats without guessing. */
export function decodeSvmKey(value, source) {
  let bytes;
  if (source === 'base58') {
    bytes = base58.decode(String(value).trim());
  } else if (source === 'keypair-json') {
    const candidate = Array.isArray(value) ? value : value?.secretKey ?? value?.privateKey;
    if (!(Array.isArray(candidate) || candidate instanceof Uint8Array)) {
      throw new TypeError('Le fichier keypair doit contenir un tableau d’octets.');
    }
    if (Array.from(candidate).some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      throw new TypeError('Le fichier keypair contient un octet invalide.');
    }
    bytes = Uint8Array.from(candidate);
  } else {
    throw new TypeError(`Format de clé non pris en charge : ${source}`);
  }

  if (bytes.length !== 32 && bytes.length !== 64) {
    throw new RangeError(`Clé de ${bytes.length} octets — 32 (seed) ou 64 (secretkey) attendus.`);
  }
  return bytes;
}
