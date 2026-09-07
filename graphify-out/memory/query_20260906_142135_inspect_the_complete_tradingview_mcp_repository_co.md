---
type: "query"
date: "2026-09-06T14:21:35.093252+00:00"
question: "Inspect the complete TradingView MCP repository connection lifecycle, target isolation, tab shell, and all global evaluate/getClient dependencies before implementing multi-session concurrency."
contributor: "graphify"
outcome: "useful"
source_nodes: ["connection.js", "getClient()", "reconnectTo()", "withShell()", "core/tab.js", "core/data.js"]
---

# Q: Inspect the complete TradingView MCP repository connection lifecycle, target isolation, tab shell, and all global evaluate/getClient dependencies before implementing multi-session concurrency.

## Answer

Expanded from original query via graph vocabulary: [connection, connect, reconnect, client, target, targets, evaluate, tab, shell, chart, data, batch]. The graph showed a singleton client/targetInfo in src/connection.js, reconnectTo driven by tab_switch, shell operations in src/core/tab.js, and implicit global evaluate/getClient dependencies across chart/data/Pine/UI modules. Verified against source and recorded the eight-part audit in docs/architecture-audit.md.

## Outcome

- Signal: useful

## Source Nodes

- connection.js
- getClient()
- reconnectTo()
- withShell()
- core/tab.js
- core/data.js