import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname, relative } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');
const EXTS = ['.js', '.ts', '.tsx', '.mjs', '.cjs'];

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (entry.isFile() && /\.(js|ts|tsx|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveImport(importPath, fromFile) {
  const base = dirname(fromFile);
  const candidates = [];

  if (importPath.startsWith('.')) {
    const joined = resolve(base, importPath);
    const alreadyHasExt = EXTS.some((ext) => importPath.endsWith(ext));
    if (alreadyHasExt) {
      candidates.push(joined);
    } else {
      for (const ext of EXTS) candidates.push(joined + ext);
    }
    candidates.push(join(joined, 'index.js'), join(joined, 'index.ts'), join(joined, 'index.tsx'));
  }

  const found = candidates.find((p) => {
    try { return statSync(p).isFile(); } catch { return false; }
  });
  return found;
}

const IMPORT_RE = /^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/gm;

const files = listFiles(ROOT);
let errors = 0;
let checked = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let match;
  while ((match = IMPORT_RE.exec(src))) {
    const specifier = match[1];
    if (specifier.startsWith('.') && !specifier.endsWith('.css')) {
      checked++;
      if (!resolveImport(specifier, file)) {
        console.error(`IMPORTO QUEBRADO: ${relative(process.cwd(), file)} -> ${specifier}`);
        errors++;
      }
    }
  }
}

console.log(`\nVerificador de imports: ${checked} importações relativas verificadas, ${errors} erro(s).`);
process.exit(errors ? 1 : 0);
