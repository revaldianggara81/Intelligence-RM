"""
PAF_AGENT_ALERT - Alert Manager
Streamable-HTTP MCP server (4 tools, designed for ~5 max iterations, LLM: Cohere Command R+)

Triages open alerts (maturity, KYC, campaign, portfolio loss, etc.) by
severity, radars upcoming maturities and KYC expiries, and lets the
agent acknowledge/resolve alerts (Scenario 3 and general alert triage).
"""

import os
from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.middleware import Middleware

from irm_data import (
    get_alerts,
    get_maturing_products,
    get_kyc_radar,
    update_alert_status,
)
from mcp_middleware import EnsureJSONContentTypeMiddleware

load_dotenv()

mcp = FastMCP("PAF_AGENT_ALERT")


@mcp.tool()
def get_open_alerts(severity: str = None, customer_id: str = None,
                     alert_type: str = None, status: str = "OPEN", limit: int = 100):
    """
    List alerts, most recent first, optionally filtered by severity,
    customer, alert type, or status. Use this to triage what needs RM
    attention right now. Each alert includes the affected customer's
    name, tier, and assigned RM.

    Args:
        severity: Optional severity filter, e.g. 'HIGH', 'MEDIUM', 'LOW'.
        customer_id: Optional CUSTOMER_ID to restrict to one customer.
        alert_type: Optional alert type filter, e.g. 'MATURITY', 'KYC', 'PORTFOLIO_LOSS', 'CAMPAIGN'.
        status: Alert status filter (default 'OPEN'). Pass None for all statuses.
        limit: Max number of alerts to return (default 100).
    """
    return {"alerts": get_alerts(customer_id=customer_id, severity=severity,
                                  status=status, alert_type=alert_type, limit=limit)}


@mcp.tool()
def get_maturity_radar(days_ahead: int = 30):
    """
    Radar of all active holdings across all customers that mature within
    `days_ahead` days, each enriched with the owning customer's profile.
    Use this to spot upcoming maturity-driven alerts before they're
    formally raised in ALERTS.

    Args:
        days_ahead: Look-ahead window in days (default 30).
    """
    return {"upcoming_maturities": get_maturing_products(days_ahead=days_ahead)}


@mcp.tool()
def get_kyc_expiry_radar(limit: int = 100):
    """
    Radar of customers whose KYC_STATUS is not in a clean valid state
    (e.g. expiring, expired, or pending review), ordered by status then
    AUM. Use this to identify customers needing KYC follow-up.

    Args:
        limit: Max number of customers to return (default 100).
    """
    return {"customers": get_kyc_radar(limit=limit)}


@mcp.tool()
def update_alert(alert_id: str, status: str, note: str = None):
    """
    Update the status of an alert, e.g. acknowledge or resolve it after
    the RM has taken action.

    Args:
        alert_id: The ALERT_ID to update.
        status: New status, e.g. 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'.
        note: Optional note describing the action taken.
    """
    return update_alert_status(alert_id, status, note)


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENT_ALERT_PORT", "9014")),
        middleware=[Middleware(EnsureJSONContentTypeMiddleware)],
        stateless_http=True,
        json_response=True,
    )
