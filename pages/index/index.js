// pages/index/index.js
// 启动页：暂时直接跳到首页（预览新设计）
// TODO: 上线前恢复会员检测逻辑

Page({
  onLoad() {
    wx.switchTab({ url: '/pages/home/home' })
  }

  // 原有会员检测逻辑（上线时恢复）
  // async checkMembership() {
  //   try {
  //     const res = await wx.cloud.callFunction({ name: 'getMember' })
  //     if (res.result && res.result.member) {
  //       getApp().globalData.memberInfo = res.result.member
  //       wx.switchTab({ url: '/pages/home/home' })
  //     } else {
  //       wx.redirectTo({ url: '/pages/register/register' })
  //     }
  //   } catch (e) {
  //     wx.redirectTo({ url: '/pages/register/register' })
  //   }
  // }
})
