# Browser Use adapter contract

`web_browse` talks only to a local HTTP adapter configured as `browser_use_url`.
The contract is:

```http
POST /browse
Content-Type: application/json

{"url":"https://example.org","task":"inspect the interactive table","allowedDomains":["example.org"],"ephemeralProfile":true}
```

The adapter must return JSON and must use a fresh browser profile. It must reject
navigation outside `allowedDomains` and all private/loopback/metadata addresses.

Browser Use's current open-source agent/MCP server requires its own LLM provider
credentials. Hypothesis Machine deliberately does not copy Pi credentials into a
Python worker. Consequently Browser Use is an optional adapter boundary in this
MVP, not started by the default Compose stack. Point `browser_use_url` at a locally
managed Browser Use service only if it satisfies the contract. Firecrawl remains
the default for dynamic rendering. See `docs/security.md`.
