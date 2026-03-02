/**
 * Patch @pdfme/ui to remove position/size clamping constraints.
 * This allows elements to be positioned at x=0, y=0 (flush to paper edge)
 * and even slightly past the edges for bleed.
 *
 * Patches:
 * 1. handlePositionSizeChange - remove clamping on position/size from property panel
 * 2. moveCommandToChangeSchemasArg - allow keyboard arrows to reach edge
 * 3. Moveable bounds - remove drag boundary constraints
 * 4. onDrag handler (U) - remove drag position clamping
 * 5. onResize handler (re) - remove resize clamping  
 *
 * Run automatically via postinstall or manually: node scripts/patch-pdfme-bounds.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', '@pdfme', 'ui', 'dist', 'index.es.js');

if (!fs.existsSync(filePath)) {
  console.log('[patch-pdfme-bounds] Skipped (not found):', filePath);
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');
let patchCount = 0;

// ─── Patch 1: handlePositionSizeChange ───
// Remove clamping so property panel values are applied directly
// Original: s === "position.x" ? a.position.x = f(c, g, b - a.width - A) : ...
// New:      s === "position.x" ? a.position.x = Number(c) : ...
const patch1Old = `s === "position.x" ? a.position.x = f(c, g, b - a.width - A) : s === "position.y" ? a.position.y = f(c, v, y - a.height - x) : s === "width" ? a.width = f(c, 0, b - a.position.x - A) : s === "height" && (a.height = f(c, 0, y - a.position.y - x))`;
const patch1New = `s === "position.x" ? a.position.x = Number(c) : s === "position.y" ? a.position.y = Number(c) : s === "width" ? a.width = Math.max(Number(c), 0) : s === "height" && (a.height = Math.max(Number(c), 0))`;

if (content.includes(patch1Old)) {
  content = content.replace(patch1Old, patch1New);
  patchCount++;
  console.log('[patch-pdfme-bounds] Patched: handlePositionSizeChange (property panel clamping removed)');
} else if (content.includes(patch1New)) {
  console.log('[patch-pdfme-bounds] Already patched: handlePositionSizeChange');
} else {
  console.log('[patch-pdfme-bounds] WARNING: handlePositionSizeChange pattern not found');
}

// ─── Patch 2: moveCommandToChangeSchemasArg - keyboard arrows ───
// Remove `g > 0 ? g : 0` which prevents going below 0
const patch2Old = `return g > 0 ? g : 0;
  };
  return c.map((x) => {
    let g = A(x);
    const { width: b, height: y } = x;
    return p === "x" ? g = g > d.width - b ? round$1(d.width - b, 2) : g : g = g > d.height - y ? round$1(d.height - y, 2) : g, { key: \`position.\${p}\`, value: g, schemaId: x.id };
  });`;
const patch2New = `return g;
  };
  return c.map((x) => {
    let g = A(x);
    return { key: \`position.\${p}\`, value: g, schemaId: x.id };
  });`;

if (content.includes(patch2Old)) {
  content = content.replace(patch2Old, patch2New);
  patchCount++;
  console.log('[patch-pdfme-bounds] Patched: moveCommandToChangeSchemasArg (keyboard arrow clamping removed)');
} else if (content.includes(patch2New)) {
  console.log('[patch-pdfme-bounds] Already patched: moveCommandToChangeSchemasArg');
} else {
  console.log('[patch-pdfme-bounds] WARNING: moveCommandToChangeSchemasArg pattern not found');
}

// ─── Patch 3: Moveable bounds - remove paper boundary ───
// Change bounds from fixed paper edges to very large area (allows dragging freely)
const patch3Old = `bounds: { left: 0, top: 0, bottom: Y.height, right: Y.width },`;
const patch3New = `bounds: { left: -Y.width, top: -Y.height, bottom: Y.height * 2, right: Y.width * 2 },`;

if (content.includes(patch3Old)) {
  content = content.replace(patch3Old, patch3New);
  patchCount++;
  console.log('[patch-pdfme-bounds] Patched: Moveable bounds (drag boundaries loosened)');
} else if (content.includes(patch3New)) {
  console.log('[patch-pdfme-bounds] Already patched: Moveable bounds');
} else {
  console.log('[patch-pdfme-bounds] WARNING: Moveable bounds pattern not found');
}

// ─── Patch 4: onDrag handler (U) - remove drag position clamping ───
// Remove the clamping that prevents dragging past paper edges
const patch4Old = `fe + se > me - ve ? ee.style.top = \`\${(me - se - ve) * ZOOM}px\` : ee.style.top = \`\${Y < be ? be : Y}px\`, pe + oe > ge - le ? ee.style.left = \`\${(ge - oe - le) * ZOOM}px\` : ee.style.left = \`\${Z < he ? he : Z}px\``;
const patch4New = `ee.style.top = \`\${Y}px\`, ee.style.left = \`\${Z}px\``;

if (content.includes(patch4Old)) {
  content = content.replace(patch4Old, patch4New);
  patchCount++;
  console.log('[patch-pdfme-bounds] Patched: onDrag handler (drag clamping removed)');
} else if (content.includes(patch4New)) {
  console.log('[patch-pdfme-bounds] Already patched: onDrag handler');
} else {
  console.log('[patch-pdfme-bounds] WARNING: onDrag handler pattern not found');
}

// ─── Patch 5: Template load constraint - remove auto-reposition ───
// This prevents elements from being forcefully repositioned when template loads
const patch5Old = `m > y && (b.position.x = Math.max(0, y - b.width)), E > f && (b.position.y = Math.max(0, f - b.height))`;
const patch5New = `/* patched: no auto-reposition on load */void 0`;

if (content.includes(patch5Old)) {
  content = content.replace(patch5Old, patch5New);
  patchCount++;
  console.log('[patch-pdfme-bounds] Patched: template load constraint (auto-reposition removed)');
} else if (content.includes(patch5New)) {
  console.log('[patch-pdfme-bounds] Already patched: template load constraint');
} else {
  console.log('[patch-pdfme-bounds] WARNING: template load constraint pattern not found');
}

// ─── Write patched file ───
if (patchCount > 0) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[patch-pdfme-bounds] Done. ${patchCount} patch(es) applied.`);
} else {
  console.log('[patch-pdfme-bounds] No patches applied.');
}
