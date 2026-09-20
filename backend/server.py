# QuickX: Python Backend Server
# Authors: QuickX Team
# Purpose: Lightweight HTTP REST API for real-time grocery price comparison,
# cart optimization, and Python data analysis across Blinkit, Instamart, and BigBasket.

import http.server
import json
import os
import sqlite3
import sys
import urllib.parse
from http import HTTPStatus

# Import our Python data analysis engine
import analytics

PORT = 5001
DB_PATH = os.path.join(os.path.dirname(__file__), "quickx_data.db")

def get_db():
    """Simple function to get SQLite connection with dictionary-like row access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

class QuickXApiHandler(http.server.BaseHTTPRequestHandler):
    """
    HTTP Request Handler for QuickX backend services.
    Handles product search, category filtering, cart total calculations,
    and Python data analysis.
    """

    def end_headers(self):
        # Enable CORS for local Vite dev server and browser requests
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.OK)
        self.end_headers()

    def send_json(self, data, status=HTTPStatus.OK):
        """Helper to send JSON response with proper headers."""
        try:
            body = json.dumps(data).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as err:
            print(f"Error sending JSON response: {err}", file=sys.stderr)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        params = urllib.parse.parse_qs(parsed_url.query)

        try:
            if path == "/api/health":
                self.handle_health()
            elif path == "/api/cities":
                self.handle_cities()
            elif path == "/api/categories":
                self.handle_categories()
            elif path == "/api/items":
                self.handle_items(params)
            elif path.startswith("/api/item/"):
                item_id_str = path[len("/api/item/"):]
                self.handle_single_item(item_id_str)
            elif path in ("/api/analytics", "/api/analytics/realtime", "/api/analytics/python-analysis"):
                city = params.get("city", [""])[0].strip()
                self.handle_python_analytics(city)
            else:
                self.send_json({"error": "Endpoint Not Found", "path": path}, status=HTTPStatus.NOT_FOUND)
        except Exception as e:
            print(f"Handler error: {e}", file=sys.stderr)
            self.send_json({"error": str(e)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else b"{}"
            body = json.loads(post_data.decode("utf-8"))

            if path == "/api/cart/compare":
                self.handle_cart_compare(body)
            else:
                self.send_json({"error": "Endpoint Not Found"}, status=HTTPStatus.NOT_FOUND)
        except Exception as e:
            print(f"POST Handler error: {e}", file=sys.stderr)
            self.send_json({"error": str(e)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    # -------------------------------------------------------------
    # API ENDPOINTS
    # -------------------------------------------------------------

    def handle_health(self):
        """Health check endpoint showing backend status and item count."""
        conn = get_db()
        cursor = conn.cursor()
        count = cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        conn.close()
        self.send_json({
            "status": "healthy",
            "project": "QuickX",
            "backend": "python3-sqlite",
            "database": "quickx_data.db",
            "total_items": count,
            "region": "South India",
            "platforms": ["Blinkit", "Swiggy Instamart", "BigBasket"]
        })

    def handle_cities(self):
        """Returns list of South Indian cities supported by QuickX."""
        conn = get_db()
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT city, COUNT(*) as product_count
            FROM products
            GROUP BY city
            ORDER BY product_count DESC
        """).fetchall()
        conn.close()

        cities_data = [{"name": r["city"], "count": r["product_count"]} for r in rows]
        self.send_json({"cities": cities_data})

    def handle_categories(self):
        """Fetches all grocery categories and subcategories."""
        conn = get_db()
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT category, COUNT(*) as count, 
                   ROUND(AVG(max_savings), 2) as avg_savings,
                   SUM(CASE WHEN cheapest_platform = 'blinkit' THEN 1 ELSE 0 END) as blinkit_wins,
                   SUM(CASE WHEN cheapest_platform = 'instamart' THEN 1 ELSE 0 END) as instamart_wins,
                   SUM(CASE WHEN cheapest_platform = 'bigbasket' THEN 1 ELSE 0 END) as bigbasket_wins
            FROM products
            GROUP BY category
            ORDER BY count DESC
        """).fetchall()

        categories = []
        for r in rows:
            subcats = [s[0] for s in cursor.execute(
                "SELECT DISTINCT subcategory FROM products WHERE category = ? ORDER BY subcategory", 
                (r["category"],)
            ).fetchall()]
            categories.append({
                "name": r["category"],
                "count": r["count"],
                "avg_savings": r["avg_savings"],
                "blinkit_wins": r["blinkit_wins"],
                "instamart_wins": r["instamart_wins"],
                "bigbasket_wins": r["bigbasket_wins"],
                "subcategories": subcats
            })
        conn.close()
        self.send_json({"categories": categories})

    def handle_items(self, params):
        """Search and filter products across categories, stores, and South Indian cities."""
        q = params.get("q", [""])[0].strip()
        category = params.get("category", [""])[0].strip()
        subcategory = params.get("subcategory", [""])[0].strip()
        cheapest = params.get("cheapest", [""])[0].strip().lower()
        city = params.get("city", [""])[0].strip()
        sort_by = params.get("sort", ["savings_desc"])[0].strip()
        
        try:
            limit = min(max(int(params.get("limit", [24])[0]), 1), 100)
        except ValueError:
            limit = 24
        
        try:
            offset = max(int(params.get("offset", [0])[0]), 0)
        except ValueError:
            offset = 0

        conn = get_db()
        cursor = conn.cursor()

        where_clauses = []
        sql_params = []

        # Full Text Search via SQLite FTS5 index
        if q:
            clean_q = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in q)
            terms = [t for t in clean_q.split() if t]
            if terms:
                fts_query = " ".join(f'"{t}"*' for t in terms)
                where_clauses.append("id IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)")
                sql_params.append(fts_query)

        if category and category.lower() != "all":
            where_clauses.append("category = ?")
            sql_params.append(category)

        if subcategory and subcategory.lower() != "all":
            where_clauses.append("subcategory = ?")
            sql_params.append(subcategory)

        if cheapest in ("blinkit", "instamart", "bigbasket"):
            where_clauses.append("cheapest_platform = ?")
            sql_params.append(cheapest)

        if city and city != "All South India" and city != "all":
            where_clauses.append("(city = ? OR city = 'All South India')")
            sql_params.append(city)

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        # Safe sort mappings
        sort_map = {
            "savings_desc": "max_savings DESC",
            "savings_asc": "max_savings ASC",
            "price_asc": "min_price ASC",
            "price_desc": "min_price DESC",
            "discount_desc": "savings_percent DESC",
            "name_asc": "name ASC"
        }
        order_by = sort_map.get(sort_by, "max_savings DESC")

        # Total matching count
        count_sql = f"SELECT COUNT(*) FROM products {where_sql}"
        total_count = cursor.execute(count_sql, sql_params).fetchone()[0]

        # Fetch records
        query_sql = f"""
            SELECT id, name, category, subcategory, brand, unit, mrp,
                   blinkit_price, blinkit_stock, blinkit_delivery_time, blinkit_discount,
                   instamart_price, instamart_stock, instamart_delivery_time, instamart_discount,
                   bigbasket_price, bigbasket_stock, bigbasket_delivery_time, bigbasket_discount,
                   cheapest_platform, min_price, max_price, max_savings, savings_percent,
                   city, rating, reviews_count
            FROM products
            {where_sql}
            ORDER BY {order_by}
            LIMIT ? OFFSET ?
        """
        items_rows = cursor.execute(query_sql, sql_params + [limit, offset]).fetchall()
        items = [dict(row) for row in items_rows]
        conn.close()

        self.send_json({
            "total": total_count,
            "items": items,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(items)) < total_count
        })

    def handle_single_item(self, item_id_str):
        """Detailed comparison view for a single grocery item."""
        try:
            item_id = int(item_id_str)
        except ValueError:
            self.send_json({"error": "Invalid item ID"}, status=HTTPStatus.BAD_REQUEST)
            return

        conn = get_db()
        cursor = conn.cursor()
        row = cursor.execute("SELECT * FROM products WHERE id = ?", (item_id,)).fetchone()
        
        if not row:
            conn.close()
            self.send_json({"error": "Product not found"}, status=HTTPStatus.NOT_FOUND)
            return

        item = dict(row)

        platforms_comparison = [
            {
                "platform": "Blinkit",
                "code": "blinkit",
                "price": item["blinkit_price"],
                "mrp": item["mrp"],
                "discount_percent": item["blinkit_discount"],
                "stock": item["blinkit_stock"],
                "delivery_time": item["blinkit_delivery_time"],
                "handling_fee": 4.0,
                "delivery_fee": 15.0,
                "is_cheapest": item["cheapest_platform"] == "blinkit",
            },
            {
                "platform": "Swiggy Instamart",
                "code": "instamart",
                "price": item["instamart_price"],
                "mrp": item["mrp"],
                "discount_percent": item["instamart_discount"],
                "stock": item["instamart_stock"],
                "delivery_time": item["instamart_delivery_time"],
                "handling_fee": 5.0,
                "delivery_fee": 16.0,
                "is_cheapest": item["cheapest_platform"] == "instamart",
            },
            {
                "platform": "BigBasket",
                "code": "bigbasket",
                "price": item["bigbasket_price"],
                "mrp": item["mrp"],
                "discount_percent": item["bigbasket_discount"],
                "stock": item["bigbasket_stock"],
                "delivery_time": item["bigbasket_delivery_time"],
                "handling_fee": 0.0,
                "delivery_fee": 20.0,
                "is_cheapest": item["cheapest_platform"] == "bigbasket",
            }
        ]

        platforms_comparison.sort(key=lambda p: p["price"])

        # Fetch 4 similar items in same category
        similar_rows = cursor.execute("""
            SELECT id, name, category, brand, unit, mrp, min_price, max_savings, cheapest_platform, city
            FROM products
            WHERE category = ? AND id != ?
            ORDER BY max_savings DESC
            LIMIT 4
        """, (item["category"], item_id)).fetchall()

        similar_items = [dict(r) for r in similar_rows]
        conn.close()

        self.send_json({
            "item": item,
            "comparison": platforms_comparison,
            "winner": {
                "platform": item["cheapest_platform"],
                "lowest_price": item["min_price"],
                "highest_price": item["max_price"],
                "savings": item["max_savings"],
                "savings_percent": item["savings_percent"]
            },
            "similar_items": similar_items
        })

    def handle_cart_compare(self, body):
        """Calculates total checkout bill across Blinkit, Instamart, and BigBasket."""
        cart_items_req = body.get("items", [])
        if not cart_items_req:
            self.send_json({
                "blinkit": {"subtotal": 0, "handling": 0, "delivery": 0, "total": 0, "eta": "10 mins"},
                "instamart": {"subtotal": 0, "handling": 0, "delivery": 0, "total": 0, "eta": "12 mins"},
                "bigbasket": {"subtotal": 0, "handling": 0, "delivery": 0, "total": 0, "eta": "20 mins"},
                "winner": None,
                "smart_split": {"total": 0, "extra_savings": 0, "breakdown": []},
                "items_detail": []
            })
            return

        conn = get_db()
        cursor = conn.cursor()

        item_ids = [int(it.get("id")) for it in cart_items_req if "id" in it]
        qty_map = {int(it.get("id")): max(int(it.get("qty", 1)), 1) for it in cart_items_req if "id" in it}

        if not item_ids:
            conn.close()
            self.send_json({"error": "No valid item IDs"}, status=HTTPStatus.BAD_REQUEST)
            return

        placeholders = ",".join(["?"] * len(item_ids))
        rows = cursor.execute(f"SELECT * FROM products WHERE id IN ({placeholders})", item_ids).fetchall()
        conn.close()

        b_subtotal = 0.0
        i_subtotal = 0.0
        bb_subtotal = 0.0
        mrp_total = 0.0

        items_detail = []
        split_cart_items = []
        smart_split_total = 0.0

        for r in rows:
            it = dict(r)
            qty = qty_map.get(it["id"], 1)

            b_cost = round(it["blinkit_price"] * qty, 2)
            i_cost = round(it["instamart_price"] * qty, 2)
            bb_cost = round(it["bigbasket_price"] * qty, 2)
            mrp_cost = round(it["mrp"] * qty, 2)

            b_subtotal += b_cost
            i_subtotal += i_cost
            bb_subtotal += bb_cost
            mrp_total += mrp_cost

            # Determine cheapest platform for this specific line item
            prices = [
                ("blinkit", b_cost, it["blinkit_price"]),
                ("instamart", i_cost, it["instamart_price"]),
                ("bigbasket", bb_cost, it["bigbasket_price"])
            ]
            prices.sort(key=lambda x: x[1])
            cheapest_for_item = prices[0][0]
            cheapest_cost = prices[0][1]
            smart_split_total += cheapest_cost

            split_cart_items.append({
                "id": it["id"],
                "name": it["name"],
                "qty": qty,
                "unit": it["unit"],
                "best_store": cheapest_for_item,
                "best_price": prices[0][2],
                "total_cost": cheapest_cost,
                "saved_vs_worst": round(prices[-1][1] - cheapest_cost, 2)
            })

            items_detail.append({
                "id": it["id"],
                "name": it["name"],
                "qty": qty,
                "unit": it["unit"],
                "category": it["category"],
                "city": it.get("city", "South India"),
                "mrp": it["mrp"],
                "mrp_total": mrp_cost,
                "blinkit": {"unit_price": it["blinkit_price"], "line_total": b_cost, "stock": it["blinkit_stock"]},
                "instamart": {"unit_price": it["instamart_price"], "line_total": i_cost, "stock": it["instamart_stock"]},
                "bigbasket": {"unit_price": it["bigbasket_price"], "line_total": bb_cost, "stock": it["bigbasket_stock"]},
                "cheapest_platform": cheapest_for_item
            })

        # Delivery & handling fee calculation
        # Blinkit: Free delivery on order >= 199, else Rs 25; handling Rs 4
        b_delivery = 0.0 if b_subtotal >= 199.0 else 25.0
        b_handling = 4.0 if b_subtotal > 0 else 0.0
        b_total = round(b_subtotal + b_delivery + b_handling, 2)

        # Instamart: Free delivery on order >= 199, else Rs 29; handling Rs 5
        i_delivery = 0.0 if i_subtotal >= 199.0 else 29.0
        i_handling = 5.0 if i_subtotal > 0 else 0.0
        i_total = round(i_subtotal + i_delivery + i_handling, 2)

        # BigBasket: Free delivery on order >= 300, else Rs 20; handling Rs 0
        bb_delivery = 0.0 if bb_subtotal >= 300.0 else 20.0
        bb_handling = 0.0
        bb_total = round(bb_subtotal + bb_delivery + bb_handling, 2)

        platforms_cart = [
            {
                "platform": "Blinkit",
                "code": "blinkit",
                "subtotal": round(b_subtotal, 2),
                "delivery": b_delivery,
                "handling": b_handling,
                "total": b_total,
                "eta": "8-12 mins",
                "discount_vs_mrp": round(mrp_total - b_total, 2) if mrp_total > b_total else 0,
            },
            {
                "platform": "Swiggy Instamart",
                "code": "instamart",
                "subtotal": round(i_subtotal, 2),
                "delivery": i_delivery,
                "handling": i_handling,
                "total": i_total,
                "eta": "10-15 mins",
                "discount_vs_mrp": round(mrp_total - i_total, 2) if mrp_total > i_total else 0,
            },
            {
                "platform": "BigBasket",
                "code": "bigbasket",
                "subtotal": round(bb_subtotal, 2),
                "delivery": bb_delivery,
                "handling": bb_handling,
                "total": bb_total,
                "eta": "15-28 mins",
                "discount_vs_mrp": round(mrp_total - bb_total, 2) if mrp_total > bb_total else 0,
            }
        ]

        platforms_cart.sort(key=lambda p: p["total"])
        winner = platforms_cart[0]
        most_expensive = platforms_cart[-1]
        single_app_savings = round(most_expensive["total"] - winner["total"], 2)
        extra_split_savings = round(winner["subtotal"] - smart_split_total, 2)

        self.send_json({
            "mrp_total": round(mrp_total, 2),
            "platforms": {p["code"]: p for p in platforms_cart},
            "ranked_platforms": platforms_cart,
            "single_winner": {
                "platform": winner["platform"],
                "code": winner["code"],
                "total": winner["total"],
                "savings_vs_highest": single_app_savings,
                "savings_vs_mrp": winner["discount_vs_mrp"]
            },
            "smart_split": {
                "subtotal": round(smart_split_total, 2),
                "extra_savings_vs_winner": max(0.0, extra_split_savings),
                "total_items": len(split_cart_items),
                "items": split_cart_items
            },
            "items_detail": items_detail
        })

    def handle_python_analytics(self, city=None):
        """Runs Python data analysis and returns statistical payload."""
        data = analytics.generate_complete_analytics_payload(city)
        self.send_json(data)

def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = http.server.ThreadingHTTPServer(server_address, QuickXApiHandler)
    print(f"QuickX Python Backend running on http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Stopping QuickX backend server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
