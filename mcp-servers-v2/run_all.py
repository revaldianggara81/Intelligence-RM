"""Run all 5 MCP servers concurrently in one process (Ctrl+C to stop all)."""
import asyncio
import os
from dotenv import load_dotenv
from starlette.middleware import Middleware
from mcp_middleware import EnsureJSONContentTypeMiddleware

load_dotenv()

MIDDLEWARE = [Middleware(EnsureJSONContentTypeMiddleware)]
HOST = os.getenv("MCP_HOST", "0.0.0.0")

async def run_agent(module_name: str, port_env: str, default_port: int):
    import importlib
    mod = importlib.import_module(module_name)
    port = int(os.getenv(port_env, str(default_port)))
    await mod.mcp.run_async(
        transport="streamable-http",
        host=HOST,
        port=port,
        middleware=MIDDLEWARE,
        stateless_http=True,
    )

async def main():
    await asyncio.gather(
        run_agent("agent1_maturity",      "AGENT_MATURITY_PORT",      9011),
        run_agent("agent2_recommendation","AGENT_RECOMMENDATION_PORT", 9012),
        run_agent("agent3_campaign",      "AGENT_CAMPAIGN_PORT",       9013),
        run_agent("agent4_alert",         "AGENT_ALERT_PORT",          9014),
        run_agent("agent5_copilot",       "AGENT_COPILOT_PORT",        9015),
    )

if __name__ == "__main__":
    asyncio.run(main())
