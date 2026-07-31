# Security policy

## Supported versions

The current `0.1.x` line receives security fixes. Earlier snapshots are not
supported; until stable releases exist, use the latest tagged version.

## Reporting a vulnerability

Do not open a public issue for credential exposure, SSRF bypasses, path escapes,
container escapes, or other exploitable behavior. Use GitHub's private
vulnerability reporting for this repository (Security → Advisories → Report a
vulnerability). If that feature is unavailable, contact a repository maintainer
privately before disclosing details.

Include the affected version or commit, reproduction steps, expected impact,
and any suggested mitigation. Do not include real credentials or private data.

The project threat model and current boundaries are documented in
[`docs/security.md`](docs/security.md). In particular, Pi itself runs with the
user's permissions; Hypothesis Machine only confines code passed through its
own experiment runner.
