# Multi-session architecture audit

This audit describes the repository before the multi-session implementation.

## 1. Current CDP connection lifecycle

`src/connection.js` owns one module-level CDP client. `getClient()` probes that
client with `Runtime.evaluate('1')`; on failure it clears the cached client and
calls `connect()`. `connect()` discovers either the first chart-like page target
or a requested target ID, opens one Chrome Remote Interface connection, enables
Runtime/Page/DOM, and stores it globally. `reconnectTo()` closes that global
client before connecting it to another target. `disconnect()` closes only that
same singleton.

## 2. Global/shared mutable connection state

- `src/connection.js`: module-level `client` and `targetInfo` singletons.
- `src/core/data.js`: module-level `_quoteLock`, which serializes every
  symbol-changing quote operation, regardless of target.
- `src/core/health.js`: `_updateCache`; unrelated to renderer selection.
- TradingView Desktop's Electron shell DOM and account-level TradingView state
  are externally shared resources even though they are not Node globals.

## 3. Current tab-to-target mapping

`src/core/tab.js#list()` reads `/json/list`, filters `type === 'page'` targets
whose URL is a TradingView chart or whose title is `New tab`, and exposes the
CDP target ID as the tab ID. The returned numeric index is derived from the CDP
list order; shell tab order is only assumed to usually match it. A landing page
can be replaced by a new renderer target when a layout is selected.

## 4. Electron shell versus chart page targets

The tab bar is hosted by a separate `app/window/index.html` Electron shell
target. Chart APIs, chart DOM, market data, Pine, and screenshots live in
individual TradingView page targets. Shell tab creation, closing, and visual
selection therefore require a shell-target connection, while chart work should
attach directly to the relevant chart page target. Existing `withShell()` probes
candidate shell targets for `.tabs-container .tab`; existing `withTarget()` is a
short-lived helper used only while choosing a layout on a landing target.

## 5. Implicit globally-active-target dependencies

All core modules that import `evaluate`, `evaluateAsync`, or `getClient` from
`src/connection.js` implicitly use the singleton target unless their function
supports `_deps` and the caller supplies an evaluator. This includes alerts,
batch, capture, data, health chart probes, indicators, pane, Pine renderer
operations, stream polling, UI, watchlist, and portions of drawing. Chart,
drawing, and replay have partial dependency-injection support, but normal MCP
handlers do not inject a target. `src/wait.js` also evaluates against the global
client, so even injected chart mutations can wait on the wrong page unless a
matching wait dependency is supplied. `tab_switch` calls `reconnectTo()`, making
visible selection and execution context the same global state.

## 6. Operations safe to run concurrently per target

Independent CDP clients can concurrently perform renderer-local reads on
different chart targets: chart state, symbol metadata, OHLCV, study values,
Pine graphics reads, most strategy reads, and CDP screenshots (subject to live
background-render validation). Renderer-local mutations may also run in
parallel when their target IDs differ, including symbol/timeframe changes,
indicator/Pine operations, replay controls, drawings, and pane operations.

## 7. Operations requiring synchronization

- Conflicting operations on the same chart target need a per-target queue,
  especially symbol/timeframe changes, quote's temporary symbol swap, indicator
  changes, Pine editor actions, replay, drawing, and UI interactions.
- Electron shell actions (create, close, visually show a tab) need one shell
  mutex because they mutate a shared tab bar and can replace renderer targets.
- Pool acquisition/release and session binding need atomic ownership updates so
  two workers cannot claim one target.
- Account-wide mutations such as alerts/watchlists should be treated
  conservatively even when initiated from separate renderers.
- No global lock is justified for ordinary operations on different targets.

## 8. Backward-compatibility risks

- Existing callers expect no session setup and expect `tab_switch` to redirect
  subsequent legacy operations.
- CLI commands and direct core imports use the implicit connection helpers.
- Existing output shapes and the public 84-tool surface should remain stable.
- `tab_new` currently reconnects the singleton to the created chart.
- Tests rely on optional `_deps` shapes in selected modules.
- CDP target IDs can disappear or change during landing-to-chart navigation;
  silently rediscovering the first chart would cause cross-session corruption.
- Background screenshots and renderer throttling are live-environment
  capabilities and cannot be assumed from unit tests.

