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

  execFileSync(npmCmd, ['install', tarballPath, '@fastxyz/sdk'], {
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

  const installedPackageRoot = path.join(
    tempDir,
    'node_modules',
    ...String(manifest.name).split('/'),
  );

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const root = await import(${JSON.stringify(manifest.name)}); const core = await import(${JSON.stringify(`${manifest.name}/core`)}); const browser = await import(${JSON.stringify(`${manifest.name}/browser`)}); const node = await import(${JSON.stringify(`${manifest.name}/node`)}); if (typeof root.buildDepositTransaction !== "function") throw new Error("root buildDepositTransaction export missing"); if (typeof core.resolveDepositRoute !== "function") throw new Error("core resolveDepositRoute export missing"); if (typeof browser.buildTransferIntent !== "function") throw new Error("browser buildTransferIntent export missing"); if ("AllSetProvider" in root) throw new Error("root should not export AllSetProvider"); if ("createEvmExecutor" in browser) throw new Error("browser should not export createEvmExecutor"); const allset = new node.AllSetProvider(); if (typeof allset?.sendToFast !== "function") throw new Error("node AllSetProvider sendToFast missing"); if (typeof node.createEvmExecutor !== "function") throw new Error("node createEvmExecutor export missing");`,
    ],
    {
      cwd: tempDir,
      stdio: 'inherit',
    },
  );

  execFileSync(
    process.execPath,
    [
      path.join(workspaceDir, 'scripts', 'check-browser-entrypoints.mjs'),
      path.join(installedPackageRoot, 'dist', 'index.js'),
      path.join(installedPackageRoot, 'dist', 'core', 'index.js'),
      path.join(installedPackageRoot, 'dist', 'browser', 'index.js'),
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
