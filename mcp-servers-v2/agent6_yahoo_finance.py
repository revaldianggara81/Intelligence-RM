"""
PAF_AGENT_YAHOO_FINANCE - Yahoo Finance Market Data
Streamable-HTTP MCP server (9 tools)

Provides real-time and historical market data from Yahoo Finance:
stock prices, company info, financials, holders, options, news,
and analyst recommendations.
"""

import json
import os
from enum import Enum

import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.middleware import Middleware

from mcp_middleware import EnsureJSONContentTypeMiddleware

load_dotenv()

mcp = FastMCP("PAF_AGENT_YAHOO_FINANCE")


class FinancialType(str, Enum):
    income_stmt = "income_stmt"
    quarterly_income_stmt = "quarterly_income_stmt"
    balance_sheet = "balance_sheet"
    quarterly_balance_sheet = "quarterly_balance_sheet"
    cashflow = "cashflow"
    quarterly_cashflow = "quarterly_cashflow"


class HolderType(str, Enum):
    major_holders = "major_holders"
    institutional_holders = "institutional_holders"
    mutualfund_holders = "mutualfund_holders"
    insider_transactions = "insider_transactions"
    insider_purchases = "insider_purchases"
    insider_roster_holders = "insider_roster_holders"


class RecommendationType(str, Enum):
    recommendations = "recommendations"
    upgrades_downgrades = "upgrades_downgrades"


@mcp.tool()
def get_historical_stock_prices(ticker: str, period: str = "1mo", interval: str = "1d"):
    """
    Get historical stock prices for a given ticker symbol.
    Returns Date, Open, High, Low, Close, Volume.

    Args:
        ticker: The ticker symbol, e.g. "AAPL", "BBCA.JK".
        period: Valid periods: 1d,5d,1mo,3mo,6mo,1y,2y,5y,10y,ytd,max. Default "1mo".
        interval: Valid intervals: 1m,2m,5m,15m,30m,60m,90m,1h,1d,5d,1wk,1mo,3mo. Default "1d".
    """
    company = yf.Ticker(ticker)
    try:
        hist = company.history(period=period, interval=interval)
        if hist.empty:
            return {"error": f"No data found for {ticker}"}
        hist = hist.reset_index(names="Date")
        return json.loads(hist.to_json(orient="records", date_format="iso"))
    except Exception as e:
        return {"error": f"Error getting historical prices for {ticker}: {e}"}


@mcp.tool()
def get_stock_info(ticker: str):
    """
    Get stock information: price, company details, financial metrics,
    earnings, margins, dividends, balance sheet, ownership, risk metrics.

    Args:
        ticker: The ticker symbol, e.g. "AAPL", "BBCA.JK".
    """
    company = yf.Ticker(ticker)
    try:
        info = company.info
        if not info:
            return {"error": f"No info found for {ticker}"}
        return info
    except Exception as e:
        return {"error": f"Error getting stock info for {ticker}: {e}"}


@mcp.tool()
def get_yahoo_finance_news(ticker: str):
    """
    Get latest news articles for a given ticker symbol.

    Args:
        ticker: The ticker symbol, e.g. "AAPL", "BBCA.JK".
    """
    company = yf.Ticker(ticker)
    try:
        news_list = []
        for item in company.news:
            content = item.get("content", {})
            if content.get("contentType", "") == "STORY":
                news_list.append({
                    "title": content.get("title", ""),
                    "summary": content.get("summary", ""),
                    "description": content.get("description", ""),
                    "url": content.get("canonicalUrl", {}).get("url", ""),
                })
        if not news_list:
            return {"message": f"No news found for {ticker}"}
        return {"news": news_list}
    except Exception as e:
        return {"error": f"Error getting news for {ticker}: {e}"}


@mcp.tool()
def get_stock_actions(ticker: str):
    """
    Get stock dividends and stock splits history.

    Args:
        ticker: The ticker symbol, e.g. "AAPL", "BBCA.JK".
    """
    try:
        company = yf.Ticker(ticker)
        actions = company.actions
        if actions.empty:
            return {"message": f"No actions found for {ticker}"}
        actions = actions.reset_index(names="Date")
        return json.loads(actions.to_json(orient="records", date_format="iso"))
    except Exception as e:
        return {"error": f"Error getting stock actions for {ticker}: {e}"}


