"""
PAF_AGENT_RECOMMENDATION - Product Recommendation
Streamable-HTTP MCP server (5 tools, designed for ~6 max iterations, LLM: xAI Grok-3-Fast)

Matches a customer's financial profile and goals against the product
catalog (SQL) and past RM conversations (RAG over MEETING_NOTES) to
produce a ranked, justified recommendation list (Scenario 2a).
"""

import os
from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.middleware import Middleware

from irm_data import (
    get_customer,
    get_customer_portfolio,
    get_product_catalog,
    get_meeting_notes,
    recommend_products_for_customer,
)
from mcp_middleware import EnsureJSONContentTypeMiddleware

load_dotenv()

mcp = FastMCP("PAF_AGENT_RECOMMENDATION")


@mcp.tool()
def get_customer_profile(customer_id: str):
    """
    Get a customer's profile: tier, AUM, risk profile, KYC status, goals
    and assigned RM. Use this first to understand who you're building
    recommendations for.

    Args:
        customer_id: The CUSTOMER_ID (CIF) to look up.
    """
    customer = get_customer(customer_id)
    if not customer:
        return {"error": f"Customer {customer_id} not found"}
    return customer


@mcp.tool()
def get_customer_portfolio_holdings(customer_id: str, status: str = None):
    """
    Get a customer's current product holdings (deposits, mutual funds,
    bonds, etc.), optionally filtered by STATUS (e.g. 'ACTIVE'). Use this
    to see how their AUM is currently allocated across categories.

    Args:
        customer_id: The CUSTOMER_ID (CIF) to look up.
        status: Optional holding status filter, e.g. 'ACTIVE'.
    """
    return {"holdings": get_customer_portfolio(customer_id, status)}


@mcp.tool()
def search_product_catalog(category: str = None, risk_level: str = None,
                            min_rate: float = None, max_rate: float = None):
    """
    Browse the active product catalog, optionally filtered by category,
    risk level, or interest rate range. Use this to discover candidate
    products to recommend.

    Args:
        category: Product category, e.g. 'ORI', 'REKSADANA', 'DEPOSITO'.
        risk_level: Risk level, e.g. 'Conservative', 'Moderate', 'Aggressive'.
        min_rate: Minimum INTEREST_RATE.
        max_rate: Maximum INTEREST_RATE.
    """
    return {"products": get_product_catalog(category=category, risk_level=risk_level,
                                             active_only=True, min_rate=min_rate, max_rate=max_rate)}


@mcp.tool()
def search_past_conversations(customer_id: str = None, keyword: str = None, limit: int = 10):
    """
    Search past RM-customer meeting notes for relevant context (goals
    mentioned, products discussed, objections, preferences). Use this as
    a lightweight RAG step to ground recommendations in what the customer
    has actually said before.

    Args:
        customer_id: Optional CUSTOMER_ID to restrict the search to one customer.
        keyword: Optional keyword/phrase to search for in note summaries and follow-ups.
        limit: Max number of notes to return (default 10).
    """
    return {"notes": get_meeting_notes(customer_id=customer_id, keyword=keyword, limit=limit)}


@mcp.tool()
def recommend_products(customer_id: str, top_n: int = 5):
    """
    Generate a ranked list of product recommendations for a customer.
    Compares the customer's current portfolio allocation (by category)
    against the active product catalog filtered to their risk profile,
    and scores candidates by how under-represented their category is in
    the portfolio plus their interest rate. Use the returned scores and
    `current_allocation_pct` to explain *why* each product is recommended.

    Args:
        customer_id: The CUSTOMER_ID (CIF) to generate recommendations for.
        top_n: Number of top-ranked products to return (default 5).
    """
    return recommend_products_for_customer(customer_id, top_n)


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENT_RECOMMENDATION_PORT", "9012")),
        middleware=[Middleware(EnsureJSONContentTypeMiddleware)],
        stateless_http=True,
        json_response=True,
    )
