// pages/seating/seating.js
// 订位：可视化选座 → 判断押金 → 支付/免押 → 出邀请卡

const TABLES = [
  { id: 'B2', label: 'B2', cap: 4, zone: 'sofa',   status: 'free', zoneName: '沙发卡座' },
  { id: 'B3', label: 'B3', cap: 4, zone: 'sofa',   status: 'free', zoneName: '沙发卡座' },
  { id: 'B1', label: 'B1', cap: 2, zone: 'sofa',   status: 'free', zoneName: '沙发卡座' },
  { id: 'A5', label: 'A5', cap: 4, zone: 'sofa',   status: 'free', zoneName: '沙发卡座' },
  { id: 'A1', label: 'A1', cap: 4, zone: 'sofa',   status: 'free', zoneName: '沙发卡座' },
  { id: 'B5', label: 'B5', cap: 4, zone: 'dining', status: 'free', zoneName: '散台' },
]

Page({
  data: {
    tables: [],
    selectedId: null,
    selectedTable: null,
    showForm: false,
    formName: '',
    formPhone: '',
    formDate: '',
    timeSlots: ['11:30','12:00','12:30','13:00','13:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00'],
    timeIndex: 5,
    guestRange: ['1位','2位','3位','4位','5位','6位','7位','8位'],
    guestIndex: 1,
    showCard: false,
    booking: null,

    // 押金状态
    needsDeposit: false,
    depositAmount: 0,
    memberCheckDone: false,
    memberInfo: null,
    strikes: 0,
    cumulativePoints: 0,

    // 支付
    paying: false,
    payResult: null,

    // 取消
    cancelling: false,
  },

  onLoad() {
    const tables = TABLES.map(t => ({ ...t }))
    const d = new Date()
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    this.setData({ tables, formDate: dateStr })
    this.checkMember()
  },

  // ── 检查会员身份 ──────────────────────────────────
  async checkMember() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('members').where({ _openid: '{openid}' }).limit(1).get()
      if (res.data.length > 0) {
        const m = res.data[0]
        this.setData({
          memberCheckDone: true,
          memberInfo: m,
          strikes: m.strikes || 0,
          cumulativePoints: m.cumulativePoints || 0
        })
      } else {
        this.setData({ memberCheckDone: true, memberInfo: null })
      }
    } catch (e) {
      this.setData({ memberCheckDone: true, memberInfo: null })
    }
  },

  // ── 判断是否需要押金 ──────────────────────────────
  checkDepositNeeded() {
    const { memberInfo, strikes, cumulativePoints } = this.data
    if (!memberInfo) return { needs: true, amount: 100, reason: '非会员需支付押金' }
    if (strikes > 0) return { needs: true, amount: 100, reason: `有 ${strikes} 次未到记录，需支付押金` }
    if (cumulativePoints <= 0) return { needs: true, amount: 100, reason: '暂无消费记录，需支付押金' }
    return { needs: false, amount: 0, reason: '' }
  },

  tapTable(e) {
    const id = e.currentTarget.dataset.id
    const tableData = this.data.tables.find(t => t.id === id)
    if (!tableData || tableData.status === 'taken') {
      wx.showToast({ title: '该桌已被预订', icon: 'none' })
      return
    }
    const isSelf = this.data.selectedId === id
    const tables = this.data.tables.map(t => {
      if (t.id === id) return { ...t, status: isSelf ? 'free' : 'selected' }
      return t.status === 'selected' ? { ...t, status: 'free' } : t
    })
    this.setData({
      tables, selectedId: isSelf ? null : id,
      selectedTable: isSelf ? null : { ...tableData, status: 'selected' },
    })
  },

  openForm() {
    if (!this.data.selectedId) {
      wx.showToast({ title: '请先选择座位', icon: 'none' })
      return
    }
    this.setData({ showForm: true })
  },

  closeForm() { this.setData({ showForm: false }) },
  onNameInput(e)  { this.setData({ formName: e.detail.value }) },
  onPhoneInput(e) { this.setData({ formPhone: e.detail.value }) },
  onDateChange(e) { this.setData({ formDate: e.detail.value }) },
  onTimeChange(e) { this.setData({ timeIndex: e.detail.value }) },
  onGuestChange(e){ this.setData({ guestIndex: e.detail.value }) },

  // ── 提交预订 → 判断押金 → 出卡/支付 ──────────────
  async confirmBooking() {
    const { formName, formPhone, formDate, timeSlots, timeIndex, guestRange, guestIndex, selectedTable } = this.data
    if (!formName.trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return }
    if (!formPhone.trim() || !/^1\d{10}$/.test(formPhone.trim())) { wx.showToast({ title: '请填写正确手机号', icon: 'none' }); return }

    wx.showLoading({ title: '提交中...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'bookingManager',
        data: {
          action: 'createBooking',
          name: formName.trim(),
          phone: formPhone.trim(),
          date: formDate,
          time: timeSlots[timeIndex],
          guests: guestRange[guestIndex],
          table: selectedTable.label,
          zoneName: selectedTable.zoneName,
          cap: selectedTable.cap
        }
      })

      const r = res.result
      if (!r.success) {
        wx.hideLoading()
        wx.showToast({ title: r.msg || '预订失败', icon: 'none' })
        return
      }

      const days = ['周日','周一','周二','周三','周四','周五','周六']
      const booking = {
        name: formName.trim(),
        phone: formPhone.trim(),
        date: formDate,
        weekday: days[new Date(formDate).getDay()],
        time: timeSlots[timeIndex],
        guests: guestRange[guestIndex],
        table: selectedTable.label,
        zoneName: selectedTable.zoneName,
        cap: selectedTable.cap,
        code: r.code,
        bookingId: r.bookingId,
        needsDeposit: r.needsDeposit,
        depositAmount: r.depositAmount,
        depositPaid: false,
      }

      this.setData({ booking, showForm: false })
      wx.hideLoading()

      // 关闭选中的桌子
      const tables = this.data.tables.map(t =>
        t.id === this.data.selectedId ? { ...t, status: 'taken' } : t
      )
      this.setData({ tables, selectedId: null, selectedTable: null })

      // 判断押金
      if (r.needsDeposit) {
        // 需要押金 → 调起支付
        this.startDepositPayment(r)
      } else {
        // 免押金 → 直接出卡
        this.setData({ 'booking.depositPaid': false, showCard: true })
      }

    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  // ── 支付押金 ──────────────────────────────────────
  async startDepositPayment(bookingResult) {
    const { booking } = this.data
    this.setData({ showDepositDialog: true })
    // 显示押金确认弹窗
    wx.showModal({
      title: '支付押金',
      content: `需预付押金 ¥${booking.depositAmount} 确认订位。到店后联系员工取消押金。`,
      cancelText: '取消预订',
      confirmText: '去支付',
      confirmColor: '#C8171D',
      success: (res) => {
        if (res.confirm) {
          this.doPay(bookingResult)
        } else {
          // 取消预订
          this.cancelUnpaidBooking(booking.bookingId)
        }
      }
    })
  },

  async doPay(bookingResult) {
    this.setData({ paying: true })
    // ⚠️ 商户号开通后，这里填入 wx.requestPayment 调用
    // 当前阶段：模拟支付成功，员工后台手动确认
    wx.showToast({ title: '到店后联系员工确认押金', icon: 'none', duration: 3000 })
    this.setData({ paying: false, 'booking.depositPaid': false, showCard: true })
    
    // 未来实际支付代码（商户号开通后启用）：
    // const payRes = await wx.cloud.callFunction({
    //   name: 'bookingManager',
    //   data: { action: 'createPayment', bookingId: bookingResult.bookingId, amount: bookingResult.depositAmount }
    // })
    // if (payRes.result && payRes.result.payment) {
    //   const pay = await wx.requestPayment(payRes.result.payment)
    //   if (pay.errMsg === 'requestPayment:ok') {
    //     await wx.cloud.callFunction({
    //       name: 'bookingManager',
    //       data: { action: 'confirmPayment', bookingId: bookingResult.bookingId }
    //     })
    //     this.setData({ showCard: true, 'booking.depositPaid': true })
    //   }
    // }
  },

  async cancelUnpaidBooking(bookingId) {
    try {
      await wx.cloud.callFunction({
        name: 'bookingManager',
        data: { action: 'cancelBooking', bookingId }
      })
    } catch (e) {}
    this.setData({ booking: null })
    wx.showToast({ title: '已取消预订', icon: 'none' })
  },

  // ── 取消预订 ──────────────────────────────────────
  async cancelBooking() {
    const { booking } = this.data
    if (!booking) return
    wx.showModal({
      title: '取消预订',
      content: '距预订时间≥2小时可在线取消，否则需联系店方（18690550336）',
      cancelText: '再想想',
      confirmText: '确认取消',
      confirmColor: '#C8171D',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ cancelling: true })
        try {
          const r = await wx.cloud.callFunction({
            name: 'bookingManager',
            data: { action: 'cancelBooking', bookingId: booking.bookingId }
          })
          if (r.result.success) {
            wx.showToast({ title: '已取消', icon: 'success' })
            this.setData({ showCard: false, booking: null })
          } else {
            wx.showToast({ title: r.result.msg || '取消失败', icon: 'none' })
          }
        } catch (e) {
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
        this.setData({ cancelling: false })
      }
    })
  },

  closeCard() { this.setData({ showCard: false, booking: null }) },
  shareCard()  { wx.showToast({ title: '长按卡片截图后发给同行朋友', icon: 'none', duration: 2500 }) },
  noop()       {},
})
