// src/lib/textSafety.ts
// ═══════════════════════════════════════════════════════════════════
// Bug #1 (trouvé le 22/08) : le programme Anchor vérifie les longueurs de
// chaînes (title, description, role, project_id) en OCTETS UTF-8
// (String::len() en Rust), alors que le frontend tronquait avec
// str.slice(0, N) — qui compte des UNITÉS UTF-16, pas des octets.
// Un accent (é, ç, ô...) ou un emoji passe pour "1 caractère" en JS
// mais pèse 2 à 4 octets en UTF-8. Résultat : une description ou un
// titre qui semblait "sous la limite" côté frontend dépassait la vraie
// limite on-chain → require!() échouait avec InvalidParameter (erreur
// 6005), et Phantom affichait un "échec de simulation" + redemandait
// une signature à chaque nouvelle tentative de retry.
//
// Bug #2 (trouvé le 22/08, RÉCIDIVE du même symptôme 6005 après le fix
// ci-dessus) : le premier correctif ne reculait que sur les octets de
// CONTINUATION (10xxxxxx) en fin de découpe. Mais si la coupe tombait
// pile sur un octet de DÉBUT ("lead byte") d'un caractère multi-octets
// SANS aucune continuation derrière (ex : un emoji 4 octets 🔥 = F0 9F 94
// A5, coupé après 2 octets → il reste F0 9F ; 9F est une continuation
// donc stripée, mais F0 seul reste et N'EST PAS une continuation → la
// boucle s'arrêtait là, en laissant un lead byte orphelin). Un lead byte
// seul est de l'UTF-8 invalide : TextDecoder le remplace par U+FFFD (le
// caractère de remplacement, qui pèse 3 octets une fois ré-encodé) — ce
// qui repassait AU-DESSUS de maxBytes et redéclenchait le 6005 malgré la
// troncature. Le fix : détecter la séquence multi-octets en cours à la
// coupe et l'exclure ENTIÈREMENT si elle est incomplète, plutôt que de
// ne retirer que les octets de continuation un par un.
// ═══════════════════════════════════════════════════════════════════

/**
 * Tronque `input` pour qu'il ne dépasse jamais `maxBytes` une fois encodé
 * en UTF-8 — sans jamais couper un caractère multi-octets au milieu (et
 * sans laisser de lead byte orphelin qui gonflerait le résultat via un
 * caractère de remplacement U+FFFD, voir bug #2 ci-dessus).
 */
export function truncateUtf8(input: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(input);
  if (bytes.length <= maxBytes) return input;

  let cut = maxBytes;
  // Recule jusqu'à l'octet de DÉBUT du dernier caractère présent dans la
  // fenêtre [0, cut) — ASCII (0xxxxxxx) ou lead byte (11xxxxxx). Tant que
  // bytes[i] est un octet de continuation (10xxxxxx), on est encore au
  // milieu d'une séquence commencée avant `i`.
  let i = cut - 1;
  while (i > 0 && (bytes[i] & 0xc0) === 0x80) i--;

  // Longueur attendue de la séquence UTF-8 qui commence à `i`.
  const lead = bytes[i];
  let seqLen = 1;
  if ((lead & 0x80) === 0x00) seqLen = 1; // ASCII
  else if ((lead & 0xe0) === 0xc0) seqLen = 2;
  else if ((lead & 0xf0) === 0xe0) seqLen = 3;
  else if ((lead & 0xf8) === 0xf0) seqLen = 4;

  // Si la séquence commencée en `i` ne tient pas entièrement avant `cut`,
  // elle est incomplète — on l'exclut en totalité (on ne garde rien à
  // partir de `i`), plutôt que de risquer un lead byte orphelin.
  if (i + seqLen > cut) cut = i;

  return new TextDecoder('utf-8').decode(bytes.slice(0, cut));
}

/** Longueur en octets UTF-8 d'une chaîne (ce que voit vraiment le programme Rust). */
export function utf8ByteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}
