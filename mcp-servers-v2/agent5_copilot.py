"""
PAF_AGENT_COPILOT - Universal Copilot
Streamable-HTTP MCP server (6 tools, designed for ~8 max iterations, LLM: xAI Grok-3-Fast)

Free-form natural language Q&A over any customer, product, alert, or
portfolio question. Combines structured lookups across the IRM schema
with an Oracle Select AI escape hatch for ad-hoc questions that don't
map to a predefined tool.
"""

import os
from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.middleware import Middleware

from irm_data import (
    get_customer_360 as _get_customer_360,
    search_customers,
    search_customer_products,
    get_aum_changes,
    find_outlier_customers,
    get_product_catalog,
    get_alerts,
    get_meeting_notes,
    query_table,
    ALLOWED_TABLES,
)
from db import run_select_ai, run_select_ai_narrate
from mcp_middleware import EnsureJSONContentTypeMiddleware

load_dotenv()

mcp = FastMCP("PAF_AGENT_COPILOT")


@mcp.tool()
def get_customer_360(customer_id: str):
    """
    Get a complete 360 view of one customer: profile, portfolio holdings,
    open alerts, recent meeting notes, and campaign eligibility. Use this
    whenever a question is about a specific named/identified customer.

    Args:
        customer_id: The CUSTOMER_ID (CIF) to look up.
    """
    return _get_customer_360(customer_id)


@mcp.tool()
def find_customers(name: str = None, tier: str = None, risk_profile: str = None,
                    rm_user_id: str = None, kyc_status: str = None, limit: int = 50):
    """
    Search for customers by name, tier, risk profile, assigned RM, or KYC
    status. Use this to resolve a customer's CUSTOMER_ID before calling
    get_customer_360, or to answer questions like "which customers does
    RM X manage" or "list all Nasabah Prioritas customers".

    Args:
        name: Partial customer name to search for (case-insensitive).
        tier: Customer tier, e.g. 'Nasabah Prioritas', 'Regular'.
        risk_profile: Risk profile, e.g. 'Conservative', 'Moderate'.
        rm_user_id: RM_USERS.USER_ID of the assigned relationship manager.
        kyc_status: KYC status filter, e.g. 'VALID', 'EXPIRING'.
        limit: Max number of customers to return (default 50).
    """
    return {"customers": search_customers(name=name, tier=tier, risk_profile=risk_profile,
                                           rm_user_id=rm_user_id, kyc_status=kyc_status, limit=limit)}


@mcp.tool()
def find_customer_products(product_name: str = None, category: str = None,
                           status: str = None, customer_id: str = None, limit: int = 50):
    """
    Search customer product holdings across all customers. Use this to
    answer questions like "nasabah dengan produk reksadana saham",
    "siapa yang punya deposito", or "customer holding ORI024".

    Returns each holding with the customer name, tier, risk profile,
    product name, category, amount, status, and return percentage.

    Args:
        product_name: Partial product name to search (case-insensitive),
            e.g. "Reksa Dana Saham", "Deposito", "ORI024".
        category: Product category filter, e.g. "reksa_dana", "deposito", "obligasi".
        status: Holding status filter, e.g. "Active", "Matured".
        customer_id: Optional CUSTOMER_ID to restrict to one customer.
        limit: Max number of results (default 50).
    """
    results = search_customer_products(
        product_name=product_name, category=category,
        status=status, customer_id=customer_id, limit=limit,
    )
    return {"total": len(results), "holdings": results}


@mcp.tool()
def get_aum_change_report(min_change_pct: float = 5.0, direction: str = None, limit: int = 20):
    """
    Get customers whose AUM changed significantly vs previous month.
    Use this to answer "nasabah mana yang AUM-nya turun/naik signifikan"
    or "tampilkan perubahan AUM bulan ini".

    Args:
        min_change_pct: Minimum absolute change percentage to include (default 5%).
        direction: "down" for drops only, "up" for growth only, None for both.
        limit: Max results (default 20).
    """
    results = get_aum_changes(min_change_pct=min_change_pct, direction=direction, limit=limit)
    return {"total": len(results), "customers": results}


@mcp.tool()
def detect_outlier_customers(limit: int = 20):
    """
    Identify customers with outlier profiles: AUM disproportionate to
    income, portfolio allocation mismatched with risk profile, abnormal
    AUM growth/decline, or other anomalies flagged in notes.

    Criteria used:
    - AUM/income ratio > 50x (abnormally high)
    - Very low income (< 15M/month) with significant AUM (> 200M)
    - AUM change > 15% month-over-month
    - Explicitly flagged as outlier in customer notes

    Args:
        limit: Max results (default 20).
    """
    results = find_outlier_customers(limit=limit)
    return {"total": len(results), "outliers": results}


