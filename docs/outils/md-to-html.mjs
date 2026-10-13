// outils/md-to-html.mjs
// ═══════════════════════════════════════════════════════════════════
// Convertit un document Markdown de référence en page HTML autonome.
//
// ⚠️ Pourquoi ce fichier existe : le dossier de présentation, les feuilles de
// route et leurs copies HTML ont divergé — le même contenu vit en .md ET en
// .html, et rien ne garantissait qu'ils disaient la même chose. Ici, une seule
// source par langue : le .md. Le .html en est produit, jamais écrit à la main.
//
// Périmètre volontairement étroit : c'est un convertisseur pour NOS documents,
// pas un parseur Markdown complet. Il couvre ce qu'ils utilisent — titres,
// listes, tableaux, citations, blocs de code, gras, code inline, liens, règles
// horizontales — et rend le reste tel quel plutôt que d'inventer.
//
// Usage :
//   node outils/md-to-html.mjs <source.md> <sortie.html> <lang> "<titre>"
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Mise en forme en ligne. L'échappement passe AVANT : sinon un `<` du texte
 *  deviendrait une balise et le document se casserait au rendu. */
function inline(text) {
  let out = esc(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

export function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // Bloc de code délimité
    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(
        `<pre><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`
      );
      continue;
    }

    // Tableau : une ligne d'en-tête suivie d'un séparateur |---|---|
    if (isTableRow(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        '<table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows
            .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table>'
      );
      continue;
    }

    // Titres
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Règle horizontale
    if (/^\s*---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Citation : les lignes consécutives forment UN paragraphe (un `>` vide en
    // sépare deux). Traiter chaque ligne à part laissait en `**` un gras qui
    // passait à la ligne — le document affichait alors le Markdown brut.
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const paras = [];
      let cur = [];
      for (const l of buf) {
        if (/^\s*$/.test(l)) {
          if (cur.length) paras.push(cur.join(' '));
          cur = [];
        } else cur.push(l.trim());
      }
      if (cur.length) paras.push(cur.join(' '));
      out.push(`<blockquote>${paras.map((p) => `<p>${inline(p)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // Listes à puces. La suite d'un item (ligne suivante non vide, sans
    // marqueur de bloc) lui APPARTIENT : recollée avec une espace, elle se met
    // en forme comme le reste. Sinon la continuation sortait de la liste en
    // paragraphe orphelin, et un gras à cheval sur deux lignes restait en `**`.
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*[-*]\s+/, '');
        i++;
        while (
          i < lines.length &&
          !/^\s*$/.test(lines[i]) &&
          !/^\s*(#{1,4}\s|>|```|[-*]\s|\d+[.)]\s|---+\s*$)/.test(lines[i]) &&
          !isTableRow(lines[i])
        ) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      out.push('<ul>' + items.map((l) => `<li>${inline(l)}</li>`).join('') + '</ul>');
      continue;
    }

    // Listes numérotées. Sans ce cas, des étapes écrites « 1. … 2. … » étaient
    // recollées en UN paragraphe par la règle du dessous : la marche à suivre
    // s'affichait sur une seule ligne, ce qui la rendait illisible.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*\d+[.)]\s+/, '');
        i++;
        while (
          i < lines.length &&
          !/^\s*$/.test(lines[i]) &&
          !/^\s*(#{1,4}\s|>|```|[-*]\s|\d+[.)]\s|---+\s*$)/.test(lines[i]) &&
          !isTableRow(lines[i])
        ) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      out.push('<ol>' + items.map((l) => `<li>${inline(l)}</li>`).join('') + '</ol>');
      continue;
    }

    // Ligne vide
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Paragraphe : jusqu'à la prochaine ligne vide ou bloc
    const buf = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*(#{1,4}\s|>|```|[-*]\s|\d+[.)]\s|---+\s*$)/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  // Les paragraphes vides ne doivent pas créer de trous dans les listes.
  return out.join('\n');
}

/** Page HTML complète pour un Markdown donné. Exportée pour que
 *  `outils/verifier-docs.mjs` régénère EXACTEMENT le même HTML : un contrôle
 *  qui réimplémenterait la conversion pourrait diverger du générateur et
 *  valider une sortie fausse. Une seule fonction, deux appelants. */
export function buildHtml(md, { lang = 'fr', title = 'BuildPact', source = '?' } = {}) {
  const body = mdToHtml(md);
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${esc(title)}">
<title>${esc(title)}</title>
<style>
:root{--bg:#f7f6f3;--panel:#fff;--ink:#131318;--ink2:#55555f;--ink3:#6f6f7a;--line:#e4e2dc;--accent:#4c21c4;--ok:#0e8a5f;--warn:#b7791f;--err:#c13b58}
@media (prefers-color-scheme: dark){:root{--bg:#0d0f14;--panel:#151821;--ink:#eceef4;--ink2:#a7adbd;--ink3:#7b8296;--line:#262b36;--accent:#a78bfa;--ok:#34d399;--warn:#f0b95c;--err:#ff7a92}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:-.01em}
main{max-width:900px;margin:0 auto;padding:36px 22px 90px}
h1{font-size:clamp(26px,4.6vw,38px);line-height:1.15;letter-spacing:-.03em;margin:0 0 6px}
h2{font-size:22px;letter-spacing:-.02em;margin:38px 0 10px;padding-top:14px;border-top:1px solid var(--line)}
h3{font-size:17px;margin:24px 0 8px}
p{margin:10px 0}
a{color:var(--accent)}
code{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:1px 6px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word}
pre{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow:auto}
pre code{background:none;border:0;padding:0;font-size:12.5px}
blockquote{margin:16px 0;padding:12px 16px;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px}
blockquote p{margin:4px 0;color:var(--ink2)}
ul{margin:10px 0;padding-left:20px}
ol{margin:10px 0;padding-left:22px}
li{margin:4px 0}
hr{border:0;border-top:1px solid var(--line);margin:26px 0}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);font-weight:600}
tr:last-child td{border-bottom:0}
footer{max-width:900px;margin:0 auto;padding:0 22px 40px;color:var(--ink3);font-size:12px}
</style>
</head>
<body>
<main>
${body}
</main>
<footer>Généré depuis ${esc(source)} par outils/md-to-html.mjs — ne pas modifier ce fichier à la main.</footer>
</body>
</html>
`;
}

// ─── Exécution en ligne de commande ───────────────────────────────────────
// Importé par le vérificateur, ce fichier ne doit rien écrire : on ne lance la
// conversion que si c'est LUI qui est exécuté (chemin exact, pas une fin de
// chaîne — un sous-dossier homonyme ferait écrire au mauvais moment).
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , src, dest, lang = 'fr', title = 'BuildPact'] = process.argv;
  if (!src || !dest) {
    console.error('usage: node outils/md-to-html.mjs <source.md> <sortie.html> <lang> "<titre>"');
    process.exit(2);
  }
  const html = buildHtml(readFileSync(src, 'utf8'), { lang, title, source: src });
  writeFileSync(dest, html, 'utf8');
  console.log(`✓ ${dest} (${html.length} octets) depuis ${src}`);
}
