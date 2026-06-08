App({
  onLaunch() {
    // 初始化云开发
    wx.cloud.init({
      env: 'cloud1-d6gc0lkxc53e45276',
      traceUser: true
    })
  },
  globalData: {
    memberInfo: null,
    isAdmin: false
  }
})
