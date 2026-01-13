// Mzanzi Eats Frontend - Connects to Google Sheets via Web App
class MzanziEats {
  constructor() {
    // Your live Web App URL (from Google Apps Script)
    this.apiUrl = 'https://script.google.com/macros/s/AKfycbxNID64ZKFb7OmRmQT-ORrzgUKq24Kr4z5hJuPTnxaGQBn7gvW-zNyCmGUrOTg-G27M/exec';
    this.stores = [];
    this.currentStore = null;
    this.cart = [];
  }

  // Fetch all stores from Google Sheets
  async fetchStores() {
    try {
      const response = await fetch(`${this.apiUrl}?action=stores`);
      const data = await response.json();
      if (data.success) {
        this.stores = data.data;
        this.renderStoreGrid();
      } else {
        throw new Error('Failed to load stores');
      }
    } catch (error) {
      console.error('Error loading stores:', error);
      document.getElementById('store-grid').innerHTML = `<div class="col-12 text-center py-5"><p class="text-danger">Unable to load kitchens. Please try again later.</p></div>`;
    }
  }

  // Fetch menu for a specific store
  async fetchMenu(storeId) {
    try {
      const response = await fetch(`${this.apiUrl}?action=menu&storeId=${storeId}`);
      const data = await response.json();
      if (data.success) {
        this.menuItems = data.data;
        this.currentStore = this.stores.find(s => s.Store_ID === storeId);
        this.applyStoreTheme();
        this.renderMenu();
      } else {
        throw new Error('Menu not found');
      }
    } catch (error) {
      console.error('Error loading menu:', error);
      alert('Failed to load menu. Please try again.');
    }
  }

