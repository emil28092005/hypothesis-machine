# Graph Report - hypothesis-machine  (2026-08-01)

## Corpus Check
- 45 files · ~18,068 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 331 nodes · 619 edges · 21 communities (14 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8f308ece`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `AgentTree` - 44 edges
2. `ResearchMemory` - 22 edges
3. `SupervisorIntegration` - 22 edges
4. `RunStore` - 21 edges
5. `WebGateway` - 18 edges
6. `AgentRecord` - 18 edges
7. `ResearchLoop` - 14 edges
8. `ExperimentRunner` - 14 edges
9. `compilerOptions` - 13 edges
10. `HypothesisMachineConfig` - 10 edges

## Surprising Connections (you probably didn't know these)
- `FakeRuntime` --implements--> `AgentRuntime`  [EXTRACTED]
  tests/helpers.ts → src/types.ts
- `TreeRow` --references--> `AgentRecord`  [EXTRACTED]
  src/agent-tree-ui.ts → src/types.ts
- `FakeRuntimeFactory` --implements--> `AgentRuntimeFactory`  [EXTRACTED]
  tests/helpers.ts → src/types.ts
- `AgentTree` --references--> `AgentFactory`  [EXTRACTED]
  src/agent-tree.ts → src/agent-factory.ts
- `AgentTree` --references--> `RunManifest`  [EXTRACTED]
  src/agent-tree.ts → src/run-store.ts

## Import Cycles
- None detected.

## Communities (21 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (34): DEFAULT_CONFIG, HypothesisMachineConfig, loadConfig(), hypothesisMachine(), PiRuntimeDependencies, frontmatterDocument(), MEMORY_STATUSES, MEMORY_TYPES (+26 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (3): AgentTree, PiAgentRuntimeFactory, AgentResult

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (25): Browser Use adapter contract, Contributing, Local setup, Pull requests, Architecture, Development, Assumptions corrected after verification, Implemented here (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (33): dependencies, @earendil-works/pi-agent-core, @earendil-works/pi-ai, @earendil-works/pi-coding-agent, @earendil-works/pi-tui, typebox, yaml, description (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.18
Nodes (8): activityCache, agentLastActivity(), collapse(), createAgentPanelComponent(), createAgentTreeOverlay(), STATUS_COLOR, STATUS_ICON, TreeRow

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (15): AgentFactory, taskFingerprint(), AgentTreeError, TreeOptions, RunManifest, RunStore, AgentRecord, AgentRuntime (+7 more)

### Community 8 - "Community 8"
Cohesion: 0.27
Nodes (9): AgentSpecError, ALLOWED_TOOLS, parseAgentSpec(), readAgentSpec(), REQUIRED_SECTIONS, section(), serializeAgentSpec(), writeAgentSpec() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (4): IterationReport, LoopStatus, ResearchLoop, ResearchLoopState

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, module, moduleResolution, noUncheckedIndexedAccess, outDir, resolveJsonModule (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (7): compilerOptions, declaration, outDir, rootDir, exclude, extends, include

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): 0.1.0 — 2026-07-31, 0.1.1 — 2026-07-31, Changelog, Unreleased

### Community 15 - "Community 15"
Cohesion: 0.50
Nodes (3): Security and data, Summary, Verification

### Community 16 - "Community 16"
Cohesion: 0.50
Nodes (3): child, commands, responses

## Knowledge Gaps
- **105 isolated node(s):** `name`, `version`, `description`, `keywords`, `type` (+100 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AgentTree` connect `Community 1` to `Community 0`, `Community 10`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `SupervisorIntegration` connect `Community 10` to `Community 0`, `Community 1`, `Community 9`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `ResearchMemory` connect `Community 0` to `Community 10`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _105 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.058596491228070174 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11942959001782531 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0677361853832442 - nodes in this community are weakly interconnected._