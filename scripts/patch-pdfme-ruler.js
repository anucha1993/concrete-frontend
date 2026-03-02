/**
 * Patch @pdfme/ui ruler to show mm units with labels every 10mm
 * and tick marks every 1mm (unit: 10, segment: 10)
 *
 * Run automatically via postinstall or manually: node scripts/patch-pdfme-ruler.js
 */
const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'node_modules', '@pdfme', 'ui', 'dist', 'index.es.js'),
  path.join(__dirname, '..', 'node_modules', '@pdfme', 'ui', 'dist', 'index.umd.js'),
];

let patched = 0;

for (const filePath of files) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-pdfme-ruler] Skipped (not found): ${filePath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Pattern for ESM (multi-line formatted) - horizontal
  const esmHOrig = `type: "horizontal",\n      ref: s`;
  const esmHNew = `type: "horizontal",\n      unit: 10,\n      segment: 10,\n      ref: s`;
  if (content.includes(esmHOrig) && !content.includes(esmHNew)) {
    content = content.replace(esmHOrig, esmHNew);
    changed = true;
  }

  // Pattern for ESM (multi-line formatted) - vertical
  const esmVOrig = `type: "vertical",\n      ref: c`;
  const esmVNew = `type: "vertical",\n      unit: 10,\n      segment: 10,\n      ref: c`;
  if (content.includes(esmVOrig) && !content.includes(esmVNew)) {
    content = content.replace(esmVOrig, esmVNew);
    changed = true;
  }

  // Pattern for UMD (minified) - horizontal
  const umdHOrig = 'type:"horizontal",ref:s';
  const umdHNew = 'type:"horizontal",unit:10,segment:10,ref:s';
  if (content.includes(umdHOrig) && !content.includes(umdHNew)) {
    content = content.replace(umdHOrig, umdHNew);
    changed = true;
  }

  // Pattern for UMD (minified) - vertical
  const umdVOrig = 'type:"vertical",ref:c';
  const umdVNew = 'type:"vertical",unit:10,segment:10,ref:c';
  if (content.includes(umdVOrig) && !content.includes(umdVNew)) {
    content = content.replace(umdVOrig, umdVNew);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    patched++;
    console.log(`[patch-pdfme-ruler] Patched: ${path.basename(filePath)}`);
  } else {
    console.log(`[patch-pdfme-ruler] Already patched or pattern not found: ${path.basename(filePath)}`);
  }
}

console.log(`[patch-pdfme-ruler] Done. ${patched} file(s) patched.`);
