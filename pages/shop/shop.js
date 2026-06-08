// pages/shop/shop.js — 鲜肉铺购物车逻辑
Page({
  data: {
    goodsList: [
      {
        id: 'g1',
        name: 'USDA PRIME 肋眼',
        en: 'Prime Ribeye',
        weight: '300g',
        originalPrice: 298,
        discountPrice: 194,
        img: '/images/food-steak1.jpg',
      },
      {
        id: 'g2',
        name: 'USDA PRIME 菲力',
        en: 'Prime Tenderloin',
        weight: '250g',
        originalPrice: 358,
        discountPrice: 233,
        img: '/images/food-steak2.jpg',
      },
      {
        id: 'g3',
        name: 'USDA PRIME T骨',
        en: 'Prime T-Bone',
        weight: '500g',
        originalPrice: 468,
        discountPrice: 304,
        img: '/images/food-grill.jpg',
      },
      {
        id: 'g4',
        name: '澳洲和牛 M5+ 横膈膜',
        en: 'Wagyu M5+ Skirt',
        weight: '300g',
        originalPrice: 328,
        discountPrice: 213,
        img: '/images/food-dish1.jpg',
      },
      {
        id: 'g5',
        name: '干式熟成 纽约客',
        en: 'Dry-Aged NY Strip',
        weight: '300g',
        originalPrice: 398,
        discountPrice: 259,
        img: '/images/food-dish2.jpg',
      },
      {
        id: 'g6',
        name: '经典汉堡肉饼 500g装',
        en: 'Classic Burger Patties ×4',
        weight: '500g / 4片',
        originalPrice: 168,
        discountPrice: 109,
        img: '/images/food-burger1.jpg',
      },
    ],
    // 购物车 { id: { id, name, price, count } }
    cart: {},
    cartCount: 0,
    cartTotal: 0,
  },

  // ── 加入购物车 ──
  addToCart(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.goodsList.find(g => g.id === id);
    if (!item) return;

    const cart = { ...this.data.cart };
    if (cart[id]) {
      cart[id].count += 1;
    } else {
      cart[id] = {
        id: item.id,
        name: item.name,
        price: item.discountPrice,
        count: 1,
      };
    }

    this.setData({ cart }, this.updateCartSummary);
    this.showToast('已加入购物车');
  },

  // ── 减少数量（可扩展用） ──
  removeFromCart(e) {
    const id = e.currentTarget.dataset.id;
    const cart = { ...this.data.cart };
    if (!cart[id]) return;

    cart[id].count -= 1;
    if (cart[id].count <= 0) {
      delete cart[id];
    }

    this.setData({ cart }, this.updateCartSummary);
  },

  // ── 清空购物车 ──
  clearCart() {
    wx.showModal({
      title: '清空购物车',
      content: '确定要清空购物车吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ cart: {}, cartCount: 0, cartTotal: 0 });
        }
      },
    });
  },

  // ── 更新购物车统计 ──
  updateCartSummary() {
    const cart = this.data.cart;
    let count = 0;
    let total = 0;

    Object.keys(cart).forEach((key) => {
      count += cart[key].count;
      total += cart[key].price * cart[key].count;
    });

    this.setData({
      cartCount: count,
      cartTotal: total,
    });
  },

  // ── 结算 ──
  onCheckout() {
    wx.showToast({
      title: '微信支付即将开通',
      icon: 'none',
      duration: 2000,
    });
  },

  // ── 轻提示 ──
  showToast(msg) {
    wx.showToast({
      title: msg,
      icon: 'none',
      duration: 1200,
    });
  },
});
