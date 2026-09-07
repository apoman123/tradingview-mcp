# Multi-session TradingView workers

Each logical session exclusively owns one TradingView chart page target. The
target connection manager caches an independent CDP client per target and
deduplicates simultaneous connection creation for the same target. Session
execution never resolves through the currently visible tab.

## Recommended workflow

1. Call `tv_session_create` once per worker, optionally providing `symbol` and
   `timeframe`.
2. Run workers concurrently and pass the worker's `session_id` to every
   target-sensitive existing tool.
3. Aggregate the worker results.
4. Call `tv_session_release`; the tab remains open and becomes reusable.

Use `tv_session_status` when diagnosing a worker. Request
`response_format: "detailed"` only when an internal target ID or managed-tab
status is needed. Use `tv_session_bind` for a deliberate assignment to an
unclaimed tab. Never use `tab_switch` as worker routing: it is only a visible UI
action.

## Concurrency and ownership

- Independent chart targets have independent CDP clients and execute in
  parallel.
- Operations for one target pass through that target's FIFO mutex. This
  conservatively serializes reads and mutations on one renderer while allowing
  other renderers to proceed.
- Tab creation, close, and visual show operations pass through one Electron
  shell mutex.
- Account-wide alert/watchlist writes and Pine saves use a separate account
  mutex; unrelated renderer-local chart work is never placed behind it.
- Pool acquisition is atomic. A target cannot be owned by two sessions.
- Lock ordering is pool ownership first, then shell creation when a new slot is
  required. The pool lock is released before chart work begins. Session release
  takes the target lock before returning the slot. Account-wide mutations take
  the account lock before the target lock; no path acquires them in reverse.
- A missing renderer marks the session stale. No arbitrary replacement tab is
  selected.

Existing calls that omit `session_id` retain the legacy default-chart behavior.
`TV_TARGET_ID` can pin that legacy mode to one target for debugging; it is not
the multi-session architecture.

## Failure behavior

- If TradingView or the CDP endpoint closes, calls fail with the configured
  host/port and a `tv_launch` hint.
- If a user closes or navigates a worker tab, only that session becomes stale;
  its cached client is invalidated and it is never rebound automatically.
- If a user changes a worker chart's symbol/timeframe, session status reports
  drift. Data/Pine operations fail until the worker explicitly restores the
  expected chart state; chart state and corrective setters remain available.
- Concurrent session creation is atomic at the pool, so one target cannot be
  claimed twice. Creation/readiness failure returns the slot safely, marking a
  vanished target unhealthy.
- Releasing a session waits for its target queue, closes only that cached CDP
  client, keeps the Desktop tab open, and returns the slot for reuse.

## Live verification and capacity

Run `npm run test:sessions:live` with TradingView Desktop on the configured CDP
endpoint. It binds BTC/15m, ETH/1h, and SOL/5m, foregrounds one tab, performs
concurrent state/OHLCV/study/screenshot reads, and verifies symbol/timeframe
isolation on all three targets.

Run `npm run test:sessions:background` for the deliberately mutating capability
probe. With one tab foregrounded it checks state, symbol/timeframe changes,
OHLCV, study values, temporary indicator add/remove, Pine editor errors, and a
screenshot on the other background targets. It removes the temporary indicator
afterward, but opening Pine Editor can change the tested tabs' saved UI state.

Run `npm run benchmark:sessions` with `TV_TAB_POOL_SIZE=8` to measure 1, 2, 4,
and 8 sessions. Set `TV_BENCHMARK_SCREENSHOT=1` to include screenshots. Results
report latency, failures, process CPU, and process RSS delta; they are a local
capacity diagnostic, not a claim of linear scaling.

Background CDP state/data calls are expected to work, but Desktop versions may
throttle or suppress background rendering. Screenshot correctness must be
validated with the live script on the deployed Desktop version. A failed or
empty background capture is an environment capability failure and must not be
treated as valid chart evidence.

Renderer snippets retain the repository's existing `var` style intentionally:
they execute inside proprietary Desktop renderer builds where compatibility is
more important than applying Node-side style changes. New Node-side code uses
ES modules and `const`/`let`.
