# Releasing AllSet SDK

This repo publishes `@fastxyz/allset-sdk` to npm from Git tags.

## One-time npm setup

1. Create or verify access to the `@fastxyz` npm scope.
2. In npm package settings for `@fastxyz/allset-sdk`, add a Trusted Publisher for:
   - GitHub repository: `fastxyz/allset-sdk`
   - Workflow file: `.github/workflows/publish.yml`
3. Confirm the package remains public on npm.

Trusted publishing is the expected path for this repo. Do not add a long-lived npm token unless trusted publishing is unavailable.

## GitHub Actions publish requirements

- Repository visibility must stay public for npm trusted publishing from GitHub Actions.
- The publish workflow must keep `permissions.id-token: write`.
- The publish job must run on a GitHub-hosted Linux runner such as `ubuntu-latest`.
- Publishing uses npm provenance and must not depend on an `NPM_TOKEN` repository secret.

## Release flow

1. Update `package.json` with the next semver version.
2. Run `npm install` if the lockfile needs refreshing.
3. Merge the release commit to `main`.
4. Create and push a matching tag in the form `vX.Y.Z`.
5. GitHub Actions runs `.github/workflows/publish.yml` on that tag push.
6. The workflow verifies the tag, installs dependencies, builds, tests, checks the tarball, smoke-tests the packed artifact, and runs `npm publish --provenance`.
7. Verify the package on npm and test a fresh install with `npm install @fastxyz/allset-sdk`.

## Release invariants

- The git tag must match `package.json` exactly.
- The publish workflow rebuilds, tests, runs package smoke checks, and publishes only on tag pushes.
- Public scoped packages must publish with public access.
- If trusted publishing is configured correctly on npm, no manual npm login is required during release.
