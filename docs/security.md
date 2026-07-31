# Security model

Hypothesis Machine narrows its own tools, but Pi itself runs with the launching
user's authority. Install only in trusted projects.

- Children receive read-only Pi built-ins (`read`, `grep`, `find`, `ls`) plus an
  allowlisted custom set; no child `bash`, `edit`, or `write` is enabled.
- `read_artifact` rejects paths outside the project. Memory writers choose paths
  internally and use restrictive file modes.
- Credentials are never requested, serialized, prompted, or passed to Docker.
  One official `ModelRuntime` resolves Pi auth in-process.
- Public URLs are normalized and DNS-resolved before use. Loopback, private,
  link-local, carrier NAT, multicast/reserved, and metadata targets are blocked.
  Every redirect in direct downloads is revalidated. Size and MIME are bounded.
- Firecrawl responses are marked `untrusted`; agents are explicitly instructed
  not to execute or obey page instructions. Original source bytes/Markdown,
  retrieval time, URL, MIME, SHA-256, and source ID are preserved.
- The default Compose ports bind to `127.0.0.1`. Firecrawl state services are on
  an internal network. A hostile public DNS server could still attempt rebinding
  between gateway validation and Firecrawl's independent fetch; production
  deployments should add an egress proxy/firewall that repeats IP policy.
- Browser Use must use a fresh profile and domain allowlist. The current adapter
  is optional because its open-source agent needs separate LLM credentials; the
  package never uses the user's main browser profile.
- Experiments run through `docker run`, never host shell: network none, read-only
  root, CPU/RAM/PID/time limits, all capabilities dropped, no-new-privileges,
  empty minimal environment, and only the experiment directory mounted.
- Dataset acquisition is deliberately outside the experiment container. Download
  with `download_source`, verify the data manifest/hash, then mount local bytes.
- If Docker is unavailable, result status is `docker_unavailable`; generated code
  is not executed on the host.

Known dependency advisory: `@earendil-works/pi-coding-agent@0.83.0` ships an npm
shrinkwrap that pins `minimatch@10.2.5` / `brace-expansion@5.0.7`, reported by
`npm audit` as GHSA-mh99-v99m-4gvg (resource-exhaustion DoS). A root override
cannot replace a dependency inside that published shrinkwrap. Track the official
Pi release and upgrade when its package moves to `brace-expansion@5.0.8+`; do not
patch Pi's installed files in a postinstall hook.

Known MVP gaps: the read-only Pi built-ins can read any path visible to the Pi
process; use Pi's official sandbox extension or OS/container isolation when a
strict filesystem boundary is required. Compose images are pinned by tag rather
than digest. Browser adapter conformance is operator-controlled.
