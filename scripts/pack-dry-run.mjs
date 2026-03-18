import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const workspaceDir = process.cwd();
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function collectManifestFiles(value, files) {
  if (typeof value === 'string') {
    files.add(value);
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const nestedValue of Object.values(value)) {
    collectManifestFiles(nestedValue, files);
  }
}

const packagedFiles = new Set();
collectManifestFiles(manifest.main, packagedFiles);
collectManifestFiles(manifest.types, packagedFiles);
collectManifestFiles(manifest.exports, packagedFiles);

const missingBuildArtifacts = Array.from(packagedFiles)
  .filter((file) => file.startsWith('./dist/'))
  .filter((file) => !existsSync(path.join(workspaceDir, file)));

if (missingBuildArtifacts.length > 0) {
  throw new Error(
    `Missing build artifacts for pack: ${missingBuildArtifacts.join(', ')}. Run npm run build first.`,
  );
}

execFileSync(npmCmd, ['pack', '--dry-run'], {
  cwd: workspaceDir,
  env: {
    ...process.env,
    NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? path.join(workspaceDir, '.npm-cache'),
  },
  stdio: 'inherit',
});
