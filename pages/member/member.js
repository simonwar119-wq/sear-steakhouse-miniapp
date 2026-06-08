// pages/member/member.js
const CACHE_KEY = 'memberCache'

Page({
  data: {
    member: null,
    loading: true,
    refreshing: false,
    transactions: [],
    tierName: '普通会员',
    tierColor: '#888888',
    nextTierPoints: 5000,
    nextTierName: '银卡',
    progress: 0,
    discountText: '暂无折扣',
    isBirthMonth: false
  },

  onShow() {
    // 本地缓存：同步读取，0ms，跨次启动也能秒开
    const cached = wx.getStorageSync(CACHE_KEY)
    if (cached && this.data.member === null) {
      this.setData({
        member: cached.member,
        transactions: cached.transactions || [],
        loading: false,
        ...this.calcTierInfo(cached.member)
      })
      getApp().globalData.memberInfo = cached.member
    }
    this.loadMember(!!cached)
  },

  async loadMember(silent = false) {
    if (!silent) this.setData({ loading: true })
    try {
      // 客户端直连数据库，省去云函数冷启动（云环境初始化后再取 db）
      const db = wx.cloud.database()
      // '{openid}' 是微信云数据库的特殊占位符，服务端自动替换为当前用户 openid
      const [memberRes, txRes] = await Promise.all([
        db.collection('members').where({ _openid: '{openid}' }).limit(1).get(),
        db.collection('transactions').where({ _openid: '{openid}' }).orderBy('createdAt', 'desc').limit(20).get()
      ])
      if (memberRes.data && memberRes.data.length > 0) {
        const m = memberRes.data[0]
        const transactions = txRes.data || []
        // 写本地缓存
        wx.setStorageSync(CACHE_KEY, { member: m, transactions })
        getApp().globalData.memberInfo = m
        this.setData({
          member: m,
          transactions,
          loading: false,
          ...this.calcTierInfo(m)
        })
      } else {
        wx.redirectTo({ url: '/pages/register/register' })
      }
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  calcTierInfo(m) {
    const cum = m.cumulativePoints || 0
    const cur = m.currentPoints || 0
    const now = new Date()
    const birthMonth = m.birthMonth ? parseInt(m.birthMonth) : 0
    const isBirthMonth = birthMonth === (now.getMonth() + 1)

    let tierName, tierColor, nextTierPoints, nextTierName, progress, discountText

    if (cum >= 10000) {
      tierName = '金卡会员'
      tierColor = '#C9A84C'
      nextTierPoints = null
      nextTierName = null
      progress = 100
      discountText = '全场8.5折'
    } else if (cum >= 5000) {
      tierName = '银卡会员'
      tierColor = '#AAAAAA'
      nextTierPoints = 10000
      nextTierName = '金卡'
      progress = Math.floor(((cum - 5000) / 5000) * 100)
      discountText = '全场9折'
    } else {
      tierName = '普通会员'
      tierColor = '#888888'
      nextTierPoints = 5000
      nextTierName = '银卡'
      progress = Math.floor((cum / 5000) * 100)
      discountText = '暂无折扣'
    }

    return { tierName, tierColor, nextTierPoints, nextTierName, progress, discountText, isBirthMonth }
  },

  goRewards() {
    wx.switchTab({ url: '/pages/rewards/rewards' })
  },

  onShareAppMessage() {
    return {
      title: '🥩 SEAR STEAK · 天津五大道炙烤牛排',
      desc: '扫码成为会员，消费即得积分，累计兑换好礼',
      path: '/pages/home/home',
      imageUrl: '/images/steak-hero.jpg'
    }
  },

  onShareTimeline() {
    return {
      title: '🥩 SEAR STEAK · 天津五大道炙烤牛排',
      query: '',
      imageUrl: '/images/steak-hero.jpg'
    }
  },

  // scroll-view 下拉刷新
  async onRefresherRefresh() {
    this.setData({ refreshing: true })
    await this.loadMember()
    this.setData({ refreshing: false })
  }
})
