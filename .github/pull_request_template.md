## Summary

Describe the user-visible result and why it is needed.

## Verification

- [ ] `npm run check`
- [ ] `docker compose -f infra/compose.yaml config --quiet`
- [ ] Tests cover changed behavior
- [ ] `CHANGELOG.md` is updated when behavior is user-visible

## Security and data

- [ ] No credentials, runtime state, fetched private sources, or model transcripts are included
- [ ] Web, filesystem, session, and container boundaries were reviewed where relevant
- [ ] The agent layer still depends only on official Pi packages
