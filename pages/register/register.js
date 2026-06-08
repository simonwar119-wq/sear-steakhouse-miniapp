// pages/register/register.js

Page({
  data: {
    name: '',
    phone: '',
    phoneCode: '',
    birthMonth: '',
    birthDay: '',
    submitting: false,
    registered: false,
    months: ['01','02','03','04','05','06','07','08','09','10','11','12'],
    days: [],
    monthIndex: 0,
    dayIndex: 0
  },

  onLoad() {
    this.setDaysForMonth(1)
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  // 微信一键获取手机号
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '需要手机号才能注册', icon: 'none' })
      return
    }
    // 将 code 传给云函数解密
    this.setData({ phoneCode: e.detail.code })
  },

  onMonthChange(e) {
    const monthIndex = e.detail.value
    const month = parseInt(this.data.months[monthIndex])
    this.setDaysForMonth(month)
    this.setData({ monthIndex })
  },

  setDaysForMonth(month) {
    let maxDays = 31
    if (month === 2) {
      maxDays = 28 // 简化处理，不考虑闰年
    } else if ([4, 6, 9, 11].indexOf(month) !== -1) {
      maxDays = 30
    }
    const days = []
    for (let i = 1; i <= maxDays; i++) days.push(i < 10 ? '0' + i : '' + i)
    const dayIndex = this.data.dayIndex >= days.length ? days.length - 1 : this.data.dayIndex
    this.setData({ days, dayIndex })
  },

  onDayChange(e) {
    this.setData({ dayIndex: e.detail.value })
  },

  async onSubmit() {
    const { name, phoneCode, months, days, monthIndex, dayIndex } = this.data

    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' }); return
    }
    if (!phoneCode) {
      wx.showToast({ title: '请授权手机号', icon: 'none' }); return
    }

    this.setData({ submitting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'register',
        data: {
          name: name.trim(),
          phoneCode,
          birthMonth: months[monthIndex],
          birthDay: days[dayIndex]
        }
      })

      if (res.result.success) {
        getApp().globalData.memberInfo = res.result.member
        this.setData({ registered: true, submitting: false })
      } else {
        wx.showToast({ title: res.result.msg || '注册失败，请重试', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})
