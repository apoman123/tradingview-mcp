"""Concurrent LangChain workers using isolated TradingView MCP sessions."""

import asyncio
import json
from langchain_mcp_adapters.client import MultiServerMCPClient


def decode_result(value):
    """Decode the JSON text returned by this MCP's structured tools."""
    if isinstance(value, str):
        return json.loads(value)
    return value


async def main() -> None:
    client = MultiServerMCPClient({
        "tradingview": {
            "transport": "stdio",
            "command": "node",
            "args": ["src/server.js"],
        }
    })
    tools = {tool.name: tool for tool in await client.get_tools()}
    requests = [
        ("btc_worker", "BINANCE:BTCUSDT", "15"),
        ("eth_worker", "BINANCE:ETHUSDT", "60"),
        ("sol_worker", "BINANCE:SOLUSDT", "5"),
    ]
    raw_sessions = await asyncio.gather(*[
        tools["tv_session_create"].ainvoke({
            "worker_label": label,
            "symbol": symbol,
            "timeframe": timeframe,
        })
        for label, symbol, timeframe in requests
    ])
    sessions = [decode_result(session) for session in raw_sessions]

    async def analyze(session_id: str) -> dict:
        state, ohlcv, studies = await asyncio.gather(
            tools["chart_get_state"].ainvoke({"session_id": session_id}),
            tools["data_get_ohlcv"].ainvoke({
                "session_id": session_id,
                "count": 100,
                "summary": True,
            }),
            tools["data_get_study_values"].ainvoke({
                "session_id": session_id,
            }),
        )
        return {"session_id": session_id, "state": state,
                "ohlcv": ohlcv, "studies": studies}

    try:
        # Each task owns one session, and each session owns one CDP page target.
        # No worker calls tab_switch; the human-visible tab is independent.
        results = await asyncio.gather(*[
            analyze(session["session_id"]) for session in sessions
        ])
        print(results)
    finally:
        await asyncio.gather(*[
            tools["tv_session_release"].ainvoke({
                "session_id": session["session_id"],
            })
            for session in sessions
        ])


if __name__ == "__main__":
    asyncio.run(main())
