"""
Shared data-access functions for the IRM PAF agent MCP servers.

These plain Python functions wrap SQL access to the IRM Oracle 26ai
schema (CUSTOMERS, CUSTOMER_PRODUCTS, PRODUCT_CATALOG, ALERTS,
CAMPAIGNS, CAMPAIGN_ELIGIBILITY, MEETING_NOTES, RM_USERS). Each MCP
agent server imports the subset of functions it needs and exposes
them as @mcp.tool() with agent-specific descriptions.
"""

from db import query, query_one, execute, in_clause


# ---------------------------------------------------------------------------
# CUSTOMERS / RM_USERS
# ---------------------------------------------------------------------------

def get_customer(customer_id):
    """Full customer record joined with the assigned RM's details."""
    return query_one(
        """
        SELECT c.*,
               r.FULL_NAME AS RM_FULL_NAME,
               r.USERNAME  AS RM_USERNAME,
               r.BRANCH    AS RM_BRANCH
        FROM CUSTOMERS c
        LEFT JOIN RM_USERS r ON c.RM_USER_ID = r.USER_ID
        WHERE UPPER(c.CUSTOMER_ID) = UPPER(:customer_id)
        """,
        {"customer_id": customer_id},
    )


def search_customers(name=None, tier=None, risk_profile=None,
                      rm_user_id=None, kyc_status=None, limit=50):
    """Search customers by any combination of name, tier, risk profile, RM, KYC status."""
    sql = """
        SELECT c.*,
               r.FULL_NAME AS RM_FULL_NAME,
               r.BRANCH    AS RM_BRANCH
        FROM CUSTOMERS c
        LEFT JOIN RM_USERS r ON c.RM_USER_ID = r.USER_ID
        WHERE 1=1
    """
    params = {}
    if name:
        sql += " AND UPPER(c.FULL_NAME) LIKE UPPER(:name)"
        params["name"] = f"%{name}%"
    if tier:
        sql += " AND UPPER(c.TIER) = UPPER(:tier)"
        params["tier"] = tier
    if risk_profile:
        sql += " AND UPPER(c.RISK_PROFILE) = UPPER(:risk_profile)"
        params["risk_profile"] = risk_profile
    if rm_user_id:
        sql += " AND UPPER(c.RM_USER_ID) = UPPER(:rm_user_id)"
        params["rm_user_id"] = rm_user_id
    if kyc_status:
        sql += " AND UPPER(c.KYC_STATUS) = UPPER(:kyc_status)"
        params["kyc_status"] = kyc_status
    sql += " ORDER BY c.TOTAL_AUM DESC FETCH FIRST :max_rows ROWS ONLY"
    params["max_rows"] = limit
    return query(sql, params)


def get_rm_user(user_id=None, username=None):
    """Look up an RM user by USER_ID or USERNAME."""
    if user_id:
        return query_one("SELECT * FROM RM_USERS WHERE UPPER(USER_ID) = UPPER(:v)", {"v": user_id})
    if username:
        return query_one("SELECT * FROM RM_USERS WHERE UPPER(USERNAME) = UPPER(:v)", {"v": username})
    return None


def get_customers_by_ids(customer_ids):
    """Bulk fetch CUSTOMERS rows for a set of CUSTOMER_IDs, keyed by CUSTOMER_ID."""
    clause, params = in_clause("cid", customer_ids)
    if not params:
        return {}
    rows = query(f"SELECT * FROM CUSTOMERS WHERE CUSTOMER_ID IN {clause}", params)
    return {r["CUSTOMER_ID"]: r for r in rows}


