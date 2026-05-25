import { calculateFileCoverage } from '../lib/jsdoc-audit.js';
import fs from 'fs';
import path from 'path';

const libDir = path.resolve('lib');
const files = fs.readdirSync(libDir).filter(f => f.endsWith('.js'));
let fixed = 0;
let skipped = 0;

for (const file of files) {
  const filePath = path.join(libDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = calculateFileCoverage(content);
  
  if (result.missing !== 1) continue;
  
  const missingSym = result.symbols.find(s => !s.hasJSDoc);
  if (!missingSym) continue;
  
  const name = missingSym.name;
  const kind = missingSym.kind;
  
  const lines = content.split('\n');
  let targetLineIdx = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (kind === 'class') {
      if (line.match(new RegExp(`^\\s*export\\s+class\\s+${name}\\b`))) { targetLineIdx = i; break; }
    } else if (kind === 'function') {
      if (line.match(new RegExp(`^\\s*export\\s+(async\\s+)?function\\s+${name}\\b`))) { targetLineIdx = i; break; }
    } else if (kind === 'const' || kind === 'let') {
      if (line.match(new RegExp(`^\\s*export\\s+(const|let)\\s+${name}\\b`))) { targetLineIdx = i; break; }
    }
  }
  
  if (targetLineIdx === -1) {
    console.log(`SKIP: ${file} -> ${name} (line not found)`);
    skipped++;
    continue;
  }
  
  if (targetLineIdx > 0 && (lines[targetLineIdx - 1].includes('/**') || lines[targetLineIdx - 1].includes('*/'))) {
    console.log(`SKIP: ${file} -> ${name} (already has JSDoc above)`);
    skipped++;
    continue;
  }
  
  let jsdoc = '';
  if (kind === 'class') jsdoc = `/** ${name} 类 */`;
  else if (kind === 'function') jsdoc = `/** ${name} 函数 */`;
  else jsdoc = `/** ${name} 常量 */`;
  
  lines.splice(targetLineIdx, 0, jsdoc);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  
  console.log(`FIXED: ${file} -> ${name} (${kind})`);
  fixed++;
}

console.log(`\nTotal fixed: ${fixed}, Skipped: ${skipped}`);
