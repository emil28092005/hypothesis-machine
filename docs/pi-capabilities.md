# Verified Pi capabilities (0.83.0)

Verified on 2026-07-31 against the published TypeScript declarations for
`@earendil-works/pi-coding-agent@0.83.0`, compatibility-tested against Pi 0.78.0, the current
[Pi documentation](https://pi.dev/docs/latest), and the official
[`earendil-works/pi`](https://github.com/earendil-works/pi) repository.

## Reused from Pi

Hypothesis Machine is an extension package. Pi remains responsible for the TUI,
normal chat, model selection, credentials, streaming, parallel tool calls,
history, compaction, branch summaries, steering/follow-up queues, slash-command
dispatch, lifecycle events, tool rendering, and model/provider execution.

Each child is created by the official SDK `createAgentSession()`. It receives:

- a persistent `SessionManager` in the research run's `sessions/` directory;
- the parent's selected `Model` and thinking level;
- one shared official model/auth service: `ModelRuntime` on Pi 0.83+, or the
  parent context's `ModelRegistry` on Pi 0.78;
- a `DefaultResourceLoader` that keeps project context but disables extension
  rediscovery for the child (the recursive tools are injected explicitly);
- only its allowed read-only built-ins and Hypothesis Machine custom tools.

`AgentSession.prompt()`, `steer()`, `followUp()`, `abort()`, `subscribe()`, and
`dispose()` provide the actual loop and lifecycle. Hypothesis Machine does not
implement an LLM/tool loop.

The Supervisor extension uses `registerTool`, `registerCommand`, custom tool
rendering, `session_start`, `session_shutdown`, `appendEntry`, `sendUserMessage`,
notifications, and status widgets. The `hypothesis-machine-run` custom entry ties
the root Pi session to a run manifest without copying its conversation.

## Implemented here

Pi does not provide a recursive research registry, domain memory, research stop
policy, web-source gateway, or Docker experiment protocol. This package adds:

- `AgentTree` and `AgentFactory`, including generated/validated Markdown specs;
- coded recursion limits, duplicate-task checks, independent replication flags,
  branch cancellation, result collection, and restart recovery;
- Markdown subject memory plus a rebuildable SQLite FTS5 index;
- SearXNG → Firecrawl → optional Browser Use adapter routing;
- URL canonicalization, SSRF checks, source hashing/cache/provenance;
- an explicit bounded iteration state machine;
- frozen test plans and networkless, resource-limited Docker experiments.

## Assumptions corrected after verification

1. `AgentSessionRuntime` owns replacement of the active interactive session
   (`newSession`, switch, fork, import). It is not required for independent child
   sessions; those use `createAgentSession` directly.
2. In Pi 0.83, `ExtensionContext` exposes `model`, `thinkingLevel`, and a
   compatibility `ModelRegistry`, but not the parent `ModelRuntime` instance. The
   extension creates one canonical `ModelRuntime` and shares it across children.
   In Pi 0.78, `createAgentSession` instead accepts the full `ModelRegistry`, so
   the exact registry exposed by the parent context is reused. No key is read or
   copied by Hypothesis Machine in either path.
3. The official `subagent/` example currently launches `pi --mode json` child
   processes. It is a reference, not a dependency; this project instead uses
   persistent in-process `AgentSession`s so steering, follow-up, recursive tools,
   and session restoration remain direct SDK operations.
4. Extension factories can run without a session. Background resources must be
   created during `session_start` and cleaned up during `session_shutdown`.
5. Custom tool calls are parallel by default. Only `run_experiment` is forced to
   sequential execution because it mutates an experiment directory.
6. Plain custom session entries do not enter model context. They are suitable for
   the run pointer; findings belong in separate Markdown memory.
7. Current open-source Browser Use agent/MCP operation requires separate model
   credentials. Passing Pi credentials to a Python worker would violate the
   design, so the MVP exposes a documented local adapter boundary and uses
   Firecrawl as the no-extra-model dynamic-page path.
8. Pi 0.78 predates `agent_settled`; autonomous continuation additionally listens
   to `agent_end`, guarded by iteration identity and `ctx.isIdle()` so 0.83 does
   not schedule duplicate continuation turns.

Primary references: [SDK](https://pi.dev/docs/latest/sdk),
[Extensions](https://pi.dev/docs/latest/extensions),
[session format](https://pi.dev/docs/latest/session-format), and the official
[`subagent` example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent).
