# Architecture

```text
interactive Pi AgentSession (Supervisor)
  ├─ Hypothesis Machine extension commands/tools
  ├─ explicit ResearchLoop state machine
  └─ AgentTree
       ├─ child AgentSession + SessionManager + recursive tools
       │    └─ grandchild AgentSession + ...
       └─ child AgentSession + ... (parallel)

subject results ──> Markdown memory ──> rebuildable SQLite FTS5 index
web tools       ──> SearXNG / Firecrawl / Browser adapter ──> sources
test plans      ──> Docker-only ExperimentRunner ──> artifacts
                                              └────> independent review verdict
```

The root conversational session is never replaced. A generated child spec is
validated before the tree manifest is changed. The child receives its own Pi
session file and custom tool set. Calling its `spawn_agent` repeats the same
factory path, which makes recursion a capability rather than a special role.

`AgentTree` is model-independent and depends on `AgentRuntimeFactory`. Production
uses `PiAgentRuntimeFactory`; tests use deterministic fake runtimes without paid
API calls. Results are captured from the child's final observable assistant text
and returned by foreground spawn or `agent_control wait/collect`.

The run manifest is small and atomic. On restore, previously running/waiting
agents become `interrupted`; their Pi session path and parent/child relationships
remain intact, and `start()` resumes through `SessionManager.open()`.

The research loop is not an auto-prompt recursion. Each model-driven iteration
must call `record_iteration` with measurable deltas. Code applies termination for
goal completion, methodological failure, external-only questions, user decision,
no information gain, or the absolute iteration cap.

Markdown/source bytes are authoritative. SQLite contains only derived search and
relation data and can be dropped/rebuilt. Pi JSONL remains authoritative for each
agent conversation.
