// QuickX TypeScript Data Models
// Author: QuickX Team
// Purpose: Type definitions for products, comparison tables, cart optimizer,
// South Indian cities, and Python data analysis results.

export type Platform = 'blinkit' | 'instamart' | 'bigbasket';

export interface Product {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  unit: string;
  mrp: number;
  blinkit_price: number;
  blinkit_stock: string;
  blinkit_delivery_time: string;
  blinkit_discount: number;
  instamart_price: number;
  instamart_stock: string;
  instamart_delivery_time: string;
  instamart_discount: number;
  bigbasket_price: number;
  bigbasket_stock: string;
  bigbasket_delivery_time: string;
  bigbasket_discount: number;
  cheapest_platform: Platform;
  min_price: number;
  max_price: number;
  max_savings: number;
  savings_percent: number;
  city?: string;
  rating: number;
  reviews_count: number;
}

export interface PlatformComparisonDetail {
  platform: string;
  code: Platform;
  price: number;
  mrp: number;
  discount_percent: number;
  discount_amount: number;
  stock: string;
  delivery_time: string;
  estimated_minutes: number;
  handling_fee: number;
  delivery_fee: number;
  is_cheapest: boolean;
  theme_color: string;
  badge_color: string;
}

export interface ItemComparisonResponse {
  item: Product;
  comparison: PlatformComparisonDetail[];
  winner: {
    platform: Platform;
    lowest_price: number;
    highest_price: number;
    savings: number;
    savings_percent: number;
  };
  similar_items: Array<{
    id: number;
    name: string;
    category: string;
    brand: string;
    unit: string;
    mrp: number;
    min_price: number;
    max_savings: number;
    cheapest_platform: Platform;
    city?: string;
    rating: number;
  }>;
}

export interface CategoryInfo {
  name: string;
  count: number;
  avg_savings: number;
  blinkit_wins: number;
  instamart_wins: number;
  bigbasket_wins: number;
  subcategories: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CartPlatformSummary {
  platform: string;
  code: Platform;
  subtotal: number;
  delivery: number;
  handling: number;
  total: number;
  eta: string;
  discount_vs_mrp: number;
  free_delivery_threshold: number;
  free_delivery_eligible: boolean;
}

export interface CartComparisonResponse {
  mrp_total: number;
  platforms: {
    blinkit: CartPlatformSummary;
    instamart: CartPlatformSummary;
    bigbasket: CartPlatformSummary;
  };
  ranked_platforms: CartPlatformSummary[];
  single_winner: {
    platform: string;
    code: Platform;
    total: number;
    savings_vs_highest: number;
    savings_vs_mrp: number;
  };
  smart_split: {
    subtotal: number;
    extra_savings_vs_winner: number;
    total_items: number;
    items: Array<{
      id: number;
      name: string;
      qty: number;
      unit: string;
      best_store: Platform;
      best_price: number;
      total_cost: number;
      saved_vs_worst: number;
    }>;
  };
  items_detail: Array<{
    id: number;
    name: string;
    qty: number;
    unit: string;
    category: string;
    city?: string;
    mrp: number;
    mrp_total: number;
    blinkit: { unit_price: number; line_total: number; stock: string };
    instamart: { unit_price: number; line_total: number; stock: string };
    bigbasket: { unit_price: number; line_total: number; stock: string };
    cheapest_platform: Platform;
  }>;
}

export interface StatisticalMetric {
  metric_name: string;
  count: number;
  mean: number;
  median: number;
  std_dev: number;
  variance: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
}

export interface CityAnalysisRecord {
  city: string;
  total_products: number;
  avg_mrp: number;
  avg_blinkit: number;
  avg_instamart: number;
  avg_bigbasket: number;
  avg_savings_rs: number;
  avg_savings_percent: number;
  blinkit_win_rate: number;
  instamart_win_rate: number;
  bigbasket_win_rate: number;
}

export interface CategoryAnalysisRecord {
  category: string;
  item_count: number;
  avg_mrp: number;
  avg_best_price: number;
  avg_savings: number;
  avg_discount_pct: number;
  b_cheapest: number;
  i_cheapest: number;
  bb_cheapest: number;
}

export interface PythonAnalysisData {
  project_name: string;
  total_items: number;
  selected_city: string;
  total_savings_pool: number;
  win_rates: {
    blinkit: { count: number; percent: number };
    instamart: { count: number; percent: number };
    bigbasket: { count: number; percent: number };
  };
  descriptive_stats: Record<string, StatisticalMetric>;
  city_comparison: CityAnalysisRecord[];
  category_breakdown: CategoryAnalysisRecord[];
  top_savings_products: Product[];
  python_script: string;
}