  // Render store grid on homepage
  renderStoreGrid() {
    const container = document.getElementById('store-grid');
    if (!container) return;

    if (this.stores.length === 0) {
      container.innerHTML = `<div class="col-12 text-center py-5"><p class="text-muted">No kitchens available in this area yet.</p></div>`;
      return;
    }

    let html = '';
    this.stores.forEach(store => {
      html += `
        <div class="col-6 col-md-3">
          <div class="card store-card h-100 shadow-sm border-0 position-relative">
            <span class="category-badge">${store.Category || 'Local Kitchen'}</span>
            <img src="${store.Banner_URL || 'assets/images/image.webp'}" 
                 class="card-img-top" style="height:160px; object-fit:cover;">
            <div class="card-body p-3">
              <h5 class="fw-bold mb-1">${store.Name}</h5>
              <p class="small text-muted mb-3">${store.Area}</p>
              <a href="store-view.html?storeId=${store.Store_ID}" 
                 class="btn btn-dark w-100 rounded-pill">View Menu</a>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  // Apply store-specific theme
  applyStoreTheme() {
    if (!this.currentStore) return;

    // Set hero background
    const hero = document.querySelector('.hero');
    if (hero) {
      const bgImg = this.currentStore.Hero_Image_URL || 'assets/images/image.webp';
      hero.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('${bgImg}')`;
    }

    // Update slogan
    const sloganEl = document.getElementById('store-slogan');
    if (sloganEl && this.currentStore.Slogan) {
      sloganEl.textContent = this.currentStore.Slogan;
    }

    // Set primary color
    const primaryColor = this.currentStore.Primary_Color || '#ff0000';
    document.documentElement.style.setProperty('--brand-red', primaryColor);

    // Update WhatsApp number for cart
    document.body.dataset.waNumber = this.currentStore.Whatsapp || this.currentStore.WhatsApp || '27726515909';
  }

  // Render menu items
  renderMenu() {
    const container = document.querySelector('.row.g-4');
    if (!container) return;

    let html = '';
    this.menuItems.forEach(item => {
      html += `
        <div class="col-6 col-md-3">
          <div class="menu-item bg-white rounded-3 shadow-sm p-3 text-center h-100"
               data-id="${item.Item_ID}"
               data-name="${item.Item_Name}"
               data-price="${item.Price}">
            <img src="${item.Image_URL || 'assets/images/image.webp'}" 
                 class="w-100 rounded mb-2" style="height:140px; object-fit:cover;">
            <h6 class="fw-bold">${item.Item_Name}</h6>
            <p class="text-danger fw-bold fs-5">R${item.Price}</p>
            <button class="btn btn-danger btn-sm w-100 btn-add">➕ Add to Cart</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;

    // Rebind cart buttons
    this.bindCartButtons();
  }

  // Bind "Add to Cart" buttons
  bindCartButtons() {
    document.querySelectorAll('.btn-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.menu-item');
        const id = item.dataset.id;
        const name = item.dataset.name;
        const price = parseFloat(item.dataset.price);

        const existing = this.cart.find(i => i.id === id);
        if (existing) {
          existing.qty++;
        } else {
          this.cart.push({ id, name, price, qty: 1 });
        }
        this.updateCartUI();
      });
    });
  }

  // Update cart UI
  updateCartUI() {
    const count = this.cart.reduce((s, i) => s + i.qty, 0);
    const total = this.cart.reduce((s, i) => s + i.price * i.qty, 0);

    const countEl = document.getElementById('cart-count');
    const totalEl = document.getElementById('cart-total');
    const waBtn = document.getElementById('wa-order-btn');

    if (countEl) countEl.textContent = count;
    if (totalEl) totalEl.textContent = `R${total.toFixed(2)}`;

    if (waBtn) {
      if (count > 0) {
        waBtn.classList.remove('disabled');
        waBtn.onclick = () => this.handleCheckout();
      } else {
        waBtn.classList.add('disabled');
        waBtn.onclick = null;
      }
    }
  }

  // Handle checkout flow
  handleCheckout() {
    // In future: show delivery options modal
    // For now: proceed directly to WhatsApp
    this.sendOrderToWhatsApp();
  }

  // Send order to WhatsApp + log to Sheets
  sendOrderToWhatsApp() {
    const count = this.cart.reduce((s, i) => s + i.qty, 0);
    if (count === 0) return;

    const lines = this.cart.map(i => `- ${i.name} x${i.qty} (R${(i.price * i.qty).toFixed(2)})`);
    const total = this.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const msg = `Hi! I'd like to place an order:\n${lines.join('\n')}\nTotal: R${total.toFixed(2)}`;
    
    const waNumber = document.body.dataset.waNumber;
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;

    // Log order to Google Sheets
    this.logOrder({
      Store_ID: this.currentStore.Store_ID,
      Items: lines.join(', '),
      Total_Price: total,
      Customer_WA: waNumber,
      Delivery_Type: 'Collection' // Will be dynamic later
    });

    // Open WhatsApp
    window.open(waUrl, '_blank');
  }

  // Log order to Google Sheets
  async logOrder(orderData) {
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          data: {
            Order_ID: 'MZ' + Date.now().toString(36),
            ...orderData
          }
        })
      });
    } catch (error) {
      console.warn('Failed to log order (non-critical):', error);
    }
  }

  // Log unmet search to heatmap
  async logHeatmap(searchTerm) {
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'heatmap',
          data: { Search_Term: searchTerm }
        })
      });
    } catch (error) {
      console.warn('Failed to log heatmap (non-critical):', error);
    }
  }

  // Main init function
  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('storeId');

    if (storeId) {
      // Store page
      this.fetchMenu(storeId);
    } else {
      // Homepage
      this.setupHomepage();
    }
  }

  // Setup homepage behavior
  setupHomepage() {
    const searchInput = document.getElementById('location-search');
    const orderBtn = document.getElementById('order-now');
    const scheduleBtn = document.getElementById('schedule-delivery');

    const handleSearch = (action) => {
      const area = searchInput?.value.trim();
      if (!area) {
        alert('Please enter your area.');
        return;
      }

      // Normalize and check aliases
      const normalized = area.toLowerCase();
      const matchedStore = this.stores.find(store => {
        const aliases = (store.Location_Aliases || '').toLowerCase().split(',');
        return aliases.includes(normalized) || store.Area.toLowerCase() === normalized;
      });

      if (matchedStore) {
        // Redirect to township page (show all stores in that township)
        const townshipCode = matchedStore.Township_Code;
        const townshipStores = this.stores.filter(s => s.Township_Code === townshipCode);
        this.showTownshipStores(townshipStores);
      } else {
        // Log to heatmap
        this.logHeatmap(area);
        // Show "Coming soon"
        const resultDiv = document.getElementById('result-message');
        if (resultDiv) {
          resultDiv.textContent = `Coming soon to ${area}!`;
          resultDiv.className = 'coming-soon';
          resultDiv.style.display = 'block';
        }
      }
    };

    if (searchInput) {
      searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch('now');
      });
    }
    if (orderBtn) orderBtn.addEventListener('click', () => handleSearch('now'));
    if (scheduleBtn) scheduleBtn.addEventListener('click', () => handleSearch('schedule'));

    // Load stores
    this.fetchStores();
  }

  // Show stores for a township
  showTownshipStores(stores) {
    const container = document.getElementById('store-grid');
    if (!container) return;

    let html = '';
    stores.forEach(store => {
      html += `
        <div class="col-6 col-md-3">
          <div class="card store-card h-100 shadow-sm border-0 position-relative">
            <span class="category-badge">${store.Category || 'Local Kitchen'}</span>
            <img src="${store.Banner_URL || 'assets/images/image.webp'}" 
                 class="card-img-top" style="height:160px; object-fit:cover;">
            <div class="card-body p-3">
              <h5 class="fw-bold mb-1">${store.Name}</h5>
              <p class="small text-muted mb-3">${store.Area}</p>
              <a href="store-view.html?storeId=${store.Store_ID}" 
                 class="btn btn-dark w-100 rounded-pill">View Menu</a>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.mzanziEats = new MzanziEats();
  window.mzanziEats.init();
});