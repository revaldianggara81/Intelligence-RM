# IRM PAF Agent MCP Servers (SSE)

5 MCP servers, one per PAF agent from the IRM mockups, each exposing tools
over **SSE transport** (FastMCP) against the `IRMDB` Oracle 26ai Autonomous
Database (wallet in `../wallet`, user `DBN`).

## Setup

```bash
cd /home/opc/workspace/Danamon/IRM
python3.11 -m venv venv
./venv/bin/pip install -r mcp-servers/requirements.txt
```

Connection settings (DB user/password/DSN, wallet path, ports) are in
`mcp-servers/.env`.

> Note: `DB_DSN` defaults to `irmdb_tp`. At the time this was built, the
> IRMDB Autonomous Database instance was **stopped** (ORA-12506 / listener
> refused on all service levels). Start the ADB instance in OCI before
> running these servers.

## Run

```bash
cd mcp-servers
./start_all.sh    # starts all 5 servers in background, logs in logs/
./stop_all.sh     # stops them
```

Or run one server in the foreground:

```bash
./venv/bin/python mcp-servers/agent1_maturity.py
```

Each server serves SSE at `http://<host>:<port>/sse`.

## Agents & Endpoints

| # | Agent | File | Port | Tools |
|---|-------|------|------|-------|
| 1 | Maturity Reminder (`PAF_AGENT_MATURITY`) | `agent1_maturity.py` | 9011 | `get_maturing_holdings`, `get_customer_profile`, `get_reinvestment_options` |
| 2 | Product Recommendation (`PAF_AGENT_RECOMMENDATION`) | `agent2_recommendation.py` | 9016 | `get_customer_profile`, `get_customer_portfolio_holdings`, `search_product_catalog`, `search_past_conversations`, `recommend_products` |
| 3 | Campaign Manager (`PAF_AGENT_CAMPAIGN`) | `agent3_campaign.py` | 9013 | `get_active_campaigns`, `get_campaign_details`, `get_eligible_customers`, `get_customer_eligibility`, `get_customer_profile`, `log_campaign_outreach` |
| 4 | Alert Manager (`PAF_AGENT_ALERT`) | `agent4_alert.py` | 9014 | `get_open_alerts`, `get_maturity_radar`, `get_kyc_expiry_radar`, `update_alert` |
| 5 | Universal Copilot (`PAF_AGENT_COPILOT`) | `agent5_copilot.py` | 9015 | `get_customer_360`, `find_customers`, `browse_product_catalog`, `find_alerts`, `search_meeting_notes`, `ask_irm_database` |

## Data layer

All tools read/write the structured tables described in the IRM data
layer design: `CUSTOMERS`, `CUSTOMER_PRODUCTS`, `PRODUCT_CATALOG`,
`ALERTS`, `CAMPAIGNS`, `CAMPAIGN_ELIGIBILITY`, `MEETING_NOTES`,
`RM_USERS`. Shared query/write logic lives in `irm_data.py`; the Oracle
connection (via wallet) and Select AI helpers live in `db.py`.

`agent5_copilot.py`'s `ask_irm_database` tool uses Oracle **Select AI**
(`DBMS_CLOUD_AI`) for free-form NL questions — set `SELECT_AI_PROFILE`
in `.env` to the name of an existing Select AI profile in the `DBN` schema.

## Run all 5 in one process

```bash
cd mcp-servers
../venv/bin/python run_all.py   # Ctrl+C to stop all 5 at once
```

This starts all 5 FastMCP SSE servers concurrently via `asyncio.gather` in a
single Python process (alternative to `start_all.sh`/`stop_all.sh`, which
run each agent as its own background process).

## Endpoints (VM `138.2.72.135`)

`MCP_HOST=0.0.0.0` in `.env`, so each server binds to all interfaces. Public
endpoints via the VM's external IP:

| # | Agent | SSE Endpoint |
|---|-------|--------------|
| 1 | Maturity Reminder (`PAF_AGENT_MATURITY`) | `http://138.2.72.135:9011/sse` |
| 2 | Product Recommendation (`PAF_AGENT_RECOMMENDATION`) | `http://138.2.72.135:9016/sse` |
| 3 | Campaign Manager (`PAF_AGENT_CAMPAIGN`) | `http://138.2.72.135:9013/sse` |
| 4 | Alert Manager (`PAF_AGENT_ALERT`) | `http://138.2.72.135:9014/sse` |
| 5 | Universal Copilot (`PAF_AGENT_COPILOT`) | `http://138.2.72.135:9015/sse` |

> Ports 9000-9010 are already in use by other services on this VM, so
> these agents use **9011-9015**. They are **not currently open** in this
> VM's firewall (`firewall-cmd --list-ports`). Open them for external
> access, e.g.:
> ```bash
> sudo firewall-cmd --permanent --add-port=9011-9015/tcp
> sudo firewall-cmd --reload
> ```
> Also check the OCI Security List / NSG for the VM's subnet allows inbound
> TCP 9011-9015 from the PAF source IP(s).

## Connecting from an MCP client

Example client config entry (SSE transport):

```json
{
  "mcpServers": {
    "irm-maturity": { "url": "http://138.2.72.135:9011/sse" },
    "irm-recommendation": { "url": "http://138.2.72.135:9016/sse" },
    "irm-campaign": { "url": "http://138.2.72.135:9013/sse" },
    "irm-alert": { "url": "http://138.2.72.135:9014/sse" },
    "irm-copilot": { "url": "http://138.2.72.135:9015/sse" }
  }
}
```
