// scripts/banner-containment.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de source : l'image de bannière ne doit JAMAIS recouvrir le
// contenu d'une carte ou d'une fiche.
//
// Pourquoi ce test existe — bug du 20/10/2026, sur la fiche d'un pact
// (#/pact/<pda>) : le titre du pact, sa description et le bloc
// vault/membres étaient INVISIBLES. La bannière ne les effaçait pas —
// l'image les passait dessous.
//
// Le mécanisme : `bannerImageStyle()` renvoie
//   { position:'absolute', inset:0, width:'100%', height:'100%' }
// (voir src/pages/premium/projectCardMedia.ts). Une image en `absolute`
// est dimensionnée sur son BLOC DE RÉFÉRENCE, c'est-à-dire le plus proche
// ancêtre positionné. Si le conteneur de bannière est `position: static`,
// le bloc de référence remonte jusqu'à la carte (qui est en
// `position: relative`) : l'image couvre alors TOUTE la carte, et
// `overflow: hidden` sur le conteneur de bannière ne la découpe pas
// (la découpe ne s'applique qu'aux descendants dont le bloc de référence
// est le conteneur lui-même ou l'un de ses descendants).
//
// Le correctif tient en une ligne : le conteneur de bannière doit être
// `position: relative`. Les cartes l'ont depuis le 08/10 ; la fiche pact
// l'avait oublié.
//
// Ce test lit les SOURCES (pas le DOM) : il vérifie que tout conteneur
// qui héberge `bannerImageStyle()` est lui-même positionné. C'est le bug
// qui se réintroduit le plus facilement — il suffit de recopier un bloc.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

/** Tous les fichiers .tsx qui utilisent bannerImageStyle(). */
function consumers(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.tsx')) out.push(p);
    }
  };
  walk(SRC);
  return out.filter((f) => readFileSync(f, 'utf8').includes('bannerImageStyle('));
}

/**
 * Extrait le style inline du conteneur qui enveloppe l'image de bannière.
 * On remonte depuis l'appel `bannerImageStyle()` jusqu'au `style={{` le
 * plus proche en amont, et on lit le bloc `position: ...` s'il y en a un.
 */
function bannerContainerStyle(src: string): { hasPosition: boolean; position: string | null } {
  const call = src.indexOf('bannerImageStyle(');
  assert.ok(call > 0, 'appel bannerImageStyle() introuvable');
  const before = src.slice(0, call);
  // Le style du conteneur est le dernier `style={{` avant l'appel.
  const styleStart = before.lastIndexOf('style={{');
  assert.ok(styleStart > 0, 'style du conteneur de bannière introuvable');
  // On va jusqu'à la balise qui ferme ce style (le `}}` suivant).
  const styleEnd = src.indexOf('}}', styleStart);
  const block = src.slice(styleStart, styleEnd === -1 ? styleStart + 400 : styleEnd);
  const m = block.match(/position:\s*'([^']+)'/);
  return { hasPosition: m !== null, position: m ? m[1] : null };
}

test('toute bannière (image en absolute) est.clipée par son conteneur', () => {
  const files = consumers();
  assert.ok(files.length > 0, 'aucun consommateur de bannerImageStyle() trouvé');
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const { hasPosition, position } = bannerContainerStyle(src);
    const label = file.replace(process.cwd() + '/', '');
    assert.ok(
      hasPosition && position === 'relative',
      `${label} : le conteneur de bannière doit être position: 'relative' ` +
        `(trouvé : ${hasPosition ? position : 'aucune propriété position'}). ` +
        `Sans cela, l'image en position:absolute s'étale sur toute la carte ` +
        `et recouvre le titre, la description et les chiffres.`,
    );
  }
});

test('bannerImageStyle() reste en position absolute (invariant du mechanism)', () => {
  const media = readFileSync(
    join(SRC, 'pages', 'premium', 'projectCardMedia.ts'),
    'utf8',
  );
  assert.match(media, /position:\s*'absolute'/, "bannerImageStyle() doit rester en absolute");
  assert.match(media, /inset:\s*0/, "bannerImageStyle() doit rester en inset: 0");
});