# ---------------------------------------------------------------------------
def get_aum_changes(min_change_pct=None, direction=None, limit=50):
    """Return customers with AUM change vs previous month, sorted by change %."""
    sql = """
        SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TIER, c.RISK_PROFILE,
               c.TOTAL_AUM, c.PREV_MONTH_AUM, c.MONTHLY_INCOME,
               ROUND((c.TOTAL_AUM - c.PREV_MONTH_AUM) / NULLIF(c.PREV_MONTH_AUM, 0) * 100, 1) AS AUM_CHANGE_PCT,
               (c.TOTAL_AUM - c.PREV_MONTH_AUM) AS AUM_CHANGE_ABS,
               r.FULL_NAME AS RM_FULL_NAME
        FROM CUSTOMERS c
        LEFT JOIN RM_USERS r ON c.RM_USER_ID = r.USER_ID
        WHERE c.PREV_MONTH_AUM IS NOT NULL AND c.PREV_MONTH_AUM > 0
    """
    params = {}
    if direction == "down":
        sql += " AND c.TOTAL_AUM < c.PREV_MONTH_AUM"
    elif direction == "up":
        sql += " AND c.TOTAL_AUM > c.PREV_MONTH_AUM"
    if min_change_pct is not None:
        sql += " AND ABS((c.TOTAL_AUM - c.PREV_MONTH_AUM) / NULLIF(c.PREV_MONTH_AUM, 0) * 100) >= :min_pct"
        params["min_pct"] = min_change_pct
    sql += " ORDER BY AUM_CHANGE_PCT ASC FETCH FIRST :lim ROWS ONLY"
    params["lim"] = limit
    return query(sql, params)


def find_outlier_customers(limit=50):
    """Identify customers with outlier profiles based on multiple criteria."""
    sql = """
        SELECT c.CUSTOMER_ID, c.FULL_NAME, c.TIER, c.RISK_PROFILE,
               c.TOTAL_AUM, c.MONTHLY_INCOME, c.NOTES,
               ROUND(c.TOTAL_AUM / NULLIF(c.MONTHLY_INCOME, 0), 0) AS AUM_INCOME_RATIO,
               ROUND((c.TOTAL_AUM - c.PREV_MONTH_AUM) / NULLIF(c.PREV_MONTH_AUM, 0) * 100, 1) AS AUM_CHANGE_PCT,
               r.FULL_NAME AS RM_FULL_NAME,
               (SELECT LISTAGG(cp.CATEGORY || ':' || TO_CHAR(ROUND(cp.CAT_TOTAL/1e9,2)) || 'B', ', ')
                  WITHIN GROUP (ORDER BY cp.CAT_TOTAL DESC)
                FROM (SELECT CATEGORY, SUM(AMOUNT) AS CAT_TOTAL
                        FROM CUSTOMER_PRODUCTS
                       WHERE CUSTOMER_ID = c.CUSTOMER_ID
                         AND UPPER(STATUS) IN ('ACTIVE','Active')
                       GROUP BY CATEGORY) cp
               ) AS ALLOCATION
        FROM CUSTOMERS c
        LEFT JOIN RM_USERS r ON c.RM_USER_ID = r.USER_ID
        WHERE (
            -- AUM/income ratio > 50x (abnormally high AUM vs income)
            (c.MONTHLY_INCOME > 0 AND c.TOTAL_AUM / c.MONTHLY_INCOME > 50)
            -- Or income very low but AUM significant (> 200M)
            OR (c.MONTHLY_INCOME < 15000000 AND c.TOTAL_AUM > 200000000)
            -- Or AUM change > 15% in either direction
            OR (c.PREV_MONTH_AUM > 0 AND ABS((c.TOTAL_AUM - c.PREV_MONTH_AUM) / c.PREV_MONTH_AUM) > 0.15)
            -- Or notes explicitly mention OUTLIER
            OR UPPER(c.NOTES) LIKE '%OUTLIER%'
        )
        ORDER BY c.TOTAL_AUM DESC
        FETCH FIRST :lim ROWS ONLY
    """
    return query(sql, {"lim": limit})


# CUSTOMER_PRODUCTS (portfolio holdings)
# ---------------------------------------------------------------------------

def get_customer_portfolio(customer_id, status=None):
    """All product holdings for a customer, optionally filtered by STATUS."""
    sql = "SELECT * FROM CUSTOMER_PRODUCTS WHERE UPPER(CUSTOMER_ID) = UPPER(:customer_id)"
    params = {"customer_id": customer_id}
    if status:
        sql += " AND UPPER(STATUS) = UPPER(:status)"
        params["status"] = status
    sql += " ORDER BY AMOUNT DESC"
    return query(sql, params)