@mcp.tool()
def browse_product_catalog(category: str = None, risk_level: str = None,
                            active_only: bool = True, min_rate: float = None, max_rate: float = None):
    """
    Browse the product catalog with optional filters. Use this for
    questions about available products, interest rates, tenures, or risk
    levels.

    Args:
        category: Product category, e.g. 'ORI', 'REKSADANA', 'DEPOSITO'.
        risk_level: Risk level, e.g. 'Conservative', 'Moderate', 'Aggressive'.
        active_only: If True (default), only return currently active products.
        min_rate: Optional minimum INTEREST_RATE.
        max_rate: Optional maximum INTEREST_RATE.
    """
    return {"products": get_product_catalog(category=category, risk_level=risk_level,
                                             active_only=active_only, min_rate=min_rate, max_rate=max_rate)}


@mcp.tool()
def find_alerts(customer_id: str = None, severity: str = None, status: str = None,
                alert_type: str = None, limit: int = 100):
    """
    Search alerts across the bank by customer, severity, status, or type.
    Use this for questions like "what high severity alerts are open" or
    "show me all KYC alerts for this customer".

    Args:
        customer_id: Optional CUSTOMER_ID to restrict to one customer.
        severity: Optional severity filter, e.g. 'HIGH', 'MEDIUM', 'LOW'.
        status: Optional status filter, e.g. 'OPEN', 'RESOLVED'. Pass None for all statuses.
        alert_type: Optional alert type, e.g. 'MATURITY', 'KYC', 'PORTFOLIO_LOSS', 'CAMPAIGN'.
        limit: Max number of alerts to return (default 100).
    """
    return {"alerts": get_alerts(customer_id=customer_id, severity=severity,
                                  status=status, alert_type=alert_type, limit=limit)}


@mcp.tool()
def search_meeting_notes(customer_id: str = None, rm_user_id: str = None,
                          keyword: str = None, limit: int = 10):
    """
    Search structured RM-customer meeting notes by customer, RM, or
    keyword. Use this for questions about what was discussed in past
    meetings, follow-up actions, or customer preferences mentioned to RMs.

    Args:
        customer_id: Optional CUSTOMER_ID to restrict to one customer.
        rm_user_id: Optional RM_USERS.USER_ID to restrict to one RM.
        keyword: Optional keyword/phrase to search for in note summaries and follow-ups.
        limit: Max number of notes to return (default 10).
    """
    return {"notes": get_meeting_notes(customer_id=customer_id, rm_user_id=rm_user_id,
                                        keyword=keyword, limit=limit)}


@mcp.tool()
def lookup_table(table_name: str, customer_id: str = None, limit: int = 50):
    """
    Query any IRM database table directly. Use this to access tables not
    covered by other specific tools, such as:
    CREDIT_CARDS, CREDIT_CARD_PAYMENTS, CUSTOMER_ASSETS, CUSTOMER_GOALS,
    CUSTOMER_INCOME_SOURCES, CALL_CENTER_TRANSCRIPTS, RM_APPOINTMENTS,
    RM_TASKS, DEPOSIT_PAYMENT_SCHEDULE, MARKET_DATA, PRODUCT_PERFORMANCE,
    EXEC_AUM_MONTHLY, GOAL_TYPES, ALERT_ACTIONS, etc.

    Sensitive columns (CARD_NUMBER) are automatically masked for security.

    Args:
        table_name: The table to query, e.g. "CREDIT_CARDS", "CUSTOMER_ASSETS".
        customer_id: Optional CUSTOMER_ID to filter results for one customer.
        limit: Max rows to return (default 50).
    """
    results = query_table(table_name, customer_id=customer_id, limit=limit)
    if isinstance(results, dict) and "error" in results:
        return results
    return {"table": table_name.upper(), "total": len(results), "rows": results}


@mcp.tool()
def ask_irm_database(question: str, mode: str = "data"):
    """
    Ask any free-form natural-language question that the other structured
    tools don't directly cover. Uses Oracle Select AI (DBMS_CLOUD_AI) to
    translate the question into SQL against the IRM schema (CUSTOMERS,
    CUSTOMER_PRODUCTS, PRODUCT_CATALOG, ALERTS, CAMPAIGNS,
    CAMPAIGN_ELIGIBILITY, MEETING_NOTES, RM_USERS) and execute it.

    Args:
        question: The natural-language question, e.g.
            "Which 5 customers have the highest total AUM?" or
            "How many open high severity alerts are there per branch?"
        mode: 'data' (default) returns query result rows; 'narrate' returns
            a natural-language explanation instead of raw rows.
    """
    if mode == "narrate":
        return {"question": question, "answer": run_select_ai_narrate(question)}
    rows = run_select_ai(question)
    return {"question": question, "total_records": len(rows), "result": rows}


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENT_COPILOT_PORT", "9015")),
        middleware=[Middleware(EnsureJSONContentTypeMiddleware)],
        stateless_http=True,
        json_response=True,
    )
