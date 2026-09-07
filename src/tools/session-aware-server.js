import {z} from 'zod';
import {jsonResult} from './_format.js';
import {accountMutex} from '../core/locks.js';

const NON_SESSION_TOOLS = new Set([
  'tv_health_check',
  'tv_discover',
  'tv_ui_state',
  'tv_launch',
  'tv_update',
  'tab_list',
  'tab_new',
  'tab_close',
  'tab_switch',
  'layout_new',
  'symbol_search',
  'pine_analyze',
  'pine_check',
]);

const ACCOUNT_SCOPED_MUTATIONS = new Set([
  'alert_create',
  'alert_delete',
  'watchlist_add',
  'watchlist_add_bulk',
  'watchlist_remove',
  'pine_save',
]);

/**
 * Adds optional session routing to existing target-sensitive MCP tools without
 * duplicating their tool surface.
 */
export function sessionAwareServer(server, runtime) {
  return {
    tool(name, description, schema, handler) {
      if (NON_SESSION_TOOLS.has(name) || name.startsWith('tv_session_')) {
        return server.tool(name, description, schema, handler);
      }
      const routedSchema = {
        ...schema,
        session_id: z.string().optional().describe(
          'TradingView session to operate on. Omit for legacy active-chart ' +
            'behavior. A session stays bound to its CDP page target and does ' +
            'not visually switch tabs.',
        ),
      };
      const routedDescription = `${description} When session_id is supplied, ` +
        'this operates on that session\'s isolated chart target without ' +
        'changing the visible tab. Omit session_id only for legacy ' +
        'single-chart use.';
      return server.tool(name, routedDescription, routedSchema, async (args) => {
        if (!args.session_id) {
          return handler(args);
        }
        try {
          const execute = () => runtime.run(
            args.session_id,
            () => handler(args),
            {toolName: name, args},
          );
          if (ACCOUNT_SCOPED_MUTATIONS.has(name)) {
            return await accountMutex.runExclusive(execute);
          }
          return await execute();
        } catch (error) {
          return jsonResult({
            success: false,
            error: error.message,
            hint: 'Call tv_session_status or tv_session_list; do not use ' +
              'tab_switch to repair a worker session.',
          }, true);
        }
      });
    },
  };
}