def search_customer_products(product_name=None, category=None, status=None,
                             customer_id=None, limit=100):
    """Search customer holdings across all customers with optional filters."""
    sql = """
        SELECT cp.*, c.FULL_NAME, c.TIER, c.RISK_PROFILE
        FROM CUSTOMER_PRODUCTS cp
        JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
        WHERE 1=1
    """
    params = {}
    if product_name:
        sql += " AND UPPER(cp.PRODUCT_NAME) LIKE '%' || UPPER(:product_name) || '%'"
        params["product_name"] = product_name
    if category:
        sql += " AND UPPER(cp.CATEGORY) LIKE '%' || UPPER(:category) || '%'"
        params["category"] = category
    if status:
        sql += " AND UPPER(cp.STATUS) = UPPER(:status)"
        params["status"] = status
    if customer_id:
        sql += " AND UPPER(cp.CUSTOMER_ID) = UPPER(:customer_id)"
        params["customer_id"] = customer_id
    sql += " ORDER BY cp.AMOUNT DESC FETCH FIRST :lim ROWS ONLY"
    params["lim"] = limit
    return query(sql, params)


def get_maturing_products(days_ahead=30, customer_id=None, category=None):
    """
    Active holdings maturing within `days_ahead` days, enriched with the
    owning customer's profile (tier, risk, AUM, assigned RM).
    """
    sql = """
        SELECT *
        FROM CUSTOMER_PRODUCTS
        WHERE UPPER(STATUS) = 'ACTIVE'
          AND MATURITY_DATE IS NOT NULL
          AND MATURITY_DATE BETWEEN SYSDATE AND SYSDATE + :days_ahead
    """
    params = {"days_ahead": days_ahead}
    if customer_id:
        sql += " AND UPPER(CUSTOMER_ID) = UPPER(:customer_id)"
        params["customer_id"] = customer_id
    if category:
        sql += " AND UPPER(CATEGORY) = UPPER(:category)"
        params["category"] = category
    sql += " ORDER BY MATURITY_DATE ASC"

    holdings = query(sql, params)
    customers = get_customers_by_ids({h["CUSTOMER_ID"] for h in holdings})
    for h in holdings:
        h["customer"] = customers.get(h["CUSTOMER_ID"])
    return holdings


# ---------------------------------------------------------------------------
# PRODUCT_CATALOG
# ---------------------------------------------------------------------------

# Coarse ordering used to match a customer's RISK_PROFILE against a
# product's RISK_LEVEL when both are free-text values.
RISK_ORDER = [
    "conservative",
    "conservative-moderate",
    "moderate",
    "moderate-aggressive",
    "aggressive",
]


def _risk_rank(label):
    if not label:
        return None
    label = label.lower()
    for i, name in enumerate(RISK_ORDER):
        if name in label:
            return i
    return None


def get_product_catalog(category=None, risk_level=None, active_only=True,
                         min_rate=None, max_rate=None):
    """Browse the product catalog with optional filters."""
    sql = "SELECT * FROM PRODUCT_CATALOG WHERE 1=1"
    params = {}
    if active_only:
        sql += " AND UPPER(IS_ACTIVE) IN ('Y', 'YES', 'TRUE', '1')"
    if category:
        sql += " AND UPPER(CATEGORY) = UPPER(:category)"
        params["category"] = category
    if risk_level:
        sql += " AND UPPER(RISK_LEVEL) = UPPER(:risk_level)"
        params["risk_level"] = risk_level
    if min_rate is not None:
        sql += " AND INTEREST_RATE >= :min_rate"
        params["min_rate"] = min_rate
    if max_rate is not None:
        sql += " AND INTEREST_RATE <= :max_rate"
        params["max_rate"] = max_rate
    sql += " ORDER BY INTEREST_RATE DESC"
    return query(sql, params)


