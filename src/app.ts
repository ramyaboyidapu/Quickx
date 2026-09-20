// QuickX Frontend Controller
// Authors: QuickX Project Team
// Description: Pure vanilla TypeScript controller handling product search,
// South Indian regional locations, real-time store price comparison,
// cart optimization, and Python data analysis.

import { 
  Product, 
  CategoryInfo, 
  CartItem, 
  Platform, 
  CartComparisonResponse, 
  PythonAnalysisData 
} from './types';
import { 
  fetchCategories, 
  fetchItems, 
  fetchHealth, 
  compareCart, 
  fetchPythonDataAnalysis,
  fetchItemComparison
} from './services/api';

// Step 1: Global Application State
interface QuickXState {
  searchQuery: string;
  selectedCategory: string;
  selectedSubcategory: string;
  selectedCheapestFilter: string;
  selectedCity: string;
  sortBy: string;
  offset: number;
  limit: number;
  totalProducts: number;
  hasMore: boolean;
  loading: boolean;
  products: Product[];
  categories: CategoryInfo[];
  cart: CartItem[];
  selectedProductForModal: Product | null;
  selectedCartStrategy: Platform | 'split';
  cartComparisonData: CartComparisonResponse | null;
  activeAnalyticsTab: 'overview' | 'stats' | 'cities' | 'code';
}

const state: QuickXState = {
  searchQuery: '',
  selectedCategory: 'all',
  selectedSubcategory: 'all',
  selectedCheapestFilter: '',
  selectedCity: 'All South India',
  sortBy: 'savings_desc',
  offset: 0,
  limit: 24,
  totalProducts: 0,
  hasMore: true,
  loading: false,
  products: [],
  categories: [],
  cart: loadCartFromStorage(),
  selectedProductForModal: null,
  selectedCartStrategy: 'blinkit',
  cartComparisonData: null,
  activeAnalyticsTab: 'overview',
};

// Helper function: Load cart saved in browser local storage
function loadCartFromStorage(): CartItem[] {
  try {
    const saved = localStorage.getItem('quickx_cart');
    return saved ? JSON.parse(saved) : [];
  } catch (err) {
    console.warn('Could not load cart from storage:', err);
    return [];
  }
}

// Helper function: Persist cart to browser local storage
function saveCartToStorage() {
  try {
    localStorage.setItem('quickx_cart', JSON.stringify(state.cart));
  } catch (err) {
    console.warn('Could not save cart to storage:', err);
  }
}

// Helper function: Format currency cleanly
const formatCurrency = (val: number) => `₹${val.toFixed(2)}`;

// DOM Element References
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchClearBtn = document.getElementById('search-clear-btn') as HTMLButtonElement;
const locationSelect = document.getElementById('location-select') as HTMLSelectElement;
const categoriesList = document.getElementById('categories-list') as HTMLDivElement;
const subfilterBar = document.getElementById('subfilter-bar') as HTMLDivElement;
const productsGrid = document.getElementById('products-grid') as HTMLDivElement;
const resultsCount = document.getElementById('results-count') as HTMLElement;
const resultsHeading = document.getElementById('results-heading') as HTMLElement;
const loadMoreBtn = document.getElementById('btn-load-more') as HTMLButtonElement;
const loadMoreContainer = document.getElementById('load-more-container') as HTMLDivElement;
const cartCountBadge = document.getElementById('cart-count-badge') as HTMLElement;
const openCartBtn = document.getElementById('btn-open-cart') as HTMLButtonElement;
const openAnalyticsBtn = document.getElementById('btn-open-analytics') as HTMLButtonElement;
const mobileCartBar = document.getElementById('mobile-cart-bar') as HTMLDivElement;
const brandHomeBtn = document.getElementById('brand-home-btn') as HTMLDivElement;

// Modal Elements
const compareModal = document.getElementById('compare-modal') as HTMLDivElement;
const compareModalBody = document.getElementById('compare-modal-body') as HTMLDivElement;
const compareModalFooter = document.getElementById('compare-modal-footer') as HTMLDivElement;
const cartModal = document.getElementById('cart-modal') as HTMLDivElement;
const cartModalBody = document.getElementById('cart-modal-body') as HTMLDivElement;
const cartModalFooter = document.getElementById('cart-modal-footer') as HTMLDivElement;
const analyticsModal = document.getElementById('analytics-modal') as HTMLDivElement;
const analyticsModalBody = document.getElementById('analytics-modal-body') as HTMLDivElement;
const checkoutModal = document.getElementById('checkout-modal') as HTMLDivElement;
const checkoutModalBody = document.getElementById('checkout-modal-body') as HTMLDivElement;

// Step 2: Main App Initialization
export async function initApp() {
  updateCartUI();

  // Fetch backend status
  fetchHealth().then((health) => {
    const dbBadge = document.getElementById('db-count-badge');
    if (dbBadge && health.total_items) {
      dbBadge.textContent = `${health.total_items.toLocaleString()} Products Live`;
    }
  }).catch((err) => {
    console.error('Health check notice:', err);
  });

  // Fetch product categories
  try {
    const res = await fetchCategories();
    state.categories = res.categories;
    renderCategories();
  } catch (err) {
    console.error('Failed to load categories:', err);
  }

  // Load initial product items
  await loadProducts(true);

  // Bind all user interaction listeners
  setupEventListeners();
}

