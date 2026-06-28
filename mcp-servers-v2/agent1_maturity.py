"""
PAF_AGENT_MATURITY - Maturity Reminder
Streamable-HTTP MCP server (3 tools, designed for ~5 max iterations, LLM: xAI Grok-3-Fast)

Detects maturing deposits/investments, builds a 360 view of the affected
customer, and surfaces reinvestment options so the agent can generate a
proactive RM action plan (Scenario 1 of the IRM mockups).
"""

import os
from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.middleware import Middleware

from irm_data import (
    get_maturing_products,
    get_customer_360,
    get_product_catalog,
)
from mcp_middleware import EnsureJSONContentTypeMiddleware

load_dotenv()

mcp = FastMCP("PAF_AGENT_MATURITY")


@mcp.tool()
def get_maturing_holdings(days_ahead: int = 30, customer_id: str = None, category: str = None):
    """
    Find active customer holdings (deposits, bonds, etc.) that mature
    within the next `days_ahead` days. Each result includes the owning
    customer's profile (tier, risk profile, AUM, assigned RM) so the agent
    can prioritise which maturities need an RM follow-up first.

    Args:
        days_ahead: Look-ahead window in days (default 30).
        customer_id: Optional CUSTOMER_ID to restrict to a single customer.
        category: Optional product category filter (e.g. 'DEPOSITO', 'ORI').
    """
    return {"holdings": get_maturing_products(days_ahead, customer_id, category)}


@mcp.tool()
def get_customer_profile(customer_id: str):
    """
    Get the full Customer 360 profile for one customer: demographic/AUM
    data, current portfolio holdings, open alerts, recent RM meeting
    notes, and any active campaign eligibility. Use this to understand the
    customer's financial situation before drafting a maturity action plan.

    Args:
        customer_id: The CUSTOMER_ID (CIF) to look up.
    """
    return get_customer_360(customer_id)


@mcp.tool()
def get_reinvestment_options(risk_level: str = None, category: str = None, min_rate: float = None):
    """
    List active products from the catalog suitable for reinvesting a
    maturing balance, ordered by interest rate (highest first). Use the
    customer's RISK_PROFILE (from get_customer_profile) as `risk_level`
    to keep suggestions within their risk appetite.

    Args:
        risk_level: Filter by PRODUCT_CATALOG.RISK_LEVEL (e.g. 'Conservative', 'Moderate').
        category: Optional product category filter (e.g. 'ORI', 'DEPOSITO', 'REKSADANA').
        min_rate: Optional minimum INTEREST_RATE.
    """
    return {"options": get_product_catalog(category=category, risk_level=risk_level,
                                            active_only=True, min_rate=min_rate)}


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENT_MATURITY_PORT", "9011")),
        middleware=[Middleware(EnsureJSONContentTypeMiddleware)],
        stateless_http=True,
        json_response=True,
    )