def recommend_products_for_customer(customer_id, top_n=5):
    """
    Heuristic product matching for a customer: compares the customer's
    current portfolio allocation by CATEGORY against the active product
    catalog filtered to a suitable RISK_LEVEL, and ranks candidates by
    interest rate, favouring categories the customer is under-allocated in.
    """
    customer = get_customer(customer_id)
    if not customer:
        return {"error": f"Customer {customer_id} not found"}

    portfolio = get_customer_portfolio(customer_id, status="ACTIVE")
    total_aum = float(customer.get("TOTAL_AUM") or 0)

    allocation = {}
    for h in portfolio:
        cat = (h.get("CATEGORY") or "UNKNOWN").upper()
        allocation[cat] = allocation.get(cat, 0) + float(h.get("AMOUNT") or 0)
    allocation_pct = {
        cat: (amt / total_aum * 100 if total_aum else 0)
        for cat, amt in allocation.items()
    }

    cust_rank = _risk_rank(customer.get("RISK_PROFILE"))
    catalog = get_product_catalog(active_only=True)

    candidates = []
    for p in catalog:
        prod_rank = _risk_rank(p.get("RISK_LEVEL"))
        if cust_rank is not None and prod_rank is not None and prod_rank > cust_rank:
            continue  # too risky for this customer's profile
        cat = (p.get("CATEGORY") or "UNKNOWN").upper()
        current_pct = allocation_pct.get(cat, 0)
        # Lower current allocation in a category -> higher diversification score
        diversification_score = max(0, 100 - current_pct)
        rate = float(p.get("INTEREST_RATE") or 0)
        candidates.append({
            **p,
            "current_allocation_pct": round(current_pct, 2),
            "diversification_score": round(diversification_score, 2),
            "match_score": round(diversification_score * 0.6 + rate * 4, 2),
        })

    candidates.sort(key=lambda c: c["match_score"], reverse=True)

    return {
        "customer": customer,
        "total_aum": total_aum,
        "current_allocation_pct": {k: round(v, 2) for k, v in allocation_pct.items()},
        "recommendations": candidates[:top_n],
    }


# ---------------------------------------------------------------------------
# MEETING_NOTES
# ---------------------------------------------------------------------------

def get_meeting_notes(customer_id=None, rm_user_id=None, keyword=None, limit=10):
    """Recent RM-customer meeting notes, optionally filtered/keyword-searched."""
    sql = "SELECT * FROM MEETING_NOTES WHERE 1=1"
    params = {}
    if customer_id:
        sql += " AND UPPER(CUSTOMER_ID) = UPPER(:customer_id)"
        params["customer_id"] = customer_id
    if rm_user_id:
        sql += " AND UPPER(RM_USER_ID) = UPPER(:rm_user_id)"
        params["rm_user_id"] = rm_user_id
    if keyword:
        sql += " AND (UPPER(SUMMARY) LIKE UPPER(:kw) OR UPPER(FOLLOW_UP) LIKE UPPER(:kw))"
        params["kw"] = f"%{keyword}%"
    sql += " ORDER BY MEETING_DATE DESC FETCH FIRST :max_rows ROWS ONLY"
    params["max_rows"] = limit
    return query(sql, params)


def add_meeting_note(customer_id, rm_user_id, summary, follow_up=None, meeting_date=None):
    """Insert a new structured RM-customer meeting note."""
    sql = """
        INSERT INTO MEETING_NOTES (CUSTOMER_ID, RM_USER_ID, MEETING_DATE, SUMMARY, FOLLOW_UP)
        VALUES (:customer_id, :rm_user_id,
                COALESCE(TO_DATE(:meeting_date, 'YYYY-MM-DD'), SYSDATE),
                :summary, :follow_up)
    """
    params = {
        "customer_id": customer_id,
        "rm_user_id": rm_user_id,
        "meeting_date": meeting_date,
        "summary": summary,
        "follow_up": follow_up,
    }
    rows = execute(sql, params)
    return {"inserted": rows}


# ---------------------------------------------------------------------------
# ALERTS
# ---------------------------------------------------------------------------

