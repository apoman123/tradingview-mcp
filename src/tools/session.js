import {z} from 'zod';
import {jsonResult} from './_format.js';
import {sessionRuntime} from '../core/session-runtime.js';

function failure(error) {
  return jsonResult({
    success: false,
    error: error.message,
    hint: 'Call tv_session_list to inspect sessions and available status.',
  }, true);
}

/** Registers the compact, agent-facing TradingView session lifecycle tools. */
export function registerSessionTools(server, runtime = sessionRuntime) {
  server.tool(
    'tv_session_create',
    'Acquire one chart tab and bind it to a new worker session. Use one ' +
      'session per concurrent worker. This may create a visible Desktop tab ' +
      'when the pool has no reusable tab; later chart calls do not switch UI.',
    {
      worker_label: z.string().max(100).optional().describe(
        'Short owner/worker label, such as btc_worker.',
      ),
      symbol: z.string().max(200).optional().describe(
        'Initial TradingView symbol, such as BINANCE:BTCUSDT.',
      ),
      timeframe: z.string().max(20).optional().describe(
        'Initial chart resolution, such as 15, 60, or D.',
      ),
    },
    async ({worker_label, symbol, timeframe}) => {
      try {
        return jsonResult({
          success: true,
          ...await runtime.create({
            workerLabel: worker_label,
            symbol,
            timeframe,
          }),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.tool(
    'tv_session_list',
    'List logical worker sessions and health. Use concise output normally; ' +
      'detailed output includes internal target IDs only for diagnostics.',
    {
      response_format: z.enum(['concise', 'detailed']).default('concise'),
    },
    async ({response_format}) => {
      try {
        const sessions = await runtime.list({
          detailed: response_format === 'detailed',
        });
        return jsonResult({success: true, session_count: sessions.length,
          sessions});
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.tool(
    'tv_session_status',
    'Validate one session and its bound chart tab. This does not change the ' +
      'visible TradingView tab and never silently rebinds a stale session.',
    {
      session_id: z.string().describe('Stable TradingView session ID.'),
      response_format: z.enum(['concise', 'detailed']).default('concise'),
    },
    async ({session_id, response_format}) => {
      try {
        return jsonResult({success: true, ...await runtime.status(session_id, {
          detailed: response_format === 'detailed',
        })});
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.tool(
    'tv_session_bind',
    'Explicitly rebind a session to an unclaimed loaded chart tab by tab ' +
      'index. Use this for deliberate recovery or assignment, not visual ' +
      'navigation. It does not call tab_switch.',
    {
      session_id: z.string().describe('Stable TradingView session ID.'),
      tab_index: z.coerce.number().int().min(0).describe(
        'Chart tab index from tab_list.',
      ),
    },
    async ({session_id, tab_index}) => {
      try {
        return jsonResult({success: true,
          ...await runtime.bind(session_id, tab_index)});
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.tool(
    'tv_session_release',
    'Release a worker session and return its chart tab to the reusable pool. ' +
      'This does not close the tab or change the visible Desktop UI.',
    {session_id: z.string().describe('Stable TradingView session ID.')},
    async ({session_id}) => {
      try {
        return jsonResult({success: true, ...await runtime.release(session_id)});
      } catch (error) {
        return failure(error);
      }
    },
  );
}
