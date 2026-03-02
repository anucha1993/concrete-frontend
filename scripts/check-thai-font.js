/**
 * Diagnostic: Check Sarabun font advance widths for Thai combining marks.
 * Thai combining marks should have 0 advance width for correct rendering.
 * If they don't, pdf-lib will advance the cursor between base consonants
 * and their marks, causing visible spacing.
 */
const fs = require('fs');
const path = require('path');

let fontkit;
try {
  fontkit = require('fontkit');
} catch {
  try {
    fontkit = require(path.join(__dirname, '..', 'node_modules', 'fontkit'));
  } catch {
    console.log('fontkit not available');
    process.exit(1);
  }
}

const fontPath = path.join(__dirname, '..', 'public', 'fonts', 'Sarabun-Regular.ttf');
const font = fontkit.create(fs.readFileSync(fontPath));
console.log('Font:', font.familyName, '| unitsPerEm:', font.unitsPerEm);

// Thai combining marks (above/below vowels, tone marks)
const thaiMarks = [
  { code: 0x0E31, name: 'MAI HAN AKAT (ั)' },
  { code: 0x0E34, name: 'SARA I (ิ)' },
  { code: 0x0E35, name: 'SARA II (ี)' },
  { code: 0x0E36, name: 'SARA UE (ึ)' },
  { code: 0x0E37, name: 'SARA UEE (ื)' },
  { code: 0x0E38, name: 'SARA U (ุ)' },
  { code: 0x0E39, name: 'SARA UU (ู)' },
  { code: 0x0E47, name: 'MAITAIKHU (็)' },
  { code: 0x0E48, name: 'MAI EK (่)' },
  { code: 0x0E49, name: 'MAI THO (้)' },
  { code: 0x0E4A, name: 'MAI TRI (๊)' },
  { code: 0x0E4B, name: 'MAI CHATTAWA (๋)' },
  { code: 0x0E4C, name: 'THANTHAKAT (์)' },
  { code: 0x0E4D, name: 'NIKHAHIT (ํ)' },
];

console.log('\n=== Thai Combining Mark Advance Widths ===');
let hasNonZero = false;
for (const mark of thaiMarks) {
  const glyph = font.glyphForCodePoint(mark.code);
  const flag = glyph.advanceWidth > 0 ? ' *** NON-ZERO ***' : '';
  if (glyph.advanceWidth > 0) hasNonZero = true;
  console.log(`  U+${mark.code.toString(16).toUpperCase()} ${mark.name}: advanceWidth = ${glyph.advanceWidth}${flag}`);
}

// Thai consonants for comparison
console.log('\n=== Thai Consonant Advance Widths (for comparison) ===');
const consonants = [
  { code: 0x0E01, name: 'KO KAI (ก)' },
  { code: 0x0E19, name: 'NO NU (น)' },
  { code: 0x0E1E, name: 'PHO PHAN (พ)' },
  { code: 0x0E1C, name: 'PHO PHUNG (ผ)' },
  { code: 0x0E41, name: 'SARA AE (แ)' },
];
for (const c of consonants) {
  const glyph = font.glyphForCodePoint(c.code);
  console.log(`  U+${c.code.toString(16).toUpperCase()} ${c.name}: advanceWidth = ${glyph.advanceWidth}`);
}

// Full layout check
const testText = 'แผ่นพื้น';
const result = font.layout(testText);
console.log(`\n=== Layout of "${testText}" ===`);
for (let i = 0; i < result.glyphs.length; i++) {
  const g = result.glyphs[i];
  const p = result.positions[i];
  const cp = g.codePoints.map(c => String.fromCodePoint(c)).join('');
  console.log(`  [${i}] "${cp}" glyph=${g.id} advanceWidth=${g.advanceWidth} | pos: xAdv=${p.xAdvance} xOff=${p.xOffset} yOff=${p.yOffset}`);
}

if (hasNonZero) {
  console.log('\n⚠️  PROBLEM: Thai combining marks have non-zero advance widths!');
  console.log('   pdf-lib will add these widths to the CIDFont W array, causing extra spacing in PDFs.');
} else {
  console.log('\n✅ Thai combining marks have 0 advance width. Issue is elsewhere.');
}
