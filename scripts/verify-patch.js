const fs = require('fs');
const f = fs.readFileSync('node_modules/@pdfme/ui/dist/index.es.js', 'utf8');
console.log('grapheme patch found:', f.includes('Intl.Segmenter(void 0, { granularity: "grapheme" })'));
console.log('old split(".").map still present:', f.includes('E.innerHTML = w.split("").map'));