def get_alerts(customer_id=None, severity=None, status="OPEN", alert_type=None, limit=100):
    """Alerts (maturity, KYC, campaign, etc.), optionally filtered."""
    sql = """
        SELECT a.*,
               c.FULL_NAME AS CUSTOMER_NAME,
               c.TIER      AS CUSTOMER_TIER,
               c.RM_USER_ID
        FROM ALERTS a
        LEFT JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
        WHERE 1=1
    """
    params = {}
    if customer_id:
        sql += " AND UPPER(a.CUSTOMER_ID) = UPPER(:customer_id)"
        params["customer_id"] = customer_id
    if severity:
        sql += " AND UPPER(a.SEVERITY) = UPPER(:severity)"
        params["severity"] = severity
    if status:
        sql += " AND UPPER(a.STATUS) = UPPER(:status)"
        params["status"] = status
    if alert_type:
        sql += " AND UPPER(a.ALERT_TYPE) = UPPER(:alert_type)"
        params["alert_type"] = alert_type
    sql += " ORDER BY a.TRIGGERED_AT DESC FETCH FIRST :max_rows ROWS ONLY"
    params["max_rows"] = limit
    return query(sql, params)


def update_alert_status(alert_id, status, note=None):
    """Update the STATUS of an alert (e.g. OPEN -> ACKNOWLEDGED / RESOLVED)."""
    sql = "UPDATE ALERTS SET STATUS = :status"
    params = {"status": status, "alert_id": alert_id}
    if note is not None:
        sql += ", NOTES = :note"
        params["note"] = note
    sql += " WHERE ALERT_ID = :alert_id"
    rows = execute(sql, params)
    return {"alert_id": alert_id, "status": status, "updated": rows}


def get_kyc_radar(days_ahead=60, limit=100):
    """
    Customers whose KYC is not in a clean 'VALID'/'ACTIVE' state, i.e. due
    for review, expiring soon, or already expired.
    """
    sql = """
        SELECT c.*, r.FULL_NAME AS RM_FULL_NAME
        FROM CUSTOMERS c
        LEFT JOIN RM_USERS r ON c.RM_USER_ID = r.USER_ID
        WHERE UPPER(c.KYC_STATUS) NOT IN ('VALID', 'ACTIVE', 'CURRENT', 'OK')
        ORDER BY c.KYC_STATUS, c.TOTAL_AUM DESC
        FETCH FIRST :max_rows ROWS ONLY
    """
    return query(sql, {"max_rows": limit})


# ---------------------------------------------------------------------------
# CAMPAIGNS / CAMPAIGN_ELIGIBILITY
# ---------------------------------------------------------------------------

def get_campaigns(status="ACTIVE", campaign_id=None):
    """List campaigns, optionally filtered by STATUS or a specific CAMPAIGN_ID."""
    sql = "SELECT * FROM CAMPAIGNS WHERE 1=1"
    params = {}
    if campaign_id:
        sql += " AND UPPER(CAMPAIGN_ID) = UPPER(:campaign_id)"
        params["campaign_id"] = campaign_id
    elif status:
        sql += " AND UPPER(STATUS) = UPPER(:status)"
        params["status"] = status
    sql += " ORDER BY START_DATE DESC"
    return query(sql, params)


def get_campaign_eligible_customers(campaign_id, eligible_only=True, limit=200):
    """
    Customers evaluated for a campaign, joined with their profile.
    Set eligible_only=False to also see near-miss / ineligible customers.
    """
    sql = """
        SELECT ce.*,
               c.FULL_NAME AS CUSTOMER_NAME,
               c.TIER,
               c.RISK_PROFILE,
               c.TOTAL_AUM,
               c.RM_USER_ID,
               r.FULL_NAME AS RM_FULL_NAME
        FROM CAMPAIGN_ELIGIBILITY ce
        JOIN CUSTOMERS c ON ce.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN RM_USERS r ON c.RM_USER_ID = r.USER_ID
        WHERE UPPER(ce.CAMPAIGN_ID) = UPPER(:campaign_id)
    """
    params = {"campaign_id": campaign_id}
    if eligible_only:
        sql += " AND UPPER(TO_CHAR(ce.IS_ELIGIBLE)) IN ('Y', 'YES', 'TRUE', '1')"
    sql += " ORDER BY ce.AUM_3M_AVG DESC FETCH FIRST :max_rows ROWS ONLY"
    params["max_rows"] = limit
    return query(sql, params)


