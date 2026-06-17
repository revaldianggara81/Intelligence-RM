"""
Shared Oracle Database 26ai connection helpers for the IRM PAF agent
MCP servers. Connects to the IRMDB Autonomous Database using the wallet
in ../wallet via python-oracledb (thin mode, no Oracle client required).
"""

import os
import datetime
from contextlib import contextmanager

import oracledb
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv("DB_USER", "DBN")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DSN = os.getenv("DB_DSN", "irmdb_tp")
WALLET_LOCATION = os.getenv("WALLET_LOCATION")
WALLET_PASSWORD = os.getenv("WALLET_PASSWORD") or None
SELECT_AI_PROFILE = os.getenv("SELECT_AI_PROFILE", "IRM_AI_PROFILE")


def _output_type_handler(cursor, metadata):
    # Fetch CLOB/BLOB columns inline as Python str/bytes instead of LOB locators
    if metadata.type_code is oracledb.DB_TYPE_CLOB:
        return cursor.var(oracledb.DB_TYPE_LONG, arraysize=cursor.arraysize)
    if metadata.type_code is oracledb.DB_TYPE_BLOB:
        return cursor.var(oracledb.DB_TYPE_LONG_RAW, arraysize=cursor.arraysize)
    return None


@contextmanager
def get_connection():
    conn = oracledb.connect(
        user=DB_USER,
        password=DB_PASSWORD,
        dsn=DB_DSN,
        config_dir=WALLET_LOCATION,
        wallet_location=WALLET_LOCATION,
        wallet_password=WALLET_PASSWORD,
    )
    conn.outputtypehandler = _output_type_handler
    try:
        yield conn
    finally:
        conn.close()


def _serialize(value):
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return value


def query(sql, params=None):
    """Run a SELECT statement and return rows as a list of dicts."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params or {})
        if not cur.description:
            return []
        columns = [c[0] for c in cur.description]
        rows = cur.fetchall()
        return [
            {col: _serialize(val) for col, val in zip(columns, row)}
            for row in rows
        ]


def query_one(sql, params=None):
    """Run a SELECT statement and return the first row as a dict, or None."""
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=None):
    """Run an INSERT/UPDATE/DELETE statement, commit, and return row count."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params or {})
        conn.commit()
        return cur.rowcount


def execute_returning_id(sql, params, id_column):
    """Run an INSERT ... RETURNING <id_column> INTO :out_id and return the new id."""
    with get_connection() as conn:
        cur = conn.cursor()
        out_id = cur.var(int)
        merged = dict(params)
        merged["out_id"] = out_id
        cur.execute(sql, merged)
        conn.commit()
        return int(out_id.getvalue()[0])


def in_clause(prefix, values):
    """
    Build a parameterised "IN (:p0, :p1, ...)" clause and matching bind dict
    for a list of values, since oracledb does not bind Python lists directly.
    """
    values = list(values)
    if not values:
        return "(NULL)", {}
    names = [f"{prefix}{i}" for i in range(len(values))]
    clause = "(" + ", ".join(f":{n}" for n in names) + ")"
    params = {n: v for n, v in zip(names, values)}
    return clause, params


def run_select_ai(question, profile=None):
    """
    Run a free-form natural-language question through Oracle Select AI
    (DBMS_CLOUD_AI) and return the resulting rows as a list of dicts.
    """
    profile = profile or SELECT_AI_PROFILE
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "BEGIN DBMS_CLOUD_AI.SET_PROFILE(:profile); END;",
            {"profile": profile},
        )
        safe_question = question.replace("'", "''")
        cur.execute(f"SELECT AI RUN SQL '{safe_question}'")
        if not cur.description:
            return []
        columns = [c[0] for c in cur.description]
        rows = cur.fetchall()
        return [
            {col: _serialize(val) for col, val in zip(columns, row)}
            for row in rows
        ]


def run_select_ai_narrate(question, profile=None):
    """
    Run a free-form natural-language question through Oracle Select AI
    in 'narrate' mode and return the generated text explanation.
    """
    profile = profile or SELECT_AI_PROFILE
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "BEGIN DBMS_CLOUD_AI.SET_PROFILE(:profile); END;",
            {"profile": profile},
        )
        safe_question = question.replace("'", "''")
        cur.execute(f"SELECT AI NARRATE '{safe_question}'")
        rows = cur.fetchall()
        return "\n".join(str(r[0]) for r in rows)
