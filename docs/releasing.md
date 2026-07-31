# Releasing

This checklist prepares a GitHub release. Publishing to npm is intentionally not
part of the current project workflow.

1. Confirm the worktree contains only intended changes and no runtime state,
   fetched sources, datasets, credentials, or package archives.
2. Update the version in `package.json` and `package-lock.json` together.
3. Move release notes into a dated section of `CHANGELOG.md`.
4. Run:

   ```bash
   npm ci
   npm run check
   docker compose -f infra/compose.yaml config --quiet
   npm audit
   npm pack --dry-run
   ```

5. Verify the extension manually with the oldest supported Pi and the recommended
   Pi version. A real-model recursive run is a manual release check, not CI.
6. Merge through a reviewed pull request and confirm CI and CodeQL are green.
7. Create an annotated `vX.Y.Z` tag from `main` and a GitHub release using the
   matching changelog section.

`npm audit` currently reports the upstream Pi shrinkwrap advisory documented in
[`security.md`](security.md). Confirm that the finding still has exactly that
provenance; any additional high/critical finding blocks a release.

Before the first public release, enable private vulnerability reporting and
branch protection for `main` in the GitHub repository settings.