@mcp.tool()
def get_financial_statement(ticker: str, financial_type: str):
    """
    Get financial statement: income statement, balance sheet, or cashflow
    (annual or quarterly).

    Args:
        ticker: The ticker symbol, e.g. "AAPL", "BBCA.JK".
        financial_type: One of: income_stmt, quarterly_income_stmt,
            balance_sheet, quarterly_balance_sheet, cashflow, quarterly_cashflow.
    """
    company = yf.Ticker(ticker)
    type_map = {
        "income_stmt": "income_stmt",
        "quarterly_income_stmt": "quarterly_income_stmt",
        "balance_sheet": "balance_sheet",
        "quarterly_balance_sheet": "quarterly_balance_sheet",
        "cashflow": "cashflow",
        "quarterly_cashflow": "quarterly_cashflow",
    }
    if financial_type not in type_map:
        return {"error": f"Invalid financial_type '{financial_type}'. Use one of: {list(type_map.keys())}"}

    try:
        statement = getattr(company, type_map[financial_type])
        if statement.empty:
            return {"message": f"No {financial_type} data for {ticker}"}
        result = []
        for col in statement.columns:
            date_str = col.strftime("%Y-%m-%d") if isinstance(col, pd.Timestamp) else str(col)
            row = {"date": date_str}
            for idx, val in statement[col].items():
                row[idx] = None if pd.isna(val) else val
            result.append(row)
        return result
    except Exception as e:
        return {"error": f"Error getting {financial_type} for {ticker}: {e}"}


@mcp.tool()
def get_holder_info(ticker: str, holder_type: str):
    """
    Get holder information: major holders, institutional, mutual fund,
    insider transactions/purchases/roster.

    Args:
        ticker: The ticker symbol, e.g. "AAPL", "BBCA.JK".
        holder_type: One of: major_holders, institutional_holders,
            mutualfund_holders, insider_transactions, insider_purchases,
            insider_roster_holders.
    """
    company = yf.Ticker(ticker)
    type_map = {
        "major_holders": lambda: company.major_holders.reset_index(names="metric"),
        "institutional_holders": lambda: company.institutional_holders,
        "mutualfund_holders": lambda: company.mutualfund_holders,
        "insider_transactions": lambda: company.insider_transactions,
        "insider_purchases": lambda: company.insider_purchases,
        "insider_roster_holders": lambda: company.insider_roster_holders,
    }
    if holder_type not in type_map:
        return {"error": f"Invalid holder_type '{holder_type}'. Use one of: {list(type_map.keys())}"}

    try:
        df = type_map[holder_type]()
        if df is None or df.empty:
            return {"message": f"No {holder_type} data for {ticker}"}
        return json.loads(df.to_json(orient="records", date_format="iso"))
    except Exception as e:
        return {"error": f"Error getting {holder_type} for {ticker}: {e}"}


@mcp.tool()
def get_option_expiration_dates(ticker: str):
    """
    Get available options expiration dates for a ticker.

    Args:
        ticker: The ticker symbol, e.g. "AAPL".
    """
    company = yf.Ticker(ticker)
    try:
        dates = company.options
        if not dates:
            return {"message": f"No options available for {ticker}"}
        return {"expiration_dates": list(dates)}
    except Exception as e:
        return {"error": f"Error getting option dates for {ticker}: {e}"}


@mcp.tool()
def get_option_chain(ticker: str, expiration_date: str, option_type: str):
    """
    Get the option chain (calls or puts) for a specific expiration date.

    Args:
        ticker: The ticker symbol, e.g. "AAPL".
        expiration_date: Expiration date in YYYY-MM-DD format.
        option_type: "calls" or "puts".
    """
    company = yf.Ticker(ticker)
    if option_type not in ("calls", "puts"):
        return {"error": "option_type must be 'calls' or 'puts'"}
    try:
        if expiration_date not in company.options:
            return {"error": f"No options for date {expiration_date}. Use get_option_expiration_dates first."}
        chain = company.option_chain(expiration_date)
        df = chain.calls if option_type == "calls" else chain.puts
        return json.loads(df.to_json(orient="records", date_format="iso"))
    except Exception as e:
        return {"error": f"Error getting option chain for {ticker}: {e}"}


@mcp.tool()
def get_recommendations(ticker: str, recommendation_type: str = "recommendations", months_back: int = 12):
    """
    Get analyst recommendations or upgrades/downgrades history.

    Args:
        ticker: The ticker symbol, e.g. "AAPL", "BBCA.JK".
        recommendation_type: "recommendations" or "upgrades_downgrades". Default "recommendations".
        months_back: Months of history for upgrades_downgrades. Default 12.
    """
    company = yf.Ticker(ticker)
    try:
        if recommendation_type == "recommendations":
            recs = company.recommendations
            if recs is None or recs.empty:
                return {"message": f"No recommendations for {ticker}"}
            return json.loads(recs.to_json(orient="records"))
        elif recommendation_type == "upgrades_downgrades":
            ud = company.upgrades_downgrades.reset_index()
            cutoff = pd.Timestamp.now() - pd.DateOffset(months=months_back)
            ud = ud[ud["GradeDate"] >= cutoff].sort_values("GradeDate", ascending=False)
            latest = ud.drop_duplicates(subset=["Firm"])
            return json.loads(latest.to_json(orient="records", date_format="iso"))
        else:
            return {"error": f"Invalid recommendation_type. Use 'recommendations' or 'upgrades_downgrades'"}
    except Exception as e:
        return {"error": f"Error getting recommendations for {ticker}: {e}"}


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENT_YAHOO_PORT", "9016")),
        middleware=[Middleware(EnsureJSONContentTypeMiddleware)],
        stateless_http=True,
        json_response=True,
    )
