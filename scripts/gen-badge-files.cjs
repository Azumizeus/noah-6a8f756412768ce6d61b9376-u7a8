const fs = require('fs');
const html = fs.readFileSync('preview-badge-kit/demo.html', 'utf8');
const mV = html.match(/const vignettes = (\[[\s\S]*?\]);/);
if (!mV) { console.error('vignettes introuvables'); process.exit(1); }
const vignettes = eval(mV[1]);
const mB = html.match(/const badge = \(href\) => `([\s\S]*?)`;/);
const mD = html.match(/const doc = \(attributs, coque\) => `([\s\S]*?)`;/);
if (!mB || !mD) { console.error('badge/doc introuvables'); process.exit(1); }
const badgeTpl = mB[1];
const docTpl = mD[1];
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
fs.mkdirSync('preview-badge-kit/badges', { recursive: true });
const rows = [];
for (const v of vignettes) {
  const premium = v.a.includes('data-appearance');
  const coque = premium
    ? '<div class="p-page" style="height:150px"></div>'
    : '<div style="height:150px;background:rgb(var(--canvas-900-rgb))"></div>';
  const badgeHtml = badgeTpl.split('${href}').join('#/about');
  let out = docTpl.split("${badge('#/about')}").join(badgeHtml);
  out = out.split('${attributs}').join(v.a);
  out = out.split('${coque}').join(coque);
  out = out.replace(/@tailwind [^;]+;/g, '');
  if (out.includes('${')) { console.error('INTERPOLATION RESTANTE dans', v.t); process.exit(1); }
  const f = 'preview-badge-kit/badges/' + slug(v.t) + '.html';
  out = out.replace('</body></html>', '<!-- vignette: ' + v.t + ' | attributs: ' + v.a + ' --></body></html>');
  fs.writeFileSync(f, out);
  rows.push('| ' + v.t + ' | ' + f.split('/').pop() + ' |');
  console.log(f);
}
fs.writeFileSync(
  'preview-badge-kit/badges/README.md',
  '# Badges Seeker · Nexus — fichiers individuels\n\n1 fichier = 1 variante de thème, autonome (CSS inline, sans JS, sans dépendance).\nOuvrir directement dans un navigateur ou copier le bloc `<div class="sn-badge">` + le `<style>` dans un projet.\n\n| Variante | Fichier |\n|---|---|\n' + rows.join('\n') + '\n'
);
console.log('OK', rows.length, 'badges');
