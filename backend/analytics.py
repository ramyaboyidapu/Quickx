# QuickX: Python Data Analysis Module
# Author: QuickX Project Team
# Purpose: Statistical computations, city-wise price elasticity, 
# and market competitiveness analysis across Blinkit, Instamart, and BigBasket.

import sqlite3
import statistics
import math
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "quickx_data.db")

def get_db_connection():
    """Helper function to open connection to QuickX SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def calculate_percentile(data_list, percentile):
    """Simple beginner-friendly percentile calculation function."""
    if not data_list:
        return 0.0
    k = (len(data_list) - 1) * (percentile / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return float(data_list[int(k)])
    d0 = data_list[int(f)] * (c - k)
    d1 = data_list[int(c)] * (k - f)
    return float(round(d0 + d1, 2))

def run_descriptive_analysis(city_filter=None):
    """
    Step 1: Descriptive Statistics
    Computes Mean, Median, Standard Deviation, Variance, Min, Max, Q1, Q3, and IQR
    for MRP, Blinkit, Instamart, and BigBasket.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT mrp, blinkit_price, instamart_price, bigbasket_price, max_savings, savings_percent FROM products"
    params = []
    if city_filter and city_filter != "All South India":
        query += " WHERE city = ? OR city = 'All South India'"
        params.append(city_filter)

    rows = cursor.execute(query, params).fetchall()
    conn.close()

    if not rows:
        return {}

    mrp_vals = sorted([r["mrp"] for r in rows])
    b_vals = sorted([r["blinkit_price"] for r in rows])
    i_vals = sorted([r["instamart_price"] for r in rows])
    bb_vals = sorted([r["bigbasket_price"] for r in rows])
    savings_vals = sorted([r["max_savings"] for r in rows])
    savings_pct_vals = sorted([r["savings_percent"] for r in rows])

    def summarize_series(values, name):
        n = len(values)
        avg = round(statistics.mean(values), 2)
        med = round(statistics.median(values), 2)
        std = round(statistics.stdev(values), 2) if n > 1 else 0.0
        var = round(statistics.variance(values), 2) if n > 1 else 0.0
        q1 = calculate_percentile(values, 25)
        q3 = calculate_percentile(values, 75)
        iqr = round(q3 - q1, 2)
        return {
            "metric_name": name,
            "count": n,
            "mean": avg,
            "median": med,
            "std_dev": std,
            "variance": var,
            "min": round(values[0], 2),
            "max": round(values[-1], 2),
            "q1": q1,
            "q3": q3,
            "iqr": iqr
        }

    return {
        "mrp": summarize_series(mrp_vals, "MRP (Manufacturer Price)"),
        "blinkit": summarize_series(b_vals, "Blinkit Live Price"),
        "instamart": summarize_series(i_vals, "Swiggy Instamart Live Price"),
        "bigbasket": summarize_series(bb_vals, "BigBasket (BB Now) Live Price"),
        "savings": summarize_series(savings_vals, "Price Spread / Absolute Savings (₹)"),
        "savings_percent": summarize_series(savings_pct_vals, "Savings Percentage (%)")
    }

def run_south_india_city_analysis():
    """
    Step 2: South India Geographic Analysis
    Aggregates metrics for top South Indian urban clusters:
    Bengaluru, Hyderabad, Chennai, Kochi, Coimbatore, Visakhapatnam, Mysore, Vijayawada, Madurai.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cities = [
        "Bengaluru",
        "Hyderabad",
        "Chennai",
        "Kochi",
        "Coimbatore",
        "Visakhapatnam",
        "Mysore",
        "Vijayawada",
        "Madurai",
        "Thiruvananthapuram"
    ]

    city_stats = []
    for city in cities:
        row = cursor.execute("""
            SELECT 
                COUNT(*) as count,
                ROUND(AVG(mrp), 2) as avg_mrp,
                ROUND(AVG(blinkit_price), 2) as avg_b,
                ROUND(AVG(instamart_price), 2) as avg_i,
                ROUND(AVG(bigbasket_price), 2) as avg_bb,
                ROUND(AVG(max_savings), 2) as avg_savings,
                ROUND(AVG(savings_percent), 1) as avg_savings_pct,
                SUM(CASE WHEN cheapest_platform = 'blinkit' THEN 1 ELSE 0 END) as b_wins,
                SUM(CASE WHEN cheapest_platform = 'instamart' THEN 1 ELSE 0 END) as i_wins,
                SUM(CASE WHEN cheapest_platform = 'bigbasket' THEN 1 ELSE 0 END) as bb_wins
            FROM products
            WHERE city = ? OR city = 'All South India'
        """, (city,)).fetchone()

        if row and row["count"] > 0:
            total = row["count"]
            city_stats.append({
                "city": city,
                "total_products": total,
                "avg_mrp": row["avg_mrp"],
                "avg_blinkit": row["avg_b"],
                "avg_instamart": row["avg_i"],
                "avg_bigbasket": row["avg_bb"],
                "avg_savings_rs": row["avg_savings"],
                "avg_savings_percent": row["avg_savings_pct"],
                "blinkit_win_rate": round((row["b_wins"] / total) * 100, 1),
                "instamart_win_rate": round((row["i_wins"] / total) * 100, 1),
                "bigbasket_win_rate": round((row["bb_wins"] / total) * 100, 1),
            })

    conn.close()
    return city_stats

def run_category_savings_analysis():
    """
    Step 3: Category Price Elasticity & Spread
    Determines which grocery segments (Staples, Dairy, Snacks) have the highest consumer arbitrage.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    rows = cursor.execute("""
        SELECT 
            category,
            COUNT(*) as item_count,
            ROUND(AVG(mrp), 2) as avg_mrp,
            ROUND(AVG(min_price), 2) as avg_best_price,
            ROUND(AVG(max_savings), 2) as avg_savings,
            ROUND(AVG(savings_percent), 1) as avg_discount_pct,
            SUM(CASE WHEN cheapest_platform = 'blinkit' THEN 1 ELSE 0 END) as b_cheapest,
            SUM(CASE WHEN cheapest_platform = 'instamart' THEN 1 ELSE 0 END) as i_cheapest,
            SUM(CASE WHEN cheapest_platform = 'bigbasket' THEN 1 ELSE 0 END) as bb_cheapest
        FROM products
        GROUP BY category
        ORDER BY avg_savings DESC
    """).fetchall()

    conn.close()
    return [dict(r) for r in rows]

