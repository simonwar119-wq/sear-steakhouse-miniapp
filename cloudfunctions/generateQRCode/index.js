// cloudfunctions/generateQRCode/index.js
// 生成小程序码并保存到云存储

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  // 仅管理员可调用
  try {
    const adminRes = await db.collection('admins').where({ openid: OPENID }).get()
    if (adminRes.data.length === 0) {
      return { success: false, msg: '无权限' }
    }
  } catch (e) {
    return { success: false, msg: '权限验证失败' }
  }

  try {
    // 生成小程序码（永久有效，支持无限个）
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: 'home',
      page: 'pages/home/home',
      width: 430,
      is_hyaline: false,
      auto_color: false,
      line_color: { r: 0, g: 0, b: 0 }
    })

    const buffer = result.buffer

    // 上传到云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: `qrcode/sear-steak-minicode.png`,
      fileContent: buffer
    })

    // 获取临时下载链接（2小时有效）
    const tempRes = await cloud.getTempFileURL({
      fileList: [uploadRes.fileID]
    })

    return {
      success: true,
      fileID: uploadRes.fileID,
      tempUrl: tempRes.fileList[0].tempFileURL
    }
  } catch (e) {
    console.error('generateQRCode error:', e)
    return { success: false, msg: e.message || '生成失败' }
  }
}
