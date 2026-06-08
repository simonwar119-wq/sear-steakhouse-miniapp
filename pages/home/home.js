// pages/home/home.js - SEAR STEAK Cover Page
Page({
  onLoad() {
    wx.setNavigationBarTitle({
      title: 'SEAR STEAK'
    });
  },

  goMenu() {
    wx.navigateTo({
      url: '/pages/menu/menu'
    });
  },

  goSeating() {
    wx.switchTab({
      url: '/pages/seating/seating'
    });
  },

  goReservation() {
    wx.navigateTo({
      url: '/pages/reservation/reservation'
    });
  },

  goMember() {
    wx.switchTab({
      url: '/pages/member/member'
    });
  },

  goAbout() {
    wx.switchTab({
      url: '/pages/about/about'
    });
  },

  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    });
  },

  goShop() {
    wx.switchTab({
      url: '/pages/shop/shop'
    });
  },

  makeCall() {
    wx.makePhoneCall({ phoneNumber: '18690550336' });
  },

  onShareAppMessage() {
    return {
      title: '🥩 SEAR STEAK · 一块好牛排，让牛肉本身说话',
      desc: '天津五大道精品牛排馆 · USDA Prime · 荔枝木炭烤',
      path: '/pages/home/home',
      imageUrl: '/images/steak-hero.jpg'
    }
  },

  onShareTimeline() {
    return {
      title: '🥩 SEAR STEAK · 一块好牛排，让牛肉本身说话',
      query: '',
      imageUrl: '/images/steak-hero.jpg'
    }
  }
});