def get_python_analysis_code_preview():
    """
    Returns clean, beginner-friendly Python data analysis code to display on the web interface.
    Perfect for academic presentations, vivas, and project demonstrations.
    """
    return """# ============================================================
# QuickX Project: Grocery Price Analysis using Python & SQLite
# Authors: QuickX Team
# ============================================================

import sqlite3
import pandas as pd
import numpy as np

# Step 1: Connect to the QuickX SQLite database
conn = sqlite3.connect("backend/quickx_data.db")

# Step 2: Load product records into a pandas DataFrame
query = \"\"\"
SELECT id, name, category, city, mrp, 
       blinkit_price, instamart_price, bigbasket_price,
       cheapest_platform, max_savings, savings_percent
FROM products
\"\"\"
df = pd.read_sql_query(query, conn)

# Step 3: Compute descriptive summary statistics
stats_summary = df[["mrp", "blinkit_price", "instamart_price", "bigbasket_price", "max_savings"]].describe()
print("Summary Statistics across Stores:\\n", stats_summary)

# Step 4: Analyze Store Win Distribution (% of lowest price items)
store_wins = df["cheapest_platform"].value_counts(normalize=True) * 100
print("\\nStore Win Distribution (%):\\n", store_wins)

# Step 5: South Indian City-wise price disparity analysis
city_summary = df.groupby("city").agg(
    avg_savings=("max_savings", "mean"),
    avg_discount=("savings_percent", "mean"),
    total_items=("id", "count")
).reset_index()
print("\\nSouth India Regional Performance:\\n", city_summary)

# Step 6: Identify Top 5 High-Savings Grocery Arbitrage Items
top_deals = df.sort_values(by="max_savings", ascending=False).head(5)
print("\\nTop 5 Highest Savings Items:\\n", top_deals[["name", "cheapest_platform", "max_savings"]])

conn.close()
"""

def generate_complete_analytics_payload(city=None):
    """Bundles all data analysis results into a single clean JSON response."""
    stats = run_descriptive_analysis(city)
    city_breakdown = run_south_india_city_analysis()
    category_breakdown = run_category_savings_analysis()
    code_snippet = get_python_analysis_code_preview()

    conn = get_db_connection()
    cursor = conn.cursor()
    total_items = cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0]

    # Overall win counts
    wins = cursor.execute("""
        SELECT 
            SUM(CASE WHEN cheapest_platform = 'blinkit' THEN 1 ELSE 0 END) as b,
            SUM(CASE WHEN cheapest_platform = 'instamart' THEN 1 ELSE 0 END) as i,
            SUM(CASE WHEN cheapest_platform = 'bigbasket' THEN 1 ELSE 0 END) as bb,
            ROUND(SUM(max_savings), 2) as total_savings_pool
        FROM products
    """).fetchone()

    top_savings = cursor.execute("""
        SELECT id, name, category, brand, unit, mrp, blinkit_price, instamart_price, bigbasket_price, max_savings, savings_percent, cheapest_platform, city
        FROM products
        ORDER BY max_savings DESC
        LIMIT 6
    """).fetchall()

    conn.close()

    b_wins = wins["b"]
    i_wins = wins["i"]
    bb_wins = wins["bb"]

    return {
        "project_name": "QuickX",
        "total_items": total_items,
        "selected_city": city or "All South India",
        "total_savings_pool": wins["total_savings_pool"],
        "win_rates": {
            "blinkit": {"count": b_wins, "percent": round((b_wins / total_items) * 100, 1)},
            "instamart": {"count": i_wins, "percent": round((i_wins / total_items) * 100, 1)},
            "bigbasket": {"count": bb_wins, "percent": round((bb_wins / total_items) * 100, 1)},
        },
        "descriptive_stats": stats,
        "city_comparison": city_breakdown,
        "category_breakdown": category_breakdown,
        "top_savings_products": [dict(r) for r in top_savings],
        "python_script": code_snippet
    }
