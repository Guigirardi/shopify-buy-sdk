(function(window, document) {
  'use strict';

  if (window.ShopifyBuySDK && window.ShopifyBuySDK.__loaded) {
    return;
  }

  // ================== HELPERS ==================
  const CURRENCY_SYMBOLS = {
    USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'¥',
    BRL:'R$', CAD:'CA$', AUD:'A$', CHF:'CHF',
    INR:'₹', MXN:'MX$', RUB:'₽', KRW:'₩',
    AED:'د.إ', SAR:'﷼'
  };

  function formatPrice(amount, currencyCode) {
    if (amount === undefined || amount === null) return '';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '';
    const symbol = CURRENCY_SYMBOLS[currencyCode] || '';
    return symbol + num.toFixed(2);
  }

  function getCart() {
    try {
      const data = localStorage.getItem('shopify_buy_cart_v1');
      return data ? JSON.parse(data) : { items: [] };
    } catch (e) {
      return { items: [] };
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem('shopify_buy_cart_v1', JSON.stringify(cart));
    } catch (e) {}
    ShopifyBuySDK.updateAllDrawers();
  }

  // ================== CORE SDK ==================
  const ShopifyBuySDK = {
    __loaded: true,
    instances: {},
    floatingCart: null,

    init: function(containerId, config) {
      if (!containerId || !config) {
        console.error('[ShopifyBuySDK] Missing containerId or config');
        return;
      }

      if (this.instances[containerId]) {
        console.warn('[ShopifyBuySDK] Instance already initialized for', containerId);
        return;
      }

      const container = document.getElementById(containerId);
      if (!container) {
        console.warn('[ShopifyBuySDK] Container not found:', containerId);
        return;
      }

      const instance = new BuyButtonInstance(containerId, container, config);
      this.instances[containerId] = instance;
      instance.render();

      if (config.customizationExtension && typeof config.customizationExtension === 'function') {
        try {
          config.customizationExtension({ ShopifyBuySDK, instance, config });
        } catch (e) {
          console.warn('[ShopifyBuySDK] customizationExtension error:', e);
        }
      }
    },

    getCart,
    saveCart,

    updateAllDrawers: function() {
      Object.values(this.instances).forEach(inst => {
        if (inst.drawer && typeof inst.drawer.updateContent === 'function') {
          inst.drawer.updateContent();
        }
      });
      if (this.floatingCart && typeof this.floatingCart.updateBadge === 'function') {
        this.floatingCart.updateBadge();
      }
    }
  };

  // ================== BUY BUTTON INSTANCE ==================
  class BuyButtonInstance {
    constructor(containerId, container, config) {
      this.containerId = containerId;
      this.container = container;
      this.config = config;
      this.variantSelect = null;
      this.drawer = null;
    }

    render() {
      const product = this.config.product || {};
      const variants = product.variants || [];
      const alignment = (this.config.button && this.config.button.alignment) || 'center';

      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.alignItems =
        alignment === 'left' ? 'flex-start' :
        alignment === 'right' ? 'flex-end' : 'center';

      if (variants.length > 1) {
        const select = document.createElement('select');
        select.className = 'shopify-variant-select';
        variants.forEach((variant, i) => {
          const opt = document.createElement('option');
          opt.value = i;
          opt.textContent = variant.title || `Variant ${i + 1}`;
          select.appendChild(opt);
        });
        this.container.appendChild(select);
        this.variantSelect = select;
      }

      const btnCfg = this.config.button || {};
      const button = document.createElement('button');
      button.className = 'shopify-buy-button';
      button.textContent = btnCfg.text || 'ADD TO CART';

      const width = btnCfg.width || 320;
      button.style.cssText = `
        background-color:${btnCfg.color || '#000'};
        color:${btnCfg.textColor || '#fff'};
        border:none;
        border-radius:${btnCfg.radius || 6}px;
        padding:0 32px;
        font-size:${btnCfg.fontSize || 15}px;
        font-weight:600;
        cursor:pointer;
        transition:all .2s;
        width:${width}px;
        height:${btnCfg.height || 48}px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-transform:uppercase;
        letter-spacing:.5px;
        font-family:${btnCfg.font || 'inherit'};
      `;

      button.addEventListener('mouseenter', () => {
        button.style.opacity = '0.9';
        button.style.transform = 'translateY(-1px)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.opacity = '1';
        button.style.transform = 'translateY(0)';
      });
      button.addEventListener('click', () => this.handleAddToCart());

      if (this.variantSelect) {
        this.variantSelect.style.width = width + 'px';
      }

      this.container.appendChild(button);

      // Drawer global (uma vez só)
      if (!document.getElementById('shopify-cart-drawer')) {
        this.drawer = new CartDrawer(this.config);
      } else {
        this.drawer = { updateContent: () => {} };
      }

      // Floating cart global
      if (!document.getElementById('shopify-floating-cart')) {
        ShopifyBuySDK.floatingCart = new FloatingCartButton(this.config);
      }
    }

    getSelectedVariant() {
      const product = this.config.product || {};
      const variants = product.variants || [];
      if (!variants.length) return null;

      if (this.variantSelect) {
        const idx = this.variantSelect.selectedIndex;
        return variants[idx] || variants[0];
      }
      return variants[0];
    }

    handleAddToCart() {
      const product = this.config.product || {};
      const variant = this.getSelectedVariant();
      if (!variant) {
        alert('Product variant not available');
        return;
      }

      const cart = ShopifyBuySDK.getCart();
      const existingIndex = cart.items.findIndex(i => i.variantId === variant.id);

      const baseItem = {
        variantId: variant.id,
        productTitle: product.title || 'Product',
        variantTitle: variant.title || 'Default',
        image: product.image || '',
        price: variant.price,
        quantity: 1,
        selectedOptions: variant.selectedOptions || []
      };

      if (existingIndex >= 0) {
        cart.items[existingIndex].quantity += 1;
      } else {
        cart.items.push(baseItem);
      }

      ShopifyBuySDK.saveCart(cart);

      const drawer = document.getElementById('shopify-cart-drawer');
      const overlay = document.getElementById('shopify-cart-overlay');
      if (drawer) drawer.classList.add('open');
      if (overlay) overlay.classList.add('open');
    }
  }

  // ================== CART DRAWER (COM UPSELL) ==================
  class CartDrawer {
    constructor(config) {
      this.config = config || {};
      this.render();
    }

    render() {
      const cfg = this.config.cart || {};

      const overlay = document.createElement('div');
      overlay.id = 'shopify-cart-overlay';
      overlay.className = 'shopify-cart-overlay';
      overlay.addEventListener('click', () => this.close());

      const drawer = document.createElement('div');
      drawer.id = 'shopify-cart-drawer';
      drawer.className = 'shopify-cart-drawer';

      drawer.innerHTML = `
        <div class="drawer-header">
          <h3>${cfg.title || 'Cart'}</h3>
          <button class="drawer-close" aria-label="Close cart">&times;</button>
        </div>
        <div class="drawer-content">
          <div id="cart-items"></div>
        </div>
        <div class="drawer-footer">
          <div class="cart-subtotal">
            <span>${cfg.subtotal || 'SUBTOTAL'}</span>
            <span id="cart-total">$0.00</span>
          </div>
          ${cfg.showShippingNotice !== false ? `
            <p class="cart-notice">
              ${cfg.shippingNotice || 'Shipping and taxes calculated at checkout'}
            </p>` : ''}
          <button class="checkout-button">${cfg.checkout || 'Checkout'}</button>
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(drawer);

      drawer.querySelector('.drawer-close')
        .addEventListener('click', () => this.close());
      drawer.querySelector('.checkout-button')
        .addEventListener('click', () => this.handleCheckout());

      this.updateContent();
    }

    buildUpsellsHtml() {
      const cfg = this.config;
      const upsells = cfg.upsells || [];
      if (!upsells.length) return '';

      const title = cfg.upsellSectionTitle || 'Frequently bought together';

      const itemsHtml = upsells.map((u, idx) => {
        const p = u.product || {};
        const img =
          u.customImage ||
          (p.images && p.images.edges && p.images.edges[0] && p.images.edges[0].node && p.images.edges[0].node.url) ||
          '';
        const variantsEdges = (p.variants && p.variants.edges) || [];
        const vNode = variantsEdges[0] && variantsEdges[0].node;
        if (!vNode) return '';

        const price = vNode.price || p.price || { amount: '0.00', currencyCode: 'USD' };
        const map = {
          variantId: vNode.id,
          title: u.customTitle || p.title || 'Product',
          image: img,
          price: price,
          selectedOptions: vNode.selectedOptions || []
        };

        const encoded = encodeURIComponent(JSON.stringify(map));

        return `
          <div class="upsell-product">
            <img src="${img}" alt="${map.title}">
            <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
              <div style="font-size:13px;font-weight:500;">${map.title}</div>
              <div style="font-size:13px;font-weight:600;">${formatPrice(price.amount, price.currencyCode)}</div>
            </div>
            <button class="upsell-btn"
              style="background:${u.buttonBgColor || '#000'};color:${u.buttonTextColor || '#fff'}"
              onclick="window.addUpsellToCart(event, decodeURIComponent(this.dataset.map))"
              data-map="${encoded}">+
            </button>
          </div>
        `;
      }).join('');

      if (!itemsHtml.trim()) return '';
      return `
        <div class="cart-upsell">
          <h4>${title}</h4>
          ${itemsHtml}
        </div>
      `;
    }

    updateContent() {
      const cart = ShopifyBuySDK.getCart();
      const itemsContainer = document.getElementById('cart-items');
      const totalElement = document.getElementById('cart-total');
      if (!itemsContainer || !totalElement) return;

      if (!cart.items.length) {
        itemsContainer.innerHTML = `
          <div class="cart-empty">
            <p>${(this.config.cart && this.config.cart.empty) || 'Your cart is empty'}</p>
          </div>
        `;
        totalElement.textContent = '$0.00';
        return;
      }

      let total = 0;
      let currencyCode = 'USD';

      const itemsHtml = cart.items.map((item, index) => {
        const priceAmount = item.price?.amount || item.price;
        const lineTotal = (parseFloat(priceAmount) || 0) * item.quantity;
        total += lineTotal;
        currencyCode = item.price?.currencyCode || currencyCode;

        const variantText = (item.selectedOptions || [])
          .map(o => o.value)
          .join(' / ') || item.variantTitle || '';

        return `
          <div class="cart-item" data-index="${index}">
            <img src="${item.image || ''}" alt="${item.productTitle || ''}" class="cart-item-image" />
            <div class="cart-item-details">
              <h4>${item.productTitle || ''}</h4>
              <p class="cart-item-variant">${variantText}</p>
              <div class="cart-item-controls">
                <button class="qty-btn" data-action="decrease" data-index="${index}">−</button>
                <span class="qty-display">${item.quantity}</span>
                <button class="qty-btn" data-action="increase" data-index="${index}">+</button>
              </div>
            </div>
            <div class="cart-item-price">
              <button class="remove-btn" data-index="${index}">×</button>
              <span class="price">${formatPrice(lineTotal, currencyCode)}</span>
            </div>
          </div>
        `;
      }).join('');

      const upsellsHtml = this.buildUpsellsHtml();
      const pos = this.config.upsellPosition || 'after_items';

      itemsContainer.innerHTML =
        pos === 'before_items'
          ? upsellsHtml + itemsHtml
          : itemsHtml + upsellsHtml;

      totalElement.textContent = formatPrice(total, currencyCode);

      itemsContainer.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const idx = parseInt(e.currentTarget.dataset.index, 10);
          const action = e.currentTarget.dataset.action;
          this.updateQuantity(idx, action);
        });
      });

      itemsContainer.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const idx = parseInt(e.currentTarget.dataset.index, 10);
          this.removeItem(idx);
        });
      });
    }

    updateQuantity(index, action) {
      const cart = ShopifyBuySDK.getCart();
      const item = cart.items[index];
      if (!item) return;

      if (action === 'increase') {
        item.quantity += 1;
      } else if (action === 'decrease') {
        item.quantity -= 1;
        if (item.quantity <= 0) {
          cart.items.splice(index, 1);
        }
      }
      ShopifyBuySDK.saveCart(cart);
    }

    removeItem(index) {
      const cart = ShopifyBuySDK.getCart();
      cart.items.splice(index, 1);
      ShopifyBuySDK.saveCart(cart);
    }

    async handleCheckout() {
      const cart = ShopifyBuySDK.getCart();
      if (!cart.items.length) {
        alert('Your cart is empty');
        return;
      }

      const cfg = this.config;
      const btn = document.querySelector('.checkout-button');
      if (btn) {
        btn.disabled = true;
        btn.textContent = (cfg.cart && cfg.cart.processing) || 'Processing...';
      }

      try {
        const lines = cart.items.map(item => ({
          quantity: item.quantity,
          merchandiseId: item.variantId
        }));

        const mutation = `
          mutation cartCreate($input: CartInput!) {
            cartCreate(input: $input) {
              cart { id checkoutUrl }
              userErrors { field message }
            }
          }
        `;

        const res = await fetch(`https://${cfg.domain}/api/${cfg.apiVersion}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type':'application/json',
            'X-Shopify-Storefront-Access-Token': cfg.storefrontAccessToken
          },
          body: JSON.stringify({ query: mutation, variables: { input: { lines } } })
        });

        const data = await res.json();
        const errors = data?.data?.cartCreate?.userErrors;
        if (errors && errors.length) {
          throw new Error(errors.map(e => e.message).join(', '));
        }

        const checkoutUrl = data?.data?.cartCreate?.cart?.checkoutUrl;
        if (!checkoutUrl) throw new Error('No checkout URL returned');

        const url = new URL(checkoutUrl);
        url.searchParams.set('channel', 'online_store');
        window.location.href = url.toString();
      } catch (e) {
        console.error('[ShopifyBuySDK] Checkout error:', e);
        alert('Failed to create checkout. Please try again.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = (cfg.cart && cfg.cart.checkout) || 'Checkout';
        }
      }
    }

    close() {
      const drawer = document.getElementById('shopify-cart-drawer');
      const overlay = document.getElementById('shopify-cart-overlay');
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
    }
  }

  // ================== FLOATING CART BUTTON ==================
  class FloatingCartButton {
    constructor(config) {
      this.config = config || {};
      this.render();
      this.updateBadge();
    }

    render() {
      const btnCfg = this.config.floatingCart || {};
      const button = document.createElement('button');
      button.id = 'shopify-floating-cart';
      button.className = 'shopify-floating-cart';
      button.setAttribute('aria-label', 'Open cart');

      button.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        <span class="cart-badge" id="cart-badge">0</span>
      `;

      button.style.backgroundColor = btnCfg.bgColor || '#282525';

      button.addEventListener('click', () => {
        const drawer = document.getElementById('shopify-cart-drawer');
        const overlay = document.getElementById('shopify-cart-overlay');
        if (drawer) drawer.classList.add('open');
        if (overlay) overlay.classList.add('open');
      });

      document.body.appendChild(button);
    }

    updateBadge() {
      const cart = ShopifyBuySDK.getCart();
      const totalItems = cart.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
      const badge = document.getElementById('cart-badge');
      const button = document.getElementById('shopify-floating-cart');

      if (badge) {
        badge.textContent = totalItems;
        badge.style.display = totalItems > 0 ? 'flex' : 'none';
      }
      if (button) {
        button.style.display = totalItems > 0 ? 'flex' : 'none';
      }
    }
  }

  // ================== UPSELL HANDLER ==================
  window.addUpsellToCart = function(event, mapStr) {
    if (!mapStr) return;
    let map;
    try {
      map = JSON.parse(mapStr);
    } catch (e) {
      try { map = JSON.parse(decodeURIComponent(mapStr)); } catch (e2) { return; }
    }
    if (!map || !map.variantId) return;

    const cart = ShopifyBuySDK.getCart();
    const existing = cart.items.find(i => i.variantId === map.variantId);

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.items.push({
        variantId: map.variantId,
        productTitle: map.title || 'Product',
        variantTitle: (map.selectedOptions || []).map(o => o.value).join(' / ') || 'Default',
        image: map.image || '',
        price: map.price,
        quantity: 1,
        selectedOptions: map.selectedOptions || []
      });
    }

    ShopifyBuySDK.saveCart(cart);

    if (event && event.currentTarget) {
      const btn = event.currentTarget;
      const original = btn.innerHTML;
      btn.innerHTML = '✓';
      btn.style.opacity = '0.7';
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.opacity = '1';
      }, 800);
    }
  };

  window.ShopifyBuySDK = ShopifyBuySDK;

})(window, document);