def check_campaign_eligibility(campaign_id, customer_id):
    """Eligibility detail for one customer against one campaign."""
    return query_one(
        """
        SELECT ce.*, c.FULL_NAME AS CUSTOMER_NAME, c.TOTAL_AUM, c.TIER
        FROM CAMPAIGN_ELIGIBILITY ce
        JOIN CUSTOMERS c ON ce.CUSTOMER_ID = c.CUSTOMER_ID
        WHERE UPPER(ce.CAMPAIGN_ID) = UPPER(:campaign_id)
          AND UPPER(ce.CUSTOMER_ID) = UPPER(:customer_id)
        """,
        {"campaign_id": campaign_id, "customer_id": customer_id},
    )


# ---------------------------------------------------------------------------
# Combined / cross-table views
# ---------------------------------------------------------------------------

def get_customer_360(customer_id):
    """
    Full Customer 360 view: profile, portfolio, open alerts, recent meeting
    notes, and any active campaign eligibility - everything a copilot or
    RM-facing agent needs to answer questions about this customer.
    """
    customer = get_customer(customer_id)
    if not customer:
        return {"error": f"Customer {customer_id} not found"}

    return {
        "customer": customer,
        "portfolio": get_customer_portfolio(customer_id),
        "open_alerts": get_alerts(customer_id=customer_id, status="OPEN"),
        "recent_meeting_notes": get_meeting_notes(customer_id=customer_id, limit=5),
        "campaign_eligibility": query(
            """
            SELECT ce.*, cm.TYPE AS CAMPAIGN_TYPE, cm.STATUS AS CAMPAIGN_STATUS
            FROM CAMPAIGN_ELIGIBILITY ce
            JOIN CAMPAIGNS cm ON ce.CAMPAIGN_ID = cm.CAMPAIGN_ID
            WHERE UPPER(ce.CUSTOMER_ID) = UPPER(:customer_id)
            """,
            {"customer_id": customer_id},
        ),
    }


# ---------------------------------------------------------------------------
# GENERIC TABLE QUERY
# ---------------------------------------------------------------------------

ALLOWED_TABLES = {
    "CREDIT_CARDS", "CREDIT_CARD_PAYMENTS", "CUSTOMER_ASSETS",
    "CUSTOMER_GOALS", "CUSTOMER_INCOME_SOURCES", "CALL_CENTER_TRANSCRIPTS",
    "CAMPAIGNS", "CAMPAIGN_ELIGIBILITY", "MEETING_NOTES", "RM_USERS",
    "PRODUCT_CATALOG", "PRODUCT_PERFORMANCE", "PRODUCT_FORECASTS",
    "ALERTS", "ALERT_ACTIONS", "ALERT_THRESHOLDS",
    "MARKET_DATA", "MARKET_ALERT_RULES", "MARKET_ALERT_HISTORY",
    "RM_APPOINTMENTS", "RM_TASKS", "GOAL_TYPES",
    "DEPOSIT_PAYMENT_SCHEDULE", "EXEC_AUM_MONTHLY",
    "CUSTOMERS", "CUSTOMER_PRODUCTS", "NOTIFICATIONS",
    "PORTFOLIO_AI_REPORTS", "RECOMMENDATION_DOCS",
    "CONVERSATION_HISTORY", "SCHEDULER_LOG",
}

def query_table(table_name, customer_id=None, filters=None, limit=50):
    """Generic query against any allowed IRM table."""
    tbl = table_name.upper().strip()
    if tbl not in ALLOWED_TABLES:
        return {"error": f"Table '{tbl}' is not accessible. Allowed: {sorted(ALLOWED_TABLES)}"}

    sql = f"SELECT * FROM {tbl} WHERE 1=1"
    params = {}

    if customer_id:
        sql += " AND UPPER(CUSTOMER_ID) = UPPER(:customer_id)"
        params["customer_id"] = customer_id
    if filters and isinstance(filters, dict):
        for i, (col, val) in enumerate(filters.items()):
            safe_col = col.upper().strip()
            if safe_col.isalnum() or "_" in safe_col:
                bind = f"f{i}"
                sql += f" AND UPPER({safe_col}) = UPPER(:{bind})"
                params[bind] = str(val)

    sql += " ORDER BY 1 DESC FETCH FIRST :lim ROWS ONLY"
    params["lim"] = limit

    return query(sql, params)
