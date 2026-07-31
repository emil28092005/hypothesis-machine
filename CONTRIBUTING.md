# Contributing

Hypothesis Machine is an extension of the official Pi Coding Agent. Contributions
should preserve that boundary: do not fork Pi, duplicate its chat/runtime/session
features, or introduce third-party multi-agent frameworks.

## Local setup

Requirements are Node.js 22.19+, npm, and optionally Docker with Compose. Pi model
credentials are not needed for the automated test suite.

```bash
npm ci
npm run check
docker compose -f infra/compose.yaml config --quiet
npm pack --dry-run
```

Use `npm install` instead of `npm ci` only when intentionally changing
dependencies, and include the resulting `package-lock.json` update.

## Pull requests

- Keep changes focused and explain user-visible behavior and security impact.
- Add or update tests for behavior changes.
- Use only official `@earendil-works/pi-*` packages for the agent layer.
- Do not commit `.hypothesis-machine/`, credentials, model transcripts, fetched
  sources, experiment data, or generated package archives.
- Keep model/network-dependent checks optional; CI must remain free of paid API
  calls.
- Update `CHANGELOG.md` for user-visible changes.

Web inputs are hostile data, and generated experiment code must stay inside the
Docker runner. Changes to URL validation, filesystem boundaries, session
inheritance, or Docker arguments need explicit regression tests.

See [`docs/development.md`](docs/development.md),
[`docs/architecture.md`](docs/architecture.md), and
[`docs/security.md`](docs/security.md) for implementation details.
