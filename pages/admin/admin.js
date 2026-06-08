// pages/admin/admin.js

Page({
  data: {
    activeTab: 'booking',
    redeemCodeInput: '',
    verifyResult: null,
    verifying: false,
    confirmingRedeem: false,
    isAdmin: false,
    checking: true,
    searchKeyword: '',
    foundMember: null,
    amount: '',
    showPointsPreview: false,
    pointsToAdd: 0,
    canAddPoints: false,
    submitting: false,
    searched: false,
    searching: false,
    history: [],
    qrUrl: '',
    generatingQR: false,

    // 预订管理
    bookingDate: '',
    bookings: [],
  },

  onShow() {
    this.checkAdmin()
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    this.setData({ bookingDate: today })
  },

  async checkAdmin() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getMember', data: { checkAdmin: true } })
      this.setData({ isAdmin: res.result.isAdmin || false, checking: false })
      if (res.result.isAdmin) {
        this.loadHistory()
        this.loadBookings()
      }
    } catch (e) {
      this.setData({ checking: false, isAdmin: false })
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value, searched: false })
  },

  async searchMember() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) { wx.showToast({ title: '请输入手机号或姓名', icon: 'none' }); return }
    this.setData({ searching: true, searched: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manualAddPoints', data: { action: 'findMember', keyword }
      })
      if (res.result && res.result.member) {
        const member = res.result.member
        const db = wx.cloud.database()
        const adminRes = await db.collection('admins').where({ openid: member._openid }).limit(1).get()
        member.isAdmin = adminRes.data.length > 0
        this.setData({ foundMember: member })
      } else {
        this.setData({ foundMember: null })
        wx.showToast({ title: '未找到该会员', icon: 'none' })
      }
    } catch (e) {
      this.setData({ foundMember: null })
      wx.showToast({ title: '查询失败', icon: 'none' })
    }
    this.setData({ searching: false })
  },

  onAmountInput(e) {
    const val = e.detail.value;
    const amount = parseFloat(val) || 0;
    this.setData({
      amount: val, showPointsPreview: amount > 0,
      pointsToAdd: Math.floor(amount), canAddPoints: amount > 0
    });
  },

  async addPoints() {
    const { foundMember, amount } = this.data
    const val = parseFloat(amount)
    if (!foundMember) { wx.showToast({ title: '请先查询会员', icon: 'none' }); return }
    if (!val || val <= 0) { wx.showToast({ title: '请输入正确金额', icon: 'none' }); return }
    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manualAddPoints',
        data: { action: 'addManual', memberId: foundMember._id, amount: val }
      })
      if (res.result.success) {
        wx.showToast({ title: `+${Math.floor(val)} 积分已录入`, icon: 'success' })
        this.refreshMember()
        this.setData({ amount: '' })
        this.loadHistory()
      } else {
        wx.showToast({ title: res.result.msg || '录入失败', icon: 'none' })
      }
    } catch (e) { wx.showToast({ title: '网络错误', icon: 'none' }) }
    this.setData({ submitting: false })
  },

  async refreshMember() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'manualAddPoints', data: { action: 'findMember', keyword }
      })
      if (res.result && res.result.member) this.setData({ foundMember: res.result.member })
    } catch (e) {}
  },

  async loadHistory() {
    try {
      const res = await wx.cloud.callFunction({ name: 'manualAddPoints', data: { action: 'listHistory' } })
      this.setData({ history: res.result.list || [] })
    } catch (e) { console.error('loadHistory error:', e) }
  },

  async grantAdmin() {
    const { foundMember } = this.data
    wx.showModal({
      title: '确认授权',
      content: `将 ${foundMember.name} 授权为管理员？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          const r = await wx.cloud.callFunction({ name: 'manageAdmins', data: { action: 'grant', memberId: foundMember._id } })
          if (r.result.success) {
            wx.showToast({ title: r.result.msg, icon: 'success' })
            this.setData({ 'foundMember.isAdmin': true })
          } else { wx.showToast({ title: r.result.msg, icon: 'none' }) }
        } catch (e) { wx.showToast({ title: '操作失败', icon: 'none' }) }
      }
    })
  },

  async revokeAdmin() {
    const { foundMember } = this.data
    wx.showModal({
      title: '确认撤销',
      content: `撤销 ${foundMember.name} 的管理员权限？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          const r = await wx.cloud.callFunction({ name: 'manageAdmins', data: { action: 'revoke', memberId: foundMember._id } })
          if (r.result.success) {
            wx.showToast({ title: r.result.msg, icon: 'success' })
            this.setData({ 'foundMember.isAdmin': false })
          } else { wx.showToast({ title: r.result.msg, icon: 'none' }) }
        } catch (e) { wx.showToast({ title: '操作失败', icon: 'none' }) }
      }
    })
  },

  // ── 预订管理 ──────────────────────────────────────

  async loadBookings() {
    if (!this.data.bookingDate) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'bookingManager',
        data: { action: 'listBookings', date: this.data.bookingDate }
      })
      this.setData({ bookings: res.result.list || [] })
    } catch (e) { console.error('loadBookings error:', e) }
  },

  onBookingDateChange(e) {
    this.setData({ bookingDate: e.detail.value }, () => this.loadBookings())
  },

  async bookingArrived(e) {
    const bookingId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认到店', content: '标记该预订客人已到店？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const r = await wx.cloud.callFunction({ name: 'bookingManager', data: { action: 'markArrived', bookingId } })
          if (r.result.success) { wx.showToast({ title: '已标记到店', icon: 'success' }); this.loadBookings() }
        } catch (e) { wx.showToast({ title: '操作失败', icon: 'none' }) }
      }
    })
  },

  async bookingNoShow(e) {
    const bookingId = e.currentTarget.dataset.id
    wx.showModal({
      title: '标记未到', content: '确认该预订客人未到店？将记录违约。',
      confirmText: '确认未到', confirmColor: '#C8171D',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const r = await wx.cloud.callFunction({ name: 'bookingManager', data: { action: 'markNoShow', bookingId } })
          if (r.result.success) { wx.showToast({ title: r.result.msg, icon: 'success' }); this.loadBookings() }
        } catch (e) { wx.showToast({ title: '操作失败', icon: 'none' }) }
      }
    })
  },

  async releaseDeposit(e) {
    const bookingId = e.currentTarget.dataset.id
    wx.showModal({
      title: '释放押金', content: '确认释放该预订的押金？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const r = await wx.cloud.callFunction({ name: 'bookingManager', data: { action: 'releaseDeposit', bookingId } })
          if (r.result.success) { wx.showToast({ title: '押金已释放', icon: 'success' }); this.loadBookings() }
        } catch (e) { wx.showToast({ title: '操作失败', icon: 'none' }) }
      }
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab, redeemCodeInput: '', redeemVerifyResult: null })
    if (tab === 'booking') this.loadBookings()
  },

  onRedeemCodeInput(e) {
    this.setData({ redeemCodeInput: e.detail.value, redeemVerifyResult: null })
  },

  async verifyRedeemCode() {
    const code = this.data.redeemCodeInput.trim()
    if (!code || code.length < 6) { wx.showToast({ title: '请输入6位核销码', icon: 'none' }); return }
    this.setData({ verifying: true, redeemVerifyResult: null })
    try {
      const res = await wx.cloud.callFunction({ name: 'manualAddPoints', data: { action: 'verifyRedeem', redeemCode: code } })
      this.setData({ redeemVerifyResult: res.result })
    } catch (e) { this.setData({ redeemVerifyResult: { valid: false, details: ['查询失败，请重试'] } }) }
    this.setData({ verifying: false })
  },

  async confirmRedeem() {
    const code = this.data.redeemCodeInput.trim()
    this.setData({ confirmingRedeem: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'manualAddPoints', data: { action: 'confirmRedeem', redeemCode: code } })
      if (res.result.success) {
        wx.showToast({ title: '✓ 核销成功', icon: 'success' })
        this.setData({ redeemCodeInput: '', redeemVerifyResult: null })
      } else { wx.showToast({ title: res.result.msg || '核销失败', icon: 'none' }) }
    } catch (e) { wx.showToast({ title: '网络错误', icon: 'none' }) }
    this.setData({ confirmingRedeem: false })
  },

  async generateQR() {
    this.setData({ generatingQR: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'generateQRCode' })
      if (res.result && res.result.success) {
        this.setData({ qrUrl: res.result.tempUrl })
        wx.showToast({ title: '生成成功', icon: 'success' })
      } else { wx.showToast({ title: res.result.msg || '生成失败', icon: 'none' }) }
    } catch (e) { wx.showToast({ title: '调用失败', icon: 'none' }) }
    this.setData({ generatingQR: false })
  }
})
