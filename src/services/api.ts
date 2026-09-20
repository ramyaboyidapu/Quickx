// QuickX API Service
// Author: QuickX Team
// Purpose: Fetch data from QuickX Python backend for products, 
// South Indian cities, price comparison, cart optimization, and Python data analysis.

import { 
  CategoryInfo, 
  ItemComparisonResponse, 
  CartComparisonResponse, 
  PythonAnalysisData, 
  Product 
} from '../types';

export interface SearchParams {
  q?: string;
  category?: string;
  subcategory?: string;
  cheapest?: string;
  city?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  total: number;
  items: Product[];
  limit: number;
  offset: number;
  has_more: boolean;
}

export async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Failed to connect to QuickX backend');
  return res.json();
}

export async function fetchCities(): Promise<{ cities: Array<{ name: string; count: number }> }> {
  const res = await fetch('/api/cities');
  if (!res.ok) throw new Error('Failed to fetch cities');
  return res.json();
}

export async function fetchCategories(): Promise<{ categories: CategoryInfo[] }> {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}

export async function fetchItems(params: SearchParams): Promise<SearchResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category && params.category !== 'all') query.set('category', params.category);
  if (params.subcategory && params.subcategory !== 'all') query.set('subcategory', params.subcategory);
  if (params.cheapest) query.set('cheapest', params.cheapest);
  if (params.city && params.city !== 'all') query.set('city', params.city);
  if (params.sort) query.set('sort', params.sort);
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.offset) query.set('offset', params.offset.toString());

  const res = await fetch(`/api/items?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch items');
  return res.json();
}

export async function fetchItemComparison(id: number): Promise<ItemComparisonResponse> {
  const res = await fetch(`/api/item/${id}`);
  if (!res.ok) throw new Error('Failed to fetch item comparison');
  return res.json();
}

export async function compareCart(items: Array<{ id: number; qty: number }>): Promise<CartComparisonResponse> {
  const res = await fetch('/api/cart/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('Failed to calculate cart comparison');
  return res.json();
}

export async function fetchPythonDataAnalysis(city?: string): Promise<PythonAnalysisData> {
  const query = city && city !== 'All South India' ? `?city=${encodeURIComponent(city)}` : '';
  const res = await fetch(`/api/analytics/python-analysis${query}`);
  if (!res.ok) throw new Error('Failed to load Python analysis data');
  return res.json();
}
