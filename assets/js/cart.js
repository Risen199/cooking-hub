document.addEventListener('DOMContentLoaded', function () {
  const waNumber = document.body.dataset.waNumber;
  let cart = [];

  // DOM Elements
  const cartDrawer = document.getElementById('cart-drawer');
  const cartOverlay = document.getElementById('cart-overlay');
  const itemsList = document.getElementById('cart-items-list');
  const cartBar = document.querySelector('.cart-summary');

  // 1. Toggle Drawer (Logic for opening/closing the cart list)
  if (cartBar) {
    // Add a visual hint to the bar
    cartBar.title = "Click to view your basket";
    
    cartBar.addEventListener('click', (e) => {
      // Don't open if they clicked the WhatsApp button itself
      if (!e.target.closest('#wa-order-btn')) {
        toggleCart();
      }
    });
  }

  document.getElementById('close-cart').addEventListener('click', toggleCart);
  cartOverlay.addEventListener('click', toggleCart);

  function toggleCart() {
    cartDrawer.classList.toggle('active');
    cartOverlay.classList.toggle('active');
  }

  // 2. Add Item Logic
  document.querySelectorAll('.btn-add').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // Prevents opening drawer when clicking "Add"
      const item = this.closest('.menu-item');
      const id = item.dataset.id;
      const name = item.dataset.name;
      const price = parseFloat(item.dataset.price);

      const existing = cart.find(i => i.id === id);
      if (existing) {
        existing.qty++;
      } else {
        cart.push({ id, name, price, qty: 1 });
      }
      updateUI();
    });
  });

  // 3. Update UI & Render List (Where the new "Pressable" design lives)
  function updateUI() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

    // Update Bottom Bar Counts
    const cartCountEl = document.getElementById('cart-count');
    const cartTotalEl = document.getElementById('cart-total');
    
    if(cartCountEl) cartCountEl.textContent = count;
    if(cartTotalEl) cartTotalEl.textContent = `R${total.toFixed(2)}`;

    // Render the list in the drawer with "Pressable" UI
    itemsList.innerHTML = cart.length === 0 
      ? '<div class="text-center p-5"><p class="text-muted">Your basket is empty.</p></div>' 
      : cart.map(item => `
        <div class="cart-item-row shadow-sm">
          <div class="d-flex align-items-center">
            <div class="bg-danger text-white rounded-circle d-flex align-items-center justify-content-center me-3" 
                 style="width: 32px; height: 32px; font-size: 0.85rem; font-weight: bold; flex-shrink: 0;">
              ${item.qty}
            </div>
            <div>
              <span class="fw-bold d-block text-dark">${item.name}</span>
              <small class="text-muted">R${item.price.toFixed(2)} each</small>
            </div>
          </div>
          <div class="d-flex align-items-center">
            <span class="fw-bold me-3 text-dark">R${(item.price * item.qty).toFixed(2)}</span>
            <button class="btn-remove" onclick="window.removeFromCart('${item.id}')" aria-label="Remove item">
              ✕
            </button>
          </div>
        </div>
      `).join('');

    // Handle WhatsApp Button Link Generation
    const waBtn = document.getElementById('wa-order-btn');
    if (waBtn) {
      if (count > 0) {
        waBtn.classList.remove('disabled');
        const lines = cart.map(i => `- ${i.name} x${i.qty} (R${(i.price * i.qty).toFixed(2)})`);
        const msg = `Hi, I'd like to place an order:\n${lines.join('\n')}\nTotal: R${total.toFixed(2)}`;
        waBtn.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
      } else {
        waBtn.classList.add('disabled');
        waBtn.href = 'javascript:void(0)';
        // Close the drawer if the last item is removed
        if(cartDrawer.classList.contains('active') && cart.length === 0) {
            setTimeout(toggleCart, 500);
        }
      }
    }
  }

  // 4. Global Remove Function (Accessed by the '✕' buttons)
  window.removeFromCart = function(id) {
    const index = cart.findIndex(i => i.id === id);
    if (index > -1) {
      if (cart[index].qty > 1) {
        cart[index].qty--;
      } else {
        cart.splice(index, 1);
      }
    }
    updateUI();
  };

  updateUI();
});