// Step 3: Event Listeners Setup
function setupEventListeners() {
  // Brand click resets to home
  brandHomeBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.searchQuery = '';
    state.selectedCategory = 'all';
    state.selectedSubcategory = 'all';
    state.selectedCheapestFilter = '';
    renderCategories();
    loadProducts(true);
  });

  // Location selector change
  locationSelect?.addEventListener('change', (e) => {
    state.selectedCity = (e.target as HTMLSelectElement).value;
    loadProducts(true);
  });

  // Search input with debounce
  let searchTimer: any;
  searchInput?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    state.searchQuery = val;
    if (searchClearBtn) {
      searchClearBtn.style.display = val.length > 0 ? 'block' : 'none';
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadProducts(true);
    }, 280);
  });

  // Clear search button
  searchClearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.searchQuery = '';
    searchClearBtn.style.display = 'none';
    loadProducts(true);
  });

  // Load more button
  loadMoreBtn?.addEventListener('click', () => {
    loadProducts(false);
  });

  // Cart modal openers
  openCartBtn?.addEventListener('click', () => openCartModal());
  mobileCartBar?.addEventListener('click', () => openCartModal());

  // Python analysis modal opener
  openAnalyticsBtn?.addEventListener('click', () => openAnalyticsModal());

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const modalId = (e.currentTarget as HTMLElement).getAttribute('data-close-modal');
      if (modalId) closeModal(modalId);
    });
  });

  // Backdrop click to close modals
  [compareModal, cartModal, analyticsModal, checkoutModal].forEach((overlay) => {
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
}

// Step 4: Render Category Navigation Chips
function renderCategories() {
  if (!categoriesList) return;
  categoriesList.innerHTML = '';

  // All Categories Chip
  const allChip = document.createElement('button');
  allChip.className = `category-chip ${state.selectedCategory === 'all' ? 'active' : ''}`;
  allChip.innerHTML = `<span>🧺</span> <span>All Groceries</span>`;
  allChip.onclick = () => selectCategory('all');
  categoriesList.appendChild(allChip);

  // Category specific icons
  const iconMap: Record<string, string> = {
    'Fruits & Vegetables': '🥦',
    'Dairy, Bread & Eggs': '🥛',
    'Atta, Rice, Oil & Dals': '🌾',
    'Instant, Batter & Packaged Foods': '🥞',
    'Tea, Coffee & Beverages': '☕',
    'Snacks, Munchies & Sweets': '🥨',
    'Personal Care & Household': '🧼'
  };

  state.categories.forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = `category-chip ${state.selectedCategory === cat.name ? 'active' : ''}`;
    const icon = iconMap[cat.name] || '🛒';
    chip.innerHTML = `<span>${icon}</span> <span>${cat.name} (${cat.count})</span>`;
    chip.onclick = () => selectCategory(cat.name);
    categoriesList.appendChild(chip);
  });

  renderSubfilterBar();
}

function selectCategory(categoryName: string) {
  state.selectedCategory = categoryName;
  state.selectedSubcategory = 'all';
  renderCategories();
  loadProducts(true);
}

// Step 5: Render Subcategories and Store Filters
function renderSubfilterBar() {
  if (!subfilterBar) return;

  const currentCat = state.categories.find((c) => c.name === state.selectedCategory);
  const subcats = currentCat ? currentCat.subcategories : [];

  let subcatsHtml = '';
  if (subcats.length > 0) {
    subcatsHtml = `
      <div class="subfilter-chips">
        <button class="subcat-chip ${state.selectedSubcategory === 'all' ? 'active' : ''}" id="subcat-all">All Subcategories</button>
        ${subcats.map((sc) => `
          <button class="subcat-chip ${state.selectedSubcategory === sc ? 'active' : ''}" data-subcat="${sc}">${sc}</button>
        `).join('')}
      </div>
    `;
  }

  subfilterBar.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;width:100%;">
      ${subcatsHtml}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div class="platform-filters">
          <span style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-right:4px;">Filter Best Store:</span>
          <button class="platform-pill ${state.selectedCheapestFilter === '' ? 'active' : ''}" id="filter-store-all">All Platforms</button>
          <button class="platform-pill blinkit ${state.selectedCheapestFilter === 'blinkit' ? 'active' : ''}" id="filter-store-blinkit">Blinkit Cheapest</button>
          <button class="platform-pill instamart ${state.selectedCheapestFilter === 'instamart' ? 'active' : ''}" id="filter-store-instamart">Instamart Cheapest</button>
          <button class="platform-pill bigbasket ${state.selectedCheapestFilter === 'bigbasket' ? 'active' : ''}" id="filter-store-bigbasket">BigBasket Cheapest</button>
        </div>

        <div style="display:flex;align-items:center;gap:8px;">
          <label style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);">Sort By:</label>
          <select id="sort-select" class="sort-select" aria-label="Sort products">
            <option value="savings_desc" ${state.sortBy === 'savings_desc' ? 'selected' : ''}>Max Savings % (Cheapest First)</option>
            <option value="price_asc" ${state.sortBy === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
            <option value="price_desc" ${state.sortBy === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
            <option value="name_asc" ${state.sortBy === 'name_asc' ? 'selected' : ''}>Alphabetical (A-Z)</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // Subcategory listeners
  document.getElementById('subcat-all')?.addEventListener('click', () => {
    state.selectedSubcategory = 'all';
    renderSubfilterBar();
    loadProducts(true);
  });

  subfilterBar.querySelectorAll('[data-subcat]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.selectedSubcategory = (e.currentTarget as HTMLElement).getAttribute('data-subcat') || 'all';
      renderSubfilterBar();
      loadProducts(true);
    });
  });

  // Store filter listeners
  document.getElementById('filter-store-all')?.addEventListener('click', () => {
    state.selectedCheapestFilter = '';
    renderSubfilterBar();
    loadProducts(true);
  });
  document.getElementById('filter-store-blinkit')?.addEventListener('click', () => {
    state.selectedCheapestFilter = 'blinkit';
    renderSubfilterBar();
    loadProducts(true);
  });
  document.getElementById('filter-store-instamart')?.addEventListener('click', () => {
    state.selectedCheapestFilter = 'instamart';
    renderSubfilterBar();
    loadProducts(true);
  });
  document.getElementById('filter-store-bigbasket')?.addEventListener('click', () => {
    state.selectedCheapestFilter = 'bigbasket';
    renderSubfilterBar();
    loadProducts(true);
  });

  // Sort change listener
  const sortSelect = document.getElementById('sort-select') as HTMLSelectElement;
  sortSelect?.addEventListener('change', (e) => {
    state.sortBy = (e.target as HTMLSelectElement).value;
    loadProducts(true);
  });
}

