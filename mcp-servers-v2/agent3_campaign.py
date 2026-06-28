"""
PAF_AGENT_CAMPAIGN - Campaign Manager
Streamable-HTTP MCP server (6 tools, designed for ~6 max iterations, LLM: Cohere Command R+)

Scans defined marketing campaigns (e.g. Privilege Upgrade), identifies
eligible customers via CAMPAIGN_ELIGIBILITY, and prepares personalised
RM approach scripts / outreach logs (Scenario 2b).
"""

import os
from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.middleware import Middleware

from irm_data import (
    get_campaigns,
    get_campaign_eligible_customers,
    check_campaign_eligibility,
    get_customer,
    add_meeting_note,
)
from mcp_middleware import EnsureJSONContentTypeMiddleware

load_dotenv()

mcp = FastMCP("PAF_AGENT_CAMPAIGN")


@mcp.tool()
def get_active_campaigns():
    """
    List all currently active marketing campaigns (e.g. Privilege Upgrade),
    including their TYPE, date range, and eligibility RULES. Use this to
    discover which campaigns are currently running.
    """
    return {"campaigns": get_campaigns(status="ACTIVE")}


@mcp.tool()
def get_campaign_details(campaign_id: str):
    """
    Get the full details and eligibility RULES for one campaign.

    Args:
        campaign_id: The CAMPAIGN_ID to look up.
    """
    campaigns = get_campaigns(campaign_id=campaign_id)
    if not campaigns:
        return {"error": f"Campaign {campaign_id} not found"}
    return campaigns[0]


@mcp.tool()
def get_eligible_customers(campaign_id: str, eligible_only: bool = True, limit: int = 200):
    """
    List customers evaluated against a campaign's eligibility rules,
    joined with their profile (tier, AUM, RM). Set eligible_only=False to
    also include near-miss / ineligible customers for nurturing.

    Args:
        campaign_id: The CAMPAIGN_ID to scan.
        eligible_only: If True (default), only return customers where IS_ELIGIBLE is true.
        limit: Max number of customers to return (default 200).
    """
    return {"customers": get_campaign_eligible_customers(campaign_id, eligible_only, limit)}


@mcp.tool()
def get_customer_eligibility(campaign_id: str, customer_id: str):
    """
    Check one specific customer's eligibility detail for one campaign,
    including their AUM_3M_AVG and whether they pass IS_ELIGIBLE.

    Args:
        campaign_id: The CAMPAIGN_ID.
        customer_id: The CUSTOMER_ID (CIF).
    """
    result = check_campaign_eligibility(campaign_id, customer_id)
    if not result:
        return {"error": f"No eligibility record for customer {customer_id} on campaign {campaign_id}"}
    return result


@mcp.tool()
def get_customer_profile(customer_id: str):
    """
    Get a customer's profile (name, tier, AUM, risk profile, assigned RM)
    to personalise the campaign approach script.

    Args:
        customer_id: The CUSTOMER_ID (CIF) to look up.
    """
    customer = get_customer(customer_id)
    if not customer:
        return {"error": f"Customer {customer_id} not found"}
    return customer


@mcp.tool()
def log_campaign_outreach(customer_id: str, rm_user_id: str, campaign_id: str,
                           pitch_summary: str, follow_up: str = None):
    """
    Record that a campaign-driven outreach pitch was generated/delivered
    for a customer, as a structured RM meeting note (so it shows up in
    the customer's history for future agents).

    Args:
        customer_id: The CUSTOMER_ID (CIF) being approached.
        rm_user_id: The RM_USERS.USER_ID of the relationship manager.
        campaign_id: The CAMPAIGN_ID this outreach relates to.
        pitch_summary: Short summary of the personalised pitch generated for this customer.
        follow_up: Optional suggested follow-up action/date for the RM.
    """
    summary = f"[Campaign {campaign_id}] {pitch_summary}"
    return add_meeting_note(customer_id, rm_user_id, summary, follow_up)


@mcp.tool()
def send_campaign_email(to_email: str, subject: str, body: str,
                        cc_email: str = None, customer_id: str = None,
                        campaign_id: str = None):
    """
    Send a campaign outreach email to a customer or RM via SMTP Gmail.
    Use this after generating a pitch to deliver it directly via email.

    The body supports plain text with line breaks. For professional
    formatting, use clear paragraphs and bullet points.

    Args:
        to_email: Recipient email address (customer or RM).
        subject: Email subject line.
        body: Email body content (plain text).
        cc_email: Optional CC email address.
        customer_id: Optional CUSTOMER_ID for logging purposes.
        campaign_id: Optional CAMPAIGN_ID for logging purposes.
    """
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    if not smtp_user or not smtp_pass or smtp_pass == "your-app-password-here":
        return {"error": "SMTP not configured. Set SMTP_USER and SMTP_PASS in .env"}

    msg = MIMEMultipart()
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg["Subject"] = subject
    if cc_email:
        msg["Cc"] = cc_email

    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            recipients = [to_email]
            if cc_email:
                recipients.append(cc_email)
            server.sendmail(smtp_user, recipients, msg.as_string())

        result = {
            "status": "sent",
            "to": to_email,
            "subject": subject,
        }
        if cc_email:
            result["cc"] = cc_email
        if customer_id:
            result["customer_id"] = customer_id
        if campaign_id:
            result["campaign_id"] = campaign_id
        return result
    except Exception as e:
        return {"error": f"Failed to send email: {str(e)}"}


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENT_CAMPAIGN_PORT", "9013")),
        middleware=[Middleware(EnsureJSONContentTypeMiddleware)],
        stateless_http=True,
        json_response=True,
    )
