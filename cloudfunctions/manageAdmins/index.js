// cloudfunctions/manageAdmins/index.js
// 授权 / 撤销管理员（仅现有管理员可操作）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, memberId } = event

  // 验证调用者是管理员
  const callerCheck = await db.collection('admins').where({ openid: OPENID }).get()
  if (callerCheck.data.length === 0) {
    return { success: false, msg: '无权限' }
  }

  if (action === 'grant') {
    // 查找目标会员的 openid
    const memberRes = await db.collection('members').doc(memberId).get()
    if (!memberRes.data) return { success: false, msg: '会员不存在' }

    const targetOpenid = memberRes.data._openid
    const targetName = memberRes.data.name

    // 检查是否已经是管理员
    const existing = await db.collection('admins').where({ openid: targetOpenid }).get()
    if (existing.data.length > 0) {
      return { success: false, msg: '该用户已是管理员' }
    }

    await db.collection('admins').add({
      data: {
        _openid: targetOpenid,
        openid: targetOpenid,
        name: targetName,
        grantedBy: OPENID,
        grantedAt: db.serverDate()
      }
    })
    return { success: true, msg: `已将 ${targetName} 授权为管理员` }
  }

  if (action === 'revoke') {
    const memberRes = await db.collection('members').doc(memberId).get()
    if (!memberRes.data) return { success: false, msg: '会员不存在' }

    const targetOpenid = memberRes.data._openid

    // 不能撤销自己
    if (targetOpenid === OPENID) {
      return { success: false, msg: '不能撤销自己的管理员权限' }
    }

    const existing = await db.collection('admins').where({ openid: targetOpenid }).get()
    if (existing.data.length === 0) {
      return { success: false, msg: '该用户不是管理员' }
    }

    await db.collection('admins').doc(existing.data[0]._id).remove()
    return { success: true, msg: `已撤销 ${memberRes.data.name} 的管理员权限` }
  }

  return { success: false, msg: '未知操作' }
}