// Step 6: Fetch & Render Products from Python Backend
async function loadProducts(reset = false) {
  if (state.loading) return;
  state.loading = true;

  if (reset) {
    state.offset = 0;
    if (productsGrid) {
      productsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 48px 0; color: var(--text-muted);">
          <div style="font-weight:700; font-size: 1rem;">Searching real-time grocery prices across South India...</div>
        </div>
      `;
    }
  }

  try {
    const res = await fetchItems({
      q: state.searchQuery,
      category: state.selectedCategory,
      subcategory: state.selectedSubcategory,
      cheapest: state.selectedCheapestFilter,
      city: state.selectedCity,
      sort: state.sortBy,
      limit: state.limit,
      offset: state.offset,
    });

    state.totalProducts = res.total;
    state.hasMore = res.has_more;

    if (reset) {
      state.products = res.items;
    } else {
      state.products = [...state.products, ...res.items];
    }

    state.offset += res.items.length;

    // Update results heading and total count
    if (resultsHeading) {
      if (state.searchQuery) {
        resultsHeading.textContent = `Results for "${state.searchQuery}"`;
      } else if (state.selectedCategory !== 'all') {
        resultsHeading.textContent = state.selectedCategory;
      } else {
        resultsHeading.textContent = 'All Grocery Products';
      }
    }

    if (resultsCount) {
      resultsCount.textContent = `${res.total.toLocaleString()} products available`;
    }

    renderProductCards(reset);

    // Show or hide load more button
    if (loadMoreContainer) {
      loadMoreContainer.style.display = state.hasMore ? 'flex' : 'none';
    }
  } catch (err) {
    console.error('Error fetching items:', err);
    if (productsGrid && reset) {
      productsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 48px 0; color: var(--color-danger);">
          <div style="font-weight:700;">Could not load products. Please check if Python backend is running.</div>
        </div>
      `;
    }
  } finally {
    state.loading = false;
  }
}

