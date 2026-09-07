# Graph Report - tradingview-mcp  (2026-09-07)

## Corpus Check
- 1 files · ~61,651 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 511 nodes · 1141 edges · 32 communities (21 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Chart Data Extraction
- Target CDP Connections
- Session Concurrency Core
- Chart Core Operations
- MCP Tool Registration
- Package Configuration
- CLI Command Runtime
- Local Security and Sessions
- Desktop Lifecycle
- Replay Controls
- Live Validation Tools
- Multi Session Architecture
- Pine Editor Automation
- Pine Strategy Guidance
- Agent Research Foundations
- Pine Push Script
- LangChain Worker Example
- Multi Symbol Analysis
- CLI Test Harness
- Legacy Architecture Audit
- Replay Practice Workflow
- Pine Pull Script
- CI Quality Gates
- Contribution Guidance
- Electron Shell Isolation
- Linux Launch Script
- macOS Launch Script
- Context Management
- Failure Transparency
- Agent Tool Design

## God Nodes (most connected - your core abstractions)
1. `evaluate()` - 98 edges
2. `jsonResult()` - 30 edges
3. `safeString()` - 26 edges
4. `getClient()` - 25 edges
5. `evaluateAsync()` - 21 edges
6. `SessionRuntime` - 19 edges
7. `SessionManager` - 19 edges
8. `TabPool` - 17 edges
9. `register()` - 16 edges
10. `TargetConnectionManager` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Pine Script as Agent Output` --semantically_similar_to--> `Compile Error Fix Loop`  [INFERRED] [semantically similar]
  RESEARCH.md → skills/pine-develop/SKILL.md
- `Strategy Performance Analysis` --semantically_similar_to--> `Strategy Performance Report`  [INFERRED] [semantically similar]
  agents/performance-analyst.md → skills/strategy-report/SKILL.md
- `Multi-Asset Agent Reasoning` --semantically_similar_to--> `Multi-Symbol Scanner`  [INFERRED] [semantically similar]
  RESEARCH.md → skills/multi-symbol-scan/SKILL.md
- `registrations()` --indirect_call--> `registerTabTools()`  [INFERRED]
  tests/tool_surface.test.js → src/tools/tab.js
- `Claude Code Setup Guide` --conceptually_related_to--> `Localhost Debug Port Isolation`  [INFERRED]
  SETUP_GUIDE.md → SECURITY.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Compact Agent Context Design** — research_context_window_constraints, research_granular_tool_design [EXTRACTED 1.00]
- **Layered Concurrency Control** — docs_multi_session_target_fifo_mutex, docs_multi_session_electron_shell_mutex, docs_multi_session_exclusive_session_ownership [EXTRACTED 1.00]
- **Multi-Session Target Isolation** — claude_target_scoped_cdp_client, contributing_explicit_target_ownership, docs_multi_session_exclusive_session_ownership, readme_independent_cached_cdp_clients [INFERRED 0.95]
- **Session Routing Architecture** — readme_session_manager, readme_tab_pool, readme_target_connection_manager, readme_independent_cached_cdp_clients [EXTRACTED 1.00]
- **Concurrency Locking Model** — readme_per_target_fifo_locks, readme_shell_lock, readme_account_lock [EXTRACTED 1.00]
- **Multi-Session Verification** — readme_live_target_isolation_testing, readme_background_renderer_testing, readme_session_capacity_benchmark [EXTRACTED 1.00]

## Communities (32 total, 9 thin omitted)

### Community 0 - "Chart Data Extraction"
Cohesion: 0.06
Nodes (76): evaluate(), evaluateAsync(), getClient(), getCurrentTargetId(), KNOWN_PATHS, CONDITION_TYPE_MAP, create(), deleteAlerts() (+68 more)

### Community 1 - "Target CDP Connections"
Cohesion: 0.06
Nodes (48): configurations, sessions, closeAllTargetClients(), closeTargetClient(), connect(), disconnect(), evaluateAsyncOnTarget(), evaluateOnTarget() (+40 more)

### Community 2 - "Session Concurrency Core"
Cohesion: 0.06
Nodes (11): runWithTarget(), KeyedMutex, Mutex, shellMutex, targetMutexes, publicSession(), defaultPool(), SessionRuntime (+3 more)

### Community 3 - "Chart Core Operations"
Cohesion: 0.10
Nodes (32): getChartApi(), getChartCollection(), requireFinite(), safeString(), batchRun(), __dirname, SCREENSHOT_DIR, getState() (+24 more)

### Community 4 - "MCP Tool Registration"
Cohesion: 0.14
Nodes (25): accountMutex, routedServer, server, transport, registerAlertTools(), registerBatchTools(), registerCaptureTools(), registerChartTools() (+17 more)

### Community 5 - "Package Configuration"
Cohesion: 0.06
Nodes (31): chrome-remote-interface, eslint, @modelcontextprotocol/sdk, bin, tv, dependencies, chrome-remote-interface, @modelcontextprotocol/sdk (+23 more)

### Community 6 - "CLI Command Runtime"
Cohesion: 0.15
Nodes (10): commands, execute(), handleError(), printCommandHelp(), printHelp(), register(), run(), REPO_ROOT (+2 more)

### Community 7 - "Local Security and Sessions"
Cohesion: 0.08
Nodes (25): Concurrent Worker Sessions, Tab Switch Is Visible UI Only, Target-Scoped CDP Client, TradingView MCP Claude Instructions, Account-Wide Mutation Lock, Atomic Target Assignment, Background Renderer Testing, Compact Context Management (+17 more)

### Community 8 - "Desktop Lifecycle"
Cohesion: 0.14
Nodes (15): CDP_HOST, CDP_PORT, checkForUpdate(), _copyMsixPackageLocal(), discover(), healthCheck(), launch(), _resolveLaunchDeps() (+7 more)

### Community 9 - "Replay Controls"
Cohesion: 0.39
Nodes (13): getReplayApi(), autoplay(), _resolve(), start(), status(), step(), stop(), trade() (+5 more)

### Community 10 - "Live Validation Tools"
Cohesion: 0.15
Nodes (10): levels, report, success, symbols, configurations, sessions, captureScreenshot(), __dirname (+2 more)

### Community 11 - "Multi Session Architecture"
Cohesion: 0.22
Nodes (9): Explicit Target Ownership, Exclusive Session Target Ownership, Multi-Session TradingView Workers, Stale Session Failure Without Rebinding, Per-Target FIFO Mutex, Independent Cached CDP Clients, Session Manager, Tab Pool (+1 more)

### Community 12 - "Pine Editor Automation"
Cohesion: 0.36
Nodes (4): apiExists(), ensureEditor(), evaluate(), sleep()

### Community 13 - "Pine Strategy Guidance"
Cohesion: 0.29
Nodes (7): Edge Quality Assessment, Strategy Performance Analysis, Pine Script as Agent Output, Compile Error Fix Loop, Pine Script Development Loop, Strategy Improvement Rules, Strategy Performance Report

### Community 14 - "Agent Research Foundations"
Cohesion: 0.33
Nodes (6): Agent-Forward Trading, FinAgent, FinGPT, Model Context Protocol, ReAct, Toolformer

### Community 15 - "Pine Push Script"
Cohesion: 0.33
Nodes (5): escaped, src, srcPath, t, targets

### Community 16 - "LangChain Worker Example"
Cohesion: 0.50
Nodes (4): decode_result(), main(), Concurrent LangChain workers using isolated TradingView MCP sessions., Decode the JSON text returned by this MCP's structured tools.

### Community 17 - "Multi Symbol Analysis"
Cohesion: 0.40
Nodes (5): Multi-Asset Agent Reasoning, Chart Analysis Workflow, Visual Confirmation, Multi-Symbol Scanner, Ranked Scan Results

### Community 19 - "Legacy Architecture Audit"
Cohesion: 0.50
Nodes (4): Implicit Globally Active Target Dependency, Multi-Session Architecture Audit, Singleton CDP Connection Lifecycle, Repository Connection and Isolation Inspection Query

### Community 20 - "Replay Practice Workflow"
Cohesion: 0.50
Nodes (4): Human-in-the-Loop Design, Temporal Consistency, Replay Practice Trading, Simulated Trade Review

### Community 21 - "Pine Pull Script"
Cohesion: 0.50
Nodes (3): outPath, t, targets

## Knowledge Gaps
- **103 isolated node(s):** `CONDITION_TYPE_MAP`, `LAYOUT_NAMES`, `levels`, `report`, `success` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 162 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `evaluate()` connect `Chart Data Extraction` to `Target CDP Connections`, `Chart Core Operations`, `Desktop Lifecycle`, `Replay Controls`, `Live Validation Tools`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `TabPool` connect `Session Concurrency Core` to `Target CDP Connections`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `SessionManager` connect `Session Concurrency Core` to `Target CDP Connections`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `CONDITION_TYPE_MAP`, `LAYOUT_NAMES`, `levels` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Chart Data Extraction` be split into smaller, more focused modules?**
  _Cohesion score 0.056862745098039215 - nodes in this community are weakly interconnected._
- **Should `Target CDP Connections` be split into smaller, more focused modules?**
  _Cohesion score 0.06299603174603174 - nodes in this community are weakly interconnected._
- **Should `Session Concurrency Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06493506493506493 - nodes in this community are weakly interconnected._