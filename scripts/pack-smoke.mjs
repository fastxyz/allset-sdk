import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const workspaceDir = process.cwd();
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'allset-sdk-pack-smoke-'));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const npmEnv = {
  ...process.env,
  NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? path.join(workspaceDir, '.npm-cache'),
};

let tarballPath = '';

try {
  const packJson = execFileSync(npmCmd, ['pack', '--json'], {
    cwd: workspaceDir,
    encoding: 'utf8',
    env: npmEnv,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const packResult = JSON.parse(packJson);
  const tarballName = Array.isArray(packResult) ? packResult[0]?.filename : null;
  if (!tarballName) {
    throw new Error('npm pack --json did not return a tarball filename');
  }

  tarballPath = path.join(workspaceDir, tarballName);
  writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      name: 'allset-sdk-pack-smoke',
      private: true,
      type: 'module',
    }, null, 2),
    'utf8',
  );

  execFileSync(npmCmd, ['install', tarballPath], {
    cwd: tempDir,
    env: npmEnv,
    stdio: 'inherit',
  });

  const installedManifestPath = path.join(
    tempDir,
    'node_modules',
    ...String(manifest.name).split('/'),
    'package.json',
  );
  const installedManifest = JSON.parse(readFileSync(installedManifestPath, 'utf8'));
  if (installedManifest.name !== manifest.name) {
    throw new Error(`Unexpected installed package name: ${installedManifest.name}`);
  }

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { omnisetProvider, createEvmExecutor } from ${JSON.stringify(manifest.name)}; if (typeof omnisetProvider?.bridge !== "function") throw new Error("omnisetProvider bridge export missing"); if (typeof createEvmExecutor !== "function") throw new Error("createEvmExecutor export missing"); if (omnisetProvider?.name !== "omniset") throw new Error("unexpected omnisetProvider name");`,
    ],
    {
      cwd: tempDir,
      stdio: 'inherit',
    },
  );
} finally {
  if (tarballPath) {
    unlinkSync(tarballPath);
  }
  rmSync(tempDir, { recursive: true, force: true });
}
