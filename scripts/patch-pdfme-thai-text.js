/**
 * Patch pdfme to fix Thai text rendering.
 *
 * Problem: pdfme splits text into individual Unicode code points (`.split('')`
 * or `for (const char of ...)`) which breaks Thai grapheme clusters. Combining
 * marks like ่ ื ้ get separated from their base consonant, causing extra
 * spacing ("แผ่นพื้น" → "แผ่นพื้  น").
 *
 * Fix: Use `Intl.Segmenter` with `granularity: 'grapheme'` to keep Thai
 * combining marks grouped with their base consonants.
 *
 * Patched files:
 *   1. @pdfme/ui/dist/index.es.js   – bundled uiRender + helper
 *   2. @pdfme/schemas/dist/{esm,cjs,node}/src/text/uiRender.js
 *   3. @pdfme/schemas/dist/{esm,cjs,node}/src/text/helper.js
 */

const fs = require('fs');
const path = require('path');

let totalPatches = 0;

function patchFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP (not found): ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let patched = 0;
  for (const { search, replace, label } of replacements) {
    if (content.includes(search)) {
      content = content.replace(search, replace);
      patched++;
      console.log(`  ✔ ${label}`);
    } else if (content.includes(replace)) {
      console.log(`  · ${label} (already patched)`);
    } else {
      console.log(`  ✘ ${label} (pattern not found)`);
    }
  }
  if (patched > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalPatches += patched;
  }
}

// ─────────────────────────────────────────────────
// 1. Patch @pdfme/ui bundled index.es.js
// ─────────────────────────────────────────────────
console.log('\n[1] @pdfme/ui/dist/index.es.js');
const uiBundlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@pdfme',
  'ui',
  'dist',
  'index.es.js'
);

patchFile(uiBundlePath, [
  {
    label: 'uiRender: split("") → Intl.Segmenter grapheme',
    search:
      'E.innerHTML = w.split("").map((S, $) => `<span style="letter-spacing:${String(s).length === $ + 1 ? 0 : "inherit"};">${S}</span>`).join("");',
    replace:
      '{ const _gs = new Intl.Segmenter(void 0, { granularity: "grapheme" }); const _gc = Array.from(_gs.segment(w)).map(_s => _s.segment); E.innerHTML = _gc.map((S, $) => `<span style="letter-spacing:${_gc.length === $ + 1 ? 0 : "inherit"};">${S}</span>`).join(""); }',
  },
  {
    label: 'helper: for-of code points → grapheme segmenter',
    search:
      `for (const E of f) {
        const w = widthOfTextAtSize(E, c, u, d);
        b + w <= p ? x[g] ? (x[g] += E, b += w + d) : (x[g] = E, b = w + d) : (x[++g] = E, b = w + d);
      }`,
    replace:
      `{ const _gSeg = new Intl.Segmenter(void 0, { granularity: "grapheme" }); for (const _gI of _gSeg.segment(f)) {
        const E = _gI.segment; const w = widthOfTextAtSize(E, c, u, d);
        b + w <= p ? x[g] ? (x[g] += E, b += w + d) : (x[g] = E, b = w + d) : (x[++g] = E, b = w + d);
      } }`,
  },
]);

// ─────────────────────────────────────────────────
// 2. Patch @pdfme/schemas uiRender.js (all variants)
// ─────────────────────────────────────────────────
const schemasBase = path.join(
  __dirname, '..', 'node_modules', '@pdfme', 'schemas', 'dist'
);

// ESM uiRender
const esmUiRenderReplacements = [
  {
    label: 'uiRender ESM: split(\'\') → grapheme segmenter',
    search: `textBlock.innerHTML = processedText
            .split('')
            .map((l, i) => \`<span style="letter-spacing:\${String(value).length === i + 1 ? 0 : 'inherit'};">\${l}</span>\`)
            .join('');`,
    replace: `{ const _gs = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); const _gc = Array.from(_gs.segment(processedText)).map(_s => _s.segment);
        textBlock.innerHTML = _gc
            .map((l, i) => \`<span style="letter-spacing:\${_gc.length === i + 1 ? 0 : 'inherit'};">\${l}</span>\`)
            .join(''); }`,
  },
];

// CJS uiRender
const cjsUiRenderReplacements = [
  {
    label: 'uiRender CJS: split(\'\') → grapheme segmenter',
    search: `textBlock.innerHTML = processedText
            .split('')
            .map((l, i) => \`<span style="letter-spacing:\${String(value).length === i + 1 ? 0 : 'inherit'};">\${l}</span>\`)
            .join('');`,
    replace: `{ const _gs = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); const _gc = Array.from(_gs.segment(processedText)).map(_s => _s.segment);
        textBlock.innerHTML = _gc
            .map((l, i) => \`<span style="letter-spacing:\${_gc.length === i + 1 ? 0 : 'inherit'};">\${l}</span>\`)
            .join(''); }`,
  },
];

for (const variant of ['esm', 'cjs', 'node']) {
  const uiPath = path.join(schemasBase, variant, 'src', 'text', 'uiRender.js');
  console.log(`\n[2-${variant}] @pdfme/schemas/${variant} uiRender.js`);
  patchFile(uiPath, variant === 'cjs' ? cjsUiRenderReplacements : esmUiRenderReplacements);
}

// ─────────────────────────────────────────────────
// 3. Patch @pdfme/schemas helper.js (all variants)
// ─────────────────────────────────────────────────
const helperReplacements = [
  {
    label: 'helper: for (const char of segment) → grapheme segmenter',
    search: `            // the segment is too large to fit in the boxWidth, we wrap the segment
            for (const char of segment) {`,
    replace: `            // the segment is too large to fit in the boxWidth, we wrap the segment (patched for Thai grapheme clusters)
            const _gSeg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
            for (const _gI of _gSeg.segment(segment)) { const char = _gI.segment;`,
  },
];

for (const variant of ['esm', 'cjs', 'node']) {
  const helperPath = path.join(schemasBase, variant, 'src', 'text', 'helper.js');
  console.log(`\n[3-${variant}] @pdfme/schemas/${variant} helper.js`);
  patchFile(helperPath, helperReplacements);
}

// ─────────────────────────────────────────────────
console.log(`\n✅ Thai text patch complete (${totalPatches} replacements applied)\n`);
