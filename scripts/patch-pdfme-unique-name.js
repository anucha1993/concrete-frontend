/**
 * Patch @pdfme/ui to allow duplicate field names in the Designer.
 * 
 * By default pdfme enforces unique schema names. This patch disables that
 * validation so users can place the same field (e.g. serial_number) in
 * multiple positions on the label. The app's input-mapping code handles
 * resolving duplicates at generation time.
 *
 * Run automatically via postinstall or manually: node scripts/patch-pdfme-unique-name.js
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
    console.log(`[patch-pdfme-unique-name] Skipped (not found): ${filePath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // The validator checks if a schema name already exists in other schemas.
  // Original code (ESM):
  //   w.current = (M) => {
  //     for (const N of c)
  //       for (const T of Object.values(N))
  //         if (T.name === M && T.id !== p.id)
  //           return !1;
  //     return !0;
  //   };
  //
  // We patch it to always return true (allow duplicate names).

  // ESM pattern
  const esmOrig = `w.current = (M) => {
      for (const N of c)
        for (const T of Object.values(N))
          if (T.name === M && T.id !== p.id)
            return !1;
      return !0;
    };`;
  const esmNew = `w.current = (M) => {
      return !0;
    };`;

  if (content.includes(esmOrig) && !content.includes('/* patched-allow-dup-names */')) {
    content = content.replace(esmOrig, `/* patched-allow-dup-names */ ${esmNew}`);
    changed = true;
  }

  // UMD / minified pattern variants
  // Pattern: w.current=M=>{for(const N of c)for(const T of Object.values(N))if(T.name===M&&T.id!==p.id)return!1;return!0}
  const umdOrig = 'w.current=M=>{for(const N of c)for(const T of Object.values(N))if(T.name===M&&T.id!==p.id)return!1;return!0}';
  const umdNew = 'w.current=M=>{return!0}';
  if (content.includes(umdOrig) && !content.includes('/*patched-dup*/')) {
    content = content.replace(umdOrig, `/*patched-dup*/${umdNew}`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    patched++;
    console.log(`[patch-pdfme-unique-name] Patched: ${path.basename(filePath)}`);
  } else {
    console.log(`[patch-pdfme-unique-name] Already patched or pattern not found: ${path.basename(filePath)}`);
  }
}

console.log(`[patch-pdfme-unique-name] Done. ${patched} file(s) patched.`);
