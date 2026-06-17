"""
Run all 5 PAF agent MCP (SSE) servers concurrently in a single process.

Usage:
    ../venv/bin/python run_all.py

Each server listens on its own port (see .env), all under SSE transport.
Press Ctrl+C to stop all of them at once.
"""

import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from agent1_maturity import mcp as maturity_mcp
from agent2_recommendation import mcp as recommendation_mcp
from agent3_campaign import mcp as campaign_mcp
from agent4_alert import mcp as alert_mcp
from agent5_copilot import mcp as copilot_mcp

HOST = os.getenv("MCP_HOST", "0.0.0.0")

SERVERS = [
    (maturity_mcp, int(os.getenv("AGENT_MATURITY_PORT", "9011"))),
    (recommendation_mcp, int(os.getenv("AGENT_RECOMMENDATION_PORT", "9012"))),
    (campaign_mcp, int(os.getenv("AGENT_CAMPAIGN_PORT", "9013"))),
    (alert_mcp, int(os.getenv("AGENT_ALERT_PORT", "9014"))),
    (copilot_mcp, int(os.getenv("AGENT_COPILOT_PORT", "9015"))),
]


async def main():
    print("Starting all PAF agent MCP servers (SSE):")
    for mcp, port in SERVERS:
        print(f"  - {mcp.name:<24} -> http://{HOST}:{port}/sse")

    await asyncio.gather(
        *[
            srv.run_async(transport="sse", host=HOST, port=port, show_banner=False)
            for srv, port in SERVERS
        ]
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped all PAF agent MCP servers.")
