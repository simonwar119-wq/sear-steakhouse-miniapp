// pages/rewards/rewards.js

Page({
  data: {
    member: null,
    loading: true,
    confirming: false,
    // 兑换成功后的核销码显示
    redeemResult: null
  },

  onShow() {
    this.loadMember()
    this.setData({ redeemResult: null })
  },

  async loadMember() {
    this.setData({ loading: true })
    const app = getApp()
    if (app.globalData.memberInfo) {
      this.setData({ member: app.globalData.memberInfo, loading: false })
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'getMember' })
      if (res.result && res.result.member) {
        this.setData({ member: res.result.member, loading: false })
        app.globalData.memberInfo = res.result.member
      }
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  async redeemWine() {
    const { member } = this.data
    if (!member) return
    if (member.currentPoints < 3000) {
      wx.showToast({ title: `还差 ${3000 - member.currentPoints} 分`, icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认兑换',
      content: '消耗 3,000 积分兑换阿图斯葡萄酒一瓶（¥368），确认兑换？',
      confirmText: '确认',
      cancelText: '取消',
      confirmColor: '#C8171D',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ confirming: true })
        try {
          const fnRes = await wx.cloud.callFunction({
            name: 'redeemReward',
            data: { type: 'wine' }
          })
          if (fnRes.result.success) {
            this.setData({
              redeemResult: {
                code: fnRes.result.redeemCode,
                reward: fnRes.result.rewardName,
                expire: fnRes.result.expireDate,
                points: fnRes.result.pointsUsed,
                remaining: fnRes.result.remainingPoints
              }
            })
            this.loadMember()
          } else {
            wx.showToast({ title: fnRes.result.msg || '兑换失败', icon: 'none' })
          }
        } catch (e) {
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
        this.setData({ confirming: false })
      }
    })
  },

  closeRedeemResult() {
    this.setData({ redeemResult: null })
  }
})