// Step 7: Render Product Cards Grid
function renderProductCards(reset: boolean) {
  if (!productsGrid) return;

  if (reset) {
    productsGrid.innerHTML = '';
  }

  if (state.products.length === 0) {
    productsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 60px 16px; background:#ffffff; border-radius:var(--radius-md); border:1px solid var(--border-light);">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        <h3 style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">No matching items found</h3>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">Try modifying your search keywords or switching categories.</p>
      </div>
    `;
    return;
  }

  const itemsToRender = reset ? state.products : state.products.slice(state.offset - state.limit);

  itemsToRender.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('id', `product-card-${product.id}`);

    const cartEntry = state.cart.find((it) => it.product.id === product.id);
    const inCartQty = cartEntry ? cartEntry.quantity : 0;

    // Platform winner label
    const winnerName = product.cheapest_platform === 'blinkit' ? 'Blinkit' :
                       product.cheapest_platform === 'instamart' ? 'Instamart' : 'BigBasket';

    card.innerHTML = `
      <div>
        <div class="card-top-badges">
          <span class="card-category-tag">${product.subcategory}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            ${product.city ? `<span class="card-city-badge">📍 ${product.city}</span>` : ''}
            <span class="savings-ribbon">Save ₹${product.max_savings.toFixed(0)} (${product.savings_percent.toFixed(0)}%)</span>
          </div>
        </div>

        <h3 class="product-title" data-compare-id="${product.id}">${product.name}</h3>

        <div class="product-meta-row">
          <span class="product-unit">${product.unit}</span>
          <span style="text-decoration: line-through; color: var(--text-muted);">MRP ${formatCurrency(product.mrp)}</span>
          <span class="product-rating">★ ${product.rating.toFixed(1)}</span>
        </div>

        <!-- 3-Way Store Live Price Strip -->
        <div class="store-price-strip">
          <!-- Blinkit -->
          <div class="store-col blinkit ${product.cheapest_platform === 'blinkit' ? 'winner' : ''}">
            ${product.cheapest_platform === 'blinkit' ? '<span class="best-badge-micro">BEST</span>' : ''}
            <div class="store-label">⚡ Blinkit</div>
            <div class="store-price-val">${formatCurrency(product.blinkit_price)}</div>
            <div class="store-eta-val">${product.blinkit_delivery_time}</div>
          </div>

          <!-- Instamart -->
          <div class="store-col instamart ${product.cheapest_platform === 'instamart' ? 'winner' : ''}">
            ${product.cheapest_platform === 'instamart' ? '<span class="best-badge-micro">BEST</span>' : ''}
            <div class="store-label">🛵 Instamart</div>
            <div class="store-price-val">${formatCurrency(product.instamart_price)}</div>
            <div class="store-eta-val">${product.instamart_delivery_time}</div>
          </div>

          <!-- BigBasket -->
          <div class="store-col bigbasket ${product.cheapest_platform === 'bigbasket' ? 'winner' : ''}">
            ${product.cheapest_platform === 'bigbasket' ? '<span class="best-badge-micro">BEST</span>' : ''}
            <div class="store-label">🛒 BigBasket</div>
            <div class="store-price-val">${formatCurrency(product.bigbasket_price)}</div>
            <div class="store-eta-val">${product.bigbasket_delivery_time}</div>
          </div>
        </div>
      </div>

      <div class="card-actions-row">
        <button class="btn-compare-detail" data-compare-id="${product.id}">
          Compare Table &rarr;
        </button>

        ${inCartQty > 0 ? `
          <div class="btn-qty-control">
            <button data-qty-dec="${product.id}">-</button>
            <span>${inCartQty}</span>
            <button data-qty-inc="${product.id}">+</button>
          </div>
        ` : `
          <button class="btn-add-cart" data-cart-add="${product.id}">
            + Add
          </button>
        `}
      </div>
    `;

    // Attach click handlers
    card.querySelectorAll('[data-compare-id]').forEach((btn) => {
      btn.addEventListener('click', () => openCompareModal(product));
    });

    card.querySelector('[data-cart-add]')?.addEventListener('click', () => {
      addToCart(product);
    });

    card.querySelector('[data-qty-inc]')?.addEventListener('click', () => {
      addToCart(product);
    });

    card.querySelector('[data-qty-dec]')?.addEventListener('click', () => {
      decreaseCart(product.id);
    });

    productsGrid.appendChild(card);
  });
}

// Step 8: Cart Management Functions
function addToCart(product: Product) {
  const existing = state.cart.find((it) => it.product.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ product, quantity: 1 });
  }
  saveCartToStorage();
  updateCartUI();
  updateCardQtyDisplay(product.id);
}

function decreaseCart(productId: number) {
  const existingIndex = state.cart.findIndex((it) => it.product.id === productId);
  if (existingIndex > -1) {
    if (state.cart[existingIndex].quantity > 1) {
      state.cart[existingIndex].quantity -= 1;
    } else {
      state.cart.splice(existingIndex, 1);
    }
  }
  saveCartToStorage();
  updateCartUI();
  updateCardQtyDisplay(productId);
}

function updateCardQtyDisplay(productId: number) {
  const card = document.getElementById(`product-card-${productId}`);
  if (!card) return;
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  const actionsRow = card.querySelector('.card-actions-row');
  if (!actionsRow) return;

  const cartEntry = state.cart.find((it) => it.product.id === productId);
  const qty = cartEntry ? cartEntry.quantity : 0;

  actionsRow.innerHTML = `
    <button class="btn-compare-detail" data-compare-id="${product.id}">
      Compare Table &rarr;
    </button>
    ${qty > 0 ? `
      <div class="btn-qty-control">
        <button data-qty-dec="${product.id}">-</button>
        <span>${qty}</span>
        <button data-qty-inc="${product.id}">+</button>
      </div>
    ` : `
      <button class="btn-add-cart" data-cart-add="${product.id}">
        + Add
      </button>
    `}
  `;

  actionsRow.querySelector('[data-compare-id]')?.addEventListener('click', () => openCompareModal(product));
  actionsRow.querySelector('[data-cart-add]')?.addEventListener('click', () => addToCart(product));
  actionsRow.querySelector('[data-qty-inc]')?.addEventListener('click', () => addToCart(product));
  actionsRow.querySelector('[data-qty-dec]')?.addEventListener('click', () => decreaseCart(product.id));
}

function updateCartUI() {
  const totalCount = state.cart.reduce((acc, it) => acc + it.quantity, 0);
  if (cartCountBadge) {
    cartCountBadge.textContent = totalCount.toString();
  }
  if (mobileCartBar) {
    mobileCartBar.style.display = totalCount > 0 ? 'flex' : 'none';
    const mobileText = document.getElementById('mobile-cart-text');
    if (mobileText) {
      mobileText.textContent = `${totalCount} item${totalCount === 1 ? '' : 's'} in cart`;
    }
  }
}

// Step 9: MODAL 1 - Item Price Comparison Table
async function openCompareModal(product: Product) {
  if (!compareModal || !compareModalBody || !compareModalFooter) return;
  state.selectedProductForModal = product;
  compareModal.classList.add('active');

  // Loading skeleton
  compareModalBody.innerHTML = `
    <div style="text-align:center;padding:40px 16px;color:var(--text-muted);">
      <div style="font-weight:700;">Fetching live store prices from dark-stores...</div>
    </div>
  `;

  try {
    const data = await fetchItemComparison(product.id);
    const p = data.item;
    const winner = data.winner;

    const cartEntry = state.cart.find((it) => it.product.id === product.id);
    const inCartQty = cartEntry ? cartEntry.quantity : 0;

    compareModalBody.innerHTML = `
      <div>
        <div style="margin-bottom: 16px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">${p.category} &bull; ${p.subcategory}</span>
            ${p.city ? `<span class="card-city-badge">📍 ${p.city} Hub</span>` : ''}
          </div>
          <h2 style="font-size:1.25rem;font-weight:900;color:var(--text-primary);line-height:1.3;">${p.name}</h2>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;">
            Brand: <strong>${p.brand}</strong> &bull; Pack Unit: <strong>${p.unit}</strong> &bull; MRP: <strong style="text-decoration:line-through;">${formatCurrency(p.mrp)}</strong>
          </div>
        </div>

        <!-- Savings Banner -->
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:var(--radius-md);padding:12px 16px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:0.85rem;font-weight:900;color:#065f46;">
              🏆 Lowest Price Available on ${winner.platform.toUpperCase()}
            </div>
            <div style="font-size:0.75rem;color:#047857;margin-top:2px;">
              Save ${formatCurrency(winner.savings)} (${winner.savings_percent.toFixed(0)}% lower than highest competitor)
            </div>
          </div>
          <span style="font-size:1.3rem;font-weight:900;color:#065f46;">
            ${formatCurrency(winner.lowest_price)}
          </span>
        </div>

        <!-- Real-Time Comparison Table -->
        <h4 style="font-size:0.8rem;font-weight:800;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">
          Multi-Platform Price Breakdown
        </h4>
        <table class="compare-table">
          <thead>
            <tr>
              <th>Store Platform</th>
              <th>Price</th>
              <th>Discount vs MRP</th>
              <th>Delivery ETA</th>
              <th>Stock Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.comparison.map((c) => `
              <tr class="${c.is_cheapest ? 'winner-cell' : ''}">
                <td>
                  <div style="font-weight:800;display:flex;align-items:center;gap:6px;">
                    ${c.platform === 'Blinkit' ? '⚡ Blinkit' : c.platform === 'Swiggy Instamart' ? '🛵 Instamart' : '🛒 BigBasket'}
                    ${c.is_cheapest ? '<span class="best-badge-micro" style="position:static;transform:none;">LOWEST</span>' : ''}
                  </div>
                </td>
                <td>
                  <span class="price-big" style="color: ${c.is_cheapest ? 'var(--color-success)' : 'var(--text-primary)'};">
                    ${formatCurrency(c.price)}
                  </span>
                </td>
                <td>
                  <span style="font-weight:700;color:#059669;">
                    -${c.discount_percent.toFixed(0)}% (Save ₹${(p.mrp - c.price).toFixed(0)})
                  </span>
                </td>
                <td>
                  <span class="eta-badge">⏱ ${c.delivery_time}</span>
                </td>
                <td>
                  <span style="font-size:0.75rem;font-weight:700;color:#16a34a;">● ${c.stock}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Similar Category Items -->
        ${data.similar_items.length > 0 ? `
          <div style="margin-top:20px;">
            <h4 style="font-size:0.8rem;font-weight:800;color:var(--text-secondary);text-transform:uppercase;margin-bottom:10px;">
              Related ${p.category} Items
            </h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:8px;">
              ${data.similar_items.map((sim) => `
                <div style="background:#f8fafc;border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:8px 10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" class="sim-item-click" data-sim-id="${sim.id}">
                  <div>
                    <div style="font-size:0.78rem;font-weight:700;color:var(--text-primary);">${sim.name}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${sim.unit}</div>
                  </div>
                  <span style="font-size:0.8rem;font-weight:900;color:var(--color-success);">${formatCurrency(sim.min_price)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Footer actions
    compareModalFooter.innerHTML = `
      <div style="font-size:0.8rem;color:var(--text-secondary);">
        Cart: <strong>${inCartQty}</strong> in basket
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary" data-close-modal="compare-modal">Close</button>
        <button class="btn-primary" id="modal-btn-add-cart">
          ${inCartQty > 0 ? '+ Add Another' : '+ Add to Compare Cart'}
        </button>
      </div>
    `;

    document.getElementById('modal-btn-add-cart')?.addEventListener('click', () => {
      addToCart(p);
      openCompareModal(p);
    });

    compareModalBody.querySelectorAll('.sim-item-click').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = Number((e.currentTarget as HTMLElement).getAttribute('data-sim-id'));
        const full = state.products.find((it) => it.id === id);
        if (full) openCompareModal(full);
      });
    });
  } catch (err) {
    console.error('Error fetching item details:', err);
    compareModalBody.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--color-danger);">
        Failed to load item comparison table.
      </div>
    `;
  }
}

// Step 10: MODAL 2 - Cart Comparison & Store Optimizer
async function openCartModal() {
  if (!cartModal || !cartModalBody || !cartModalFooter) return;
  cartModal.classList.add('active');

  if (state.cart.length === 0) {
    cartModalBody.innerHTML = `
      <div style="text-align:center;padding:60px 16px;">
        <div style="font-size:40px;margin-bottom:12px;">🛒</div>
        <h3 style="font-size:1.15rem;font-weight:900;color:var(--text-primary);">Your Cart is Empty</h3>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">
          Add grocery items to compare full checkout totals across Blinkit, Instamart, and BigBasket.
        </p>
      </div>
    `;
    cartModalFooter.innerHTML = `
      <div></div>
      <button class="btn-primary" data-close-modal="cart-modal">Browse Groceries</button>
    `;
    return;
  }

  cartModalBody.innerHTML = `
    <div style="text-align:center;padding:40px 16px;color:var(--text-muted);">
      <div style="font-weight:700;">Simulating checkout across Blinkit, Instamart & BigBasket...</div>
    </div>
  `;

  try {
    const reqPayload = state.cart.map((it) => ({ id: it.product.id, qty: it.quantity }));
    const data: CartComparisonResponse = await compareCart(reqPayload);
    state.cartComparisonData = data;

    renderCartModalContent(data);
  } catch (err) {
    console.error('Error comparing cart:', err);
    cartModalBody.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--color-danger);">
        Failed to calculate cart comparison.
      </div>
    `;
  }
}

function renderCartModalContent(data: CartComparisonResponse) {
  if (!cartModalBody || !cartModalFooter) return;

  const winner = data.single_winner;
  const isWinnerSelected = state.selectedCartStrategy === winner.code;

  cartModalBody.innerHTML = `
    <div>
      <!-- Winner Banner -->
      <div style="background:#ecfdf5;border:2px solid #10b981;border-radius:var(--radius-md);padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <span style="font-size:0.65rem;font-weight:900;background:#059669;color:#ffffff;padding:2px 8px;border-radius:9999px;text-transform:uppercase;">
            Recommended Single Store
          </span>
          <h3 style="font-size:1.2rem;font-weight:900;color:#065f46;margin-top:4px;">
            ${winner.platform} is your cheapest single checkout at ${formatCurrency(winner.total)}
          </h3>
          <div style="font-size:0.75rem;color:#047857;margin-top:2px;">
            You save ${formatCurrency(winner.savings_vs_highest)} compared to the highest competitor and save ${formatCurrency(winner.savings_vs_mrp)} off MRP!
          </div>
        </div>
      </div>

      <!-- 3 Store Comparison Cards -->
      <h4 style="font-size:0.8rem;font-weight:800;color:var(--text-secondary);text-transform:uppercase;margin-bottom:10px;">
        Single-Store Checkout Breakdown
      </h4>
      <div class="cart-stores-grid">
        ${data.ranked_platforms.map((p) => {
          const isSelected = state.selectedCartStrategy === p.code;
          const isWin = p.code === winner.code;
          return `
            <div class="cart-store-card ${isSelected ? 'selected' : ''} ${isWin ? 'is-winner' : ''}" data-strategy="${p.code}">
              ${isWin ? '<span class="store-card-badge">Lowest Bill</span>' : ''}
              <div class="store-card-header">
                <span class="store-card-title">${p.platform}</span>
                <span style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">⏱ ${p.eta}</span>
              </div>
              <div class="store-breakdown-row">
                <span>Items Subtotal:</span>
                <strong>${formatCurrency(p.subtotal)}</strong>
              </div>
              <div class="store-breakdown-row">
                <span>Delivery Fee:</span>
                <span>${p.delivery === 0 ? '<strong style="color:#059669;">FREE</strong>' : formatCurrency(p.delivery)}</span>
              </div>
              <div class="store-breakdown-row">
                <span>Handling Fee:</span>
                <span>${p.handling === 0 ? '₹0.00' : formatCurrency(p.handling)}</span>
              </div>
              <div class="store-breakdown-total">
                <span>Final Total:</span>
                <span style="color:${isWin ? 'var(--color-success)' : 'var(--text-primary)'};">${formatCurrency(p.total)}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Smart Multi-Store Split Option -->
      ${data.smart_split.extra_savings_vs_winner > 0 ? `
        <div class="smart-split-card ${state.selectedCartStrategy === 'split' ? 'selected' : ''}" data-strategy="split">
          <div>
            <div class="smart-split-title">💡 Smart Multi-Store Split (Save Extra ${formatCurrency(data.smart_split.extra_savings_vs_winner)})</div>
            <div class="smart-split-desc">
              Split order items between Blinkit, Instamart, and BigBasket to capture the absolute rock-bottom price on every single line item.
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.25rem;font-weight:900;color:#1e40af;">${formatCurrency(data.smart_split.subtotal)}</div>
            <span style="font-size:0.7rem;font-weight:700;color:#2563eb;">Select Strategy</span>
          </div>
        </div>
      ` : ''}

      <!-- Detailed Items Table -->
      <h4 style="font-size:0.8rem;font-weight:800;color:var(--text-secondary);text-transform:uppercase;margin-bottom:10px;">
        Cart Line-Item Price Comparison
      </h4>
      <table class="compare-table">
        <thead>
          <tr>
            <th>Item & Qty</th>
            <th>Blinkit</th>
            <th>Instamart</th>
            <th>BigBasket</th>
            <th>Cheapest</th>
          </tr>
        </thead>
        <tbody>
          ${data.items_detail.map((it) => `
            <tr>
              <td>
                <div style="font-weight:700;">${it.name}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${it.unit} &bull; Qty: ${it.qty}</div>
              </td>
              <td class="${it.cheapest_platform === 'blinkit' ? 'winner-cell' : ''}">
                ${formatCurrency(it.blinkit.line_total)}
              </td>
              <td class="${it.cheapest_platform === 'instamart' ? 'winner-cell' : ''}">
                ${formatCurrency(it.instamart.line_total)}
              </td>
              <td class="${it.cheapest_platform === 'bigbasket' ? 'winner-cell' : ''}">
                ${formatCurrency(it.bigbasket.line_total)}
              </td>
              <td>
                <span class="best-badge-micro" style="position:static;transform:none;">
                  ${it.cheapest_platform.toUpperCase()}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Select Strategy card clicks
  cartModalBody.querySelectorAll('[data-strategy]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const strat = (e.currentTarget as HTMLElement).getAttribute('data-strategy') as Platform | 'split';
      state.selectedCartStrategy = strat;
      renderCartModalContent(data);
    });
  });

  // Determine current active total
  let activeTotal = 0;
  if (state.selectedCartStrategy === 'split') {
    activeTotal = data.smart_split.subtotal;
  } else {
    const selectedP = data.platforms[state.selectedCartStrategy];
    activeTotal = selectedP ? selectedP.total : winner.total;
  }

  const savings = data.mrp_total > activeTotal ? (data.mrp_total - activeTotal) : 0;

  cartModalFooter.innerHTML = `
    <div>
      <div style="font-size:0.75rem;color:var(--text-muted);">Checkout Strategy:</div>
      <div style="font-size:0.95rem;font-weight:900;color:var(--text-primary);text-transform:uppercase;">
        ${state.selectedCartStrategy === 'split' ? 'Multi-Store Split' : state.selectedCartStrategy} (${formatCurrency(activeTotal)})
      </div>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn-secondary" data-close-modal="cart-modal">Back to Shop</button>
      <button class="btn-primary" id="btn-proceed-checkout" style="background:#059669;">
        Proceed to Checkout (${formatCurrency(activeTotal)})
      </button>
    </div>
  `;

  document.getElementById('btn-proceed-checkout')?.addEventListener('click', () => {
    const totalCount = state.cart.reduce((acc, it) => acc + it.quantity, 0);
    closeModal('cart-modal');
    openCheckoutModal(state.selectedCartStrategy, activeTotal, savings, totalCount);
    state.cart = [];
    saveCartToStorage();
    updateCartUI();
  });
}

// Step 11: MODAL 3 - Python Data Analysis Dashboard
async function openAnalyticsModal() {
  if (!analyticsModal || !analyticsModalBody) return;
  analyticsModal.classList.add('active');

  analyticsModalBody.innerHTML = `
    <div style="text-align:center;padding:48px 16px;color:var(--text-muted);">
      <div style="font-weight:700;font-size:0.95rem;">Executing Python statistical analysis on grocery database...</div>
    </div>
  `;

  try {
    const data: PythonAnalysisData = await fetchPythonDataAnalysis(state.selectedCity);
    renderAnalyticsModalContent(data);
  } catch (err) {
    console.error('Error fetching Python analysis data:', err);
    analyticsModalBody.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--color-danger);">
        Failed to load Python analysis data.
      </div>
    `;
  }
}

function renderAnalyticsModalContent(data: PythonAnalysisData) {
  if (!analyticsModalBody) return;

  analyticsModalBody.innerHTML = `
    <div>
      <!-- Analytics Navigation Tabs -->
      <div class="analysis-tabs">
        <button class="analysis-tab-btn ${state.activeAnalyticsTab === 'overview' ? 'active' : ''}" data-tab="overview">
          📊 Market Insights & Win Rates
        </button>
        <button class="analysis-tab-btn ${state.activeAnalyticsTab === 'stats' ? 'active' : ''}" data-tab="stats">
          📈 Descriptive Statistics (Python)
        </button>
        <button class="analysis-tab-btn ${state.activeAnalyticsTab === 'cities' ? 'active' : ''}" data-tab="cities">
          📍 South India Cities Comparison
        </button>
        <button class="analysis-tab-btn ${state.activeAnalyticsTab === 'code' ? 'active' : ''}" data-tab="code">
          🐍 Python Analysis Source Script
        </button>
      </div>

      <!-- Tab 1: Overview -->
      <div id="tab-content-overview" style="display:${state.activeAnalyticsTab === 'overview' ? 'block' : 'none'};">
        <div class="analysis-kpi-grid">
          <div class="analysis-kpi-card">
            <div class="analysis-kpi-label">Catalog Products Analyzed</div>
            <div class="analysis-kpi-value">${data.total_items.toLocaleString()}</div>
            <div class="analysis-kpi-sub">Across South Indian hubs</div>
          </div>
          <div class="analysis-kpi-card">
            <div class="analysis-kpi-label">Total Consumer Savings Pool</div>
            <div class="analysis-kpi-value" style="color:var(--color-success);">${formatCurrency(data.total_savings_pool)}</div>
            <div class="analysis-kpi-sub">Realizable arbitrage</div>
          </div>
          <div class="analysis-kpi-card">
            <div class="analysis-kpi-label">Regional Location</div>
            <div class="analysis-kpi-value" style="font-size:1.15rem;">${data.selected_city}</div>
            <div class="analysis-kpi-sub">10 Urban dark-stores</div>
          </div>
          <div class="analysis-kpi-card">
            <div class="analysis-kpi-label">Average Spread / Item</div>
            <div class="analysis-kpi-value">${formatCurrency(data.descriptive_stats?.savings?.mean || 0)}</div>
            <div class="analysis-kpi-sub">Price variance index</div>
          </div>
        </div>

        <!-- Store Win Rates Progress Bars -->
        <div style="background:#ffffff;border:1px solid var(--border-light);border-radius:var(--radius-md);padding:16px;margin-bottom:18px;">
          <h4 style="font-size:0.85rem;font-weight:800;color:var(--text-primary);text-transform:uppercase;margin-bottom:14px;">
            Store Competitiveness (% of Catalog Won)
          </h4>
          
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;font-weight:700;margin-bottom:4px;">
              <span>BigBasket (Cheapest on ${data.win_rates.bigbasket.count.toLocaleString()} items)</span>
              <span style="color:var(--color-success);">${data.win_rates.bigbasket.percent}%</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill green" style="width:${data.win_rates.bigbasket.percent}%;"></div>
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;font-weight:700;margin-bottom:4px;">
              <span>Blinkit (Cheapest on ${data.win_rates.blinkit.count.toLocaleString()} items)</span>
              <span style="color:#d97706;">${data.win_rates.blinkit.percent}%</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill yellow" style="width:${data.win_rates.blinkit.percent}%;"></div>
            </div>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;font-weight:700;margin-bottom:4px;">
              <span>Swiggy Instamart (Cheapest on ${data.win_rates.instamart.count.toLocaleString()} items)</span>
              <span style="color:#ea580c;">${data.win_rates.instamart.percent}%</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill orange" style="width:${data.win_rates.instamart.percent}%;"></div>
            </div>
          </div>
        </div>

        <!-- Highest Savings Products -->
        <h4 style="font-size:0.85rem;font-weight:800;color:var(--text-primary);text-transform:uppercase;margin-bottom:12px;">
          Top Grocery Arbitrage Items
        </h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:10px;">
          ${data.top_savings_products.map((p) => `
            <div style="background:#f8fafc;border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:10px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" class="top-deal-item" data-id="${p.id}">
              <div>
                <div style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${p.name}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${p.unit} &bull; Best on ${p.cheapest_platform.toUpperCase()}</div>
              </div>
              <span style="font-size:0.78rem;font-weight:800;background:#ecfdf5;color:#065f46;padding:3px 8px;border-radius:6px;">
                Save ₹${p.max_savings.toFixed(0)}
              </span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Tab 2: Descriptive Statistics (Python statistics module) -->
      <div id="tab-content-stats" style="display:${state.activeAnalyticsTab === 'stats' ? 'block' : 'none'};">
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:14px;">
          The following parameters are computed dynamically by the Python backend using standard statistical methods (Mean, Median, Standard Deviation, Variance, Q1, Q3, and IQR):
        </p>

        <table class="stats-table">
          <thead>
            <tr>
              <th>Variable / Metric</th>
              <th>Mean (₹)</th>
              <th>Median (₹)</th>
              <th>Std Dev (σ)</th>
              <th>Min (₹)</th>
              <th>Max (₹)</th>
              <th>Q1 (25th %)</th>
              <th>Q3 (75th %)</th>
              <th>IQR</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(data.descriptive_stats || {}).map(([key, stat]) => `
              <tr>
                <td><strong>${stat.metric_name}</strong></td>
                <td>${stat.mean.toFixed(2)}</td>
                <td>${stat.median.toFixed(2)}</td>
                <td>${stat.std_dev.toFixed(2)}</td>
                <td>${stat.min.toFixed(2)}</td>
                <td>${stat.max.toFixed(2)}</td>
                <td>${stat.q1.toFixed(2)}</td>
                <td>${stat.q3.toFixed(2)}</td>
                <td>${stat.iqr.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Category Price Elasticity -->
        <h4 style="font-size:0.85rem;font-weight:800;color:var(--text-primary);text-transform:uppercase;margin:18px 0 10px;">
          Category-Wise Savings & Price Elasticity
        </h4>
        <table class="stats-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Products</th>
              <th>Avg MRP</th>
              <th>Avg Best Price</th>
              <th>Avg Savings (₹)</th>
              <th>Discount %</th>
            </tr>
          </thead>
          <tbody>
            ${data.category_breakdown.map((c) => `
              <tr>
                <td><strong>${c.category}</strong></td>
                <td>${c.item_count}</td>
                <td>₹${c.avg_mrp.toFixed(2)}</td>
                <td style="color:var(--color-success);font-weight:700;">₹${c.avg_best_price.toFixed(2)}</td>
                <td>₹${c.avg_savings.toFixed(2)}</td>
                <td><span style="background:#ecfdf5;color:#065f46;padding:2px 6px;border-radius:4px;font-weight:700;">${c.avg_discount_pct}%</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Tab 3: South India City Disparity -->
      <div id="tab-content-cities" style="display:${state.activeAnalyticsTab === 'cities' ? 'block' : 'none'};">
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:14px;">
          Comparative analysis across 10 South Indian urban delivery clusters showing regional price disparities and delivery win rates:
        </p>

        <table class="stats-table">
          <thead>
            <tr>
              <th>City</th>
              <th>Catalog Items</th>
              <th>Avg Blinkit</th>
              <th>Avg Instamart</th>
              <th>Avg BigBasket</th>
              <th>Avg Savings (₹)</th>
              <th>Blinkit Win %</th>
              <th>Instamart Win %</th>
              <th>BigBasket Win %</th>
            </tr>
          </thead>
          <tbody>
            ${data.city_comparison.map((city) => `
              <tr>
                <td><strong>📍 ${city.city}</strong></td>
                <td>${city.total_products}</td>
                <td>₹${city.avg_blinkit.toFixed(2)}</td>
                <td>₹${city.avg_instamart.toFixed(2)}</td>
                <td>₹${city.avg_bigbasket.toFixed(2)}</td>
                <td style="color:var(--color-success);font-weight:700;">₹${city.avg_savings_rs.toFixed(2)} (${city.avg_savings_percent}%)</td>
                <td>${city.blinkit_win_rate}%</td>
                <td>${city.instamart_win_rate}%</td>
                <td>${city.bigbasket_win_rate}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Tab 4: Python Source Script -->
      <div id="tab-content-code" style="display:${state.activeAnalyticsTab === 'code' ? 'block' : 'none'};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <p style="font-size:0.8rem;color:var(--text-secondary);">
            Beginner-friendly Python script used for computing descriptive statistics and grocery price comparison:
          </p>
          <button class="btn-copy-code" id="btn-copy-py-code">📋 Copy Python Code</button>
        </div>

        <div class="python-code-card">
          <div class="python-code-header">
            <span class="python-code-title">🐍 backend/analytics.py</span>
            <span style="font-size:0.7rem;color:#94a3b8;">Python 3.10+ (SQLite & pandas)</span>
          </div>
          <div class="python-code-body" id="py-code-content">${escapeHtml(data.python_script)}</div>
        </div>
      </div>
    </div>
  `;

  // Tab switching handlers
  analyticsModalBody.querySelectorAll('.analysis-tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as any;
      state.activeAnalyticsTab = tab;
      renderAnalyticsModalContent(data);
    });
  });

  // Top deal item clicks
  analyticsModalBody.querySelectorAll('.top-deal-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).getAttribute('data-id'));
      const product = data.top_savings_products.find((it) => it.id === id);
      if (product) {
        closeModal('analytics-modal');
        openCompareModal(product);
      }
    });
  });

  // Copy python script button
  document.getElementById('btn-copy-py-code')?.addEventListener('click', () => {
    navigator.clipboard.writeText(data.python_script).then(() => {
      const btn = document.getElementById('btn-copy-py-code');
      if (btn) {
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy Python Code'; }, 2000);
      }
    });
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Step 12: MODAL 4 - Checkout Modal
function openCheckoutModal(platform: Platform | 'split', total: number, savings: number, count: number) {
  if (!checkoutModal || !checkoutModalBody) return;
  const storeLabel = platform === 'split' ? 'Multi-Store Split' : platform.toUpperCase();

  checkoutModalBody.innerHTML = `
    <div style="text-align:center;padding:20px 8px;">
      <div style="width:60px;height:60px;background:#ecfdf5;color:#059669;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px;">
        ✓
      </div>
      <span style="font-size:0.75rem;font-weight:800;color:#065f46;background:#ecfdf5;padding:4px 12px;border-radius:9999px;border:1px solid #a7f3d0;text-transform:uppercase;">
        Order Placed Successfully
      </span>
      <h3 style="font-size:1.4rem;font-weight:900;color:var(--text-primary);margin-top:10px;">
        Checked Out via ${storeLabel}
      </h3>
      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:6px;">
        QuickX simulated and routed your grocery cart to the lowest expenditure option in ${state.selectedCity}.
      </p>

      <div style="background:#f8fafc;border:1px solid var(--border-light);border-radius:var(--radius-md);padding:16px;margin:20px 0;text-align:left;">
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px;">
          <span>Items in Order:</span>
          <strong style="color:var(--text-primary);">${count} items</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px;">
          <span>Store Strategy:</span>
          <strong style="color:var(--text-primary);">${storeLabel}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px;">
          <span>Estimated Delivery:</span>
          <strong style="color:var(--text-primary);">⚡ 10-20 mins</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:1.15rem;font-weight:900;color:var(--text-primary);border-top:1px solid var(--border-light);padding-top:8px;margin-top:8px;">
          <span>Total Paid:</span>
          <span style="color:var(--color-success);">${formatCurrency(total)}</span>
        </div>
        ${savings > 0 ? `
          <div style="background:#ecfdf5;color:#065f46;padding:6px 10px;border-radius:var(--radius-sm);font-size:0.75rem;font-weight:700;margin-top:8px;display:flex;justify-content:space-between;">
            <span>Realized Price Savings:</span>
            <span>${formatCurrency(savings)}</span>
          </div>
        ` : ''}
      </div>

      <button class="btn-primary" style="width:100%;padding:12px;font-size:0.85rem;" data-close-modal="checkout-modal">
        Done & Start New Comparison
      </button>
    </div>
  `;

  checkoutModal.querySelectorAll('[data-close-modal="checkout-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal('checkout-modal'));
  });

  checkoutModal.classList.add('active');
}

function closeModal(modalId: string) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
