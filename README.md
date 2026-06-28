# Intelligence RM Platform

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 16.x+ (18.x recommended) | For web server |
| Python | 3.9+ | For MCP agent servers |
| Oracle ADB Wallet | — | Download from OCI Console |
| OCI API Key | — | For GenAI embedding & LLM |

> Oracle Instant Client is **not required** — the project uses `oracledb` thin mode.

## Setup

### 1. Configure Environment

```bash
cp web/.env.example web/.env
cp mcp-servers/.env.example mcp-servers/.env
cp mcp-servers-v2/.env.example mcp-servers-v2/.env
```

Edit each `.env` file — at minimum fill in:
- `DB_USER`, `DB_PASSWORD`, `DB_WALLET_DIR`, `DB_CONNECT_STRING`
- `OCI_TENANCY_ID`, `OCI_USER_ID`, `OCI_FINGERPRINT`, `OCI_KEY_FILE`
- `OCI_COMPARTMENT_ID`, `OCI_REGION`

### 2. Oracle Wallet

Download the ADB wallet from OCI Console and extract to the `wallet/` folder:

```bash
ls wallet/
# tnsnames.ora  sqlnet.ora  cwallet.sso  ewallet.p12 ...
```

Make sure `DB_WALLET_DIR` in your `.env` points to this directory.

### 3. OCI API Key

```bash
cp /path/to/your/oci_api_key.pem web/oci_api_key.pem
```

### 4. Install Dependencies

```bash
# Web (Node.js)
cd web && npm install && cd ..

# MCP Servers (Python)
python3 -m venv venv
source venv/bin/activate
pip install -r mcp-servers/requirements.txt
```

### 5. Initialize Database

```bash
cd web

# Create schema tables + seed data + generate embeddings
npm run setup

# Or run separately:
npm run init-db    # schema only
npm run seed-db    # seed data + embeddings
```

## Running

### Start MCP Agent Servers

```bash
cd mcp-servers

# All agents in a single process
../venv/bin/python run_all.py

# Or as background processes
./start_all.sh          # logs at logs/agent*.log
./stop_all.sh           # stop all
```

| Agent | Port |
|---|---|
| Maturity Reminder | 9011 |
| Product Recommendation | 9012 |
| Campaign Manager | 9013 |
| Alert Manager | 9014 |
| Universal Copilot | 9015 |
| Yahoo Finance | 9016 |

### Start Web Server

```bash
cd web

npm start       # production
npm run dev     # development (auto-reload)
```

Web UI: **http://localhost:9017**

### Test Accounts

| Username | Role | Password |
|---|---|---|
| `anisa` | Senior RM | `danamon2026` |
| `budi` | RM | `danamon2026` |
| `dewi` | Wealth Advisor | `danamon2026` |
| `manager` | Branch Manager | `danamon2026` |

## Troubleshooting

**Database connection fails:**
- Verify wallet files exist at the `DB_WALLET_DIR` path
- Check `DB_CONNECT_STRING` matches an alias in `wallet/tnsnames.ora`
- Ensure outbound access to `adb.us-chicago-1.oraclecloud.com:1522` is open

**Embedding generation fails:**
- Verify OCI API key exists at the `OCI_KEY_FILE` path
- Check `OCI_COMPARTMENT_ID` and `OCI_REGION` are correct
- Ensure outbound HTTPS access to the OCI GenAI endpoint is open

**MCP agents won't start:**
- Activate venv: `source venv/bin/activate`
- Check ports are available: `lsof -i :9011-9016`
- Check logs: `tail -f mcp-servers/logs/agent*.log`

**Web server won't start:**
- Run `npm install` in the `web/` directory
- Check port 9017 is available: `lsof -i :9017`
