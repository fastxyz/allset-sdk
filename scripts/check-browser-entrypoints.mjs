import { readFileSync } from 'node:fs';
import path from 'node:path';

const entryFiles = process.argv.slice(2);

if (entryFiles.length === 0) {
  throw new Error('Usage: node scripts/check-browser-entrypoints.mjs <entry-file> [...]');
}

const forbiddenSpecifiers = new Set(['@fastxyz/sdk']);
const forbiddenFiles = new Set([
  'bridge.js',
  'config.js',
  'evm-executor.js',
  'provider.js',
]);
const seen = new Set();

function resolveImport(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.json`,
    path.join(basePath, 'index.js'),
  ];

  for (const candidate of candidates) {
    try {
      return path.resolve(candidate);
    } catch {
      continue;
    }
  }

  throw new Error(`Failed to resolve ${specifier} from ${fromFile}`);
}

function walk(file) {
  const resolvedFile = path.resolve(file);
  if (seen.has(resolvedFile)) {
    return;
  }
  seen.add(resolvedFile);

  if (resolvedFile.includes(`${path.sep}dist${path.sep}node${path.sep}`)) {
    throw new Error(`Browser entrypoint reaches node subpath: ${resolvedFile}`);
  }

  if (forbiddenFiles.has(path.basename(resolvedFile))) {
    throw new Error(`Browser entrypoint reaches node-only file: ${resolvedFile}`);
  }

  const source = readFileSync(resolvedFile, 'utf8');
  const importPattern =
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) {
      continue;
    }

    if (specifier.startsWith('node:')) {
      throw new Error(`Browser entrypoint reaches Node builtin "${specifier}" from ${resolvedFile}`);
    }

    if (forbiddenSpecifiers.has(specifier)) {
      throw new Error(`Browser entrypoint reaches node-only package "${specifier}" from ${resolvedFile}`);
    }

    if (!specifier.startsWith('.')) {
      continue;
    }

    walk(resolveImport(resolvedFile, specifier));
  }
}

for (const entryFile of entryFiles) {
  walk(entryFile);
}
