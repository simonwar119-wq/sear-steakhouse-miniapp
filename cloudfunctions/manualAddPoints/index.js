// cloudfunctions/manualAddPoints/index.js
// 管理员操作：查找会员 / 手动录入积分 / 查看操作记录

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  // 验证管理员身份
  const adminRes = await db.collection('admins').where({ openid: OPENID }).get()
  if (adminRes.data.length === 0) {
    return { success: false, msg: '无管理员权限' }
  }

  // 获取员工姓名
  let staffName = '员工'
  if (adminRes.data[0].name) {
    staffName = adminRes.data[0].name
  }

  const { action } = event

  switch (action) {

    // 按关键词（手机号或姓名）查找会员
    case 'findMember': {
      const { keyword } = event
      if (!keyword) return { member: null }

      // 先按手机号精确匹配
      let res = await db.collection('members').where({ phone: keyword }).get()
      if (res.data.length > 0) return { member: res.data[0] }

      // 再按姓名模糊匹配
      res = await db.collection('members')
        .where(_.or([
          { name: db.RegExp({ regexp: '.*' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*', options: 'i' }) }
        ]))
        .limit(1)
        .get()
      if (res.data.length > 0) return { member: res.data[0] }

      return { member: null }
    }

    // 手动录入积分
    case 'addManual': {
      const { memberId, amount } = event
      const now = new Date()
      const points = Math.floor(amount)

      const memberRes = await db.collection('members').doc(memberId).get()
      const member = memberRes.data
      if (!member) return { success: false, msg: '会员不存在' }

      const newCurrentPoints = (member.currentPoints || 0) + points
      const newCumulativePoints = (member.cumulativePoints || 0) + points
      const newTier = calcTier(newCumulativePoints)

      await db.collection('members').doc(memberId).update({
        data: {
          currentPoints: newCurrentPoints,
          cumulativePoints: newCumulativePoints,
          tier: newTier,
          lastActivityDate: now
        }
      })

      await db.collection('transactions').add({
        data: {
          memberId,
          memberName: member.name,
          type: 'manual',
          typeLabel: '员工录入',
          amount,
          pointsDelta: points,
          status: 'manual_approved',
          note: `员工手动录入 · ${staffName}`,
          staffName,
          operatedBy: OPENID,
          createTime: now,
          dateStr: formatDate(now)
        }
      })

      return { success: true, points, newCurrentPoints }
    }

    // 最近操作记录（手动录入的记录）
    case 'listHistory': {
      const res = await db.collection('transactions')
        .where({ type: 'manual', status: 'manual_approved' })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()
      return { list: res.data }
    }

    // 验证核销码
    case 'verifyRedeem': {
      const { redeemCode } = event
      if (!redeemCode) return { valid: false, details: ['请输入核销码'] }

      // 在 transactions 集合中查找核销码
      const txRes = await db.collection('transactions')
        .where({ redeemCode: redeemCode })
        .limit(1)
        .get()

      if (txRes.data.length === 0) {
        return { valid: false, details: ['核销码不存在'] }
      }

      const tx = txRes.data[0]

      // 检查是否已核销
      if (tx.redeemed) {
        return {
          valid: true,
          alreadyRedeemed: true,
          details: [
            `核销码已使用`,
            `兑换商品：${tx.note}`,
            `核销时间：${formatDate(tx.redeemedAt)}`
          ]
        }
      }

      // 检查是否过期
      if (tx.expireDate && new Date(tx.expireDate) < new Date()) {
        return { valid: false, details: ['核销码已过期', `有效期至：${formatDate(tx.expireDate)}`] }
      }

      return {
        valid: true,
        alreadyRedeemed: false,
        txId: tx._id,
        details: [
          `兑换商品：${tx.note || ''}`,
          `会员：${tx.memberName || '未知'}`,
          `有效期至：${formatDate(tx.expireDate)}`
        ]
      }
    }

    // 确认核销
    case 'confirmRedeem': {
      const { redeemCode } = event
      if (!redeemCode) return { success: false, msg: '缺少核销码' }

      const txRes = await db.collection('transactions')
        .where({ redeemCode: redeemCode, redeemed: false })
        .limit(1)
        .get()

      if (txRes.data.length === 0) {
        return { success: false, msg: '核销码已使用或不存在' }
      }

      const tx = txRes.data[0]
      const now = new Date()

      await db.collection('transactions').doc(tx._id).update({
        data: {
          redeemed: true,
          redeemedAt: now,
          redeemedBy: OPENID,
          redeemedByName: staffName,
        }
      })

      return { success: true, msg: `${tx.note || ''} 核销成功` }
    }

    // 注册甜品券核销
    case 'verifyGift': {
      const { giftCode } = event
      if (!giftCode) return { valid: false, details: ['缺少甜品券码'] }

      const txRes = await db.collection('transactions')
        .where({ giftCode: giftCode })
        .limit(1)
        .get()

      if (txRes.data.length === 0) {
        return { valid: false, details: ['甜品券不存在'] }
      }

      const tx = txRes.data[0]
      if (tx.giftRedeemed) {
        return { valid: false, details: ['甜品券已使用'] }
      }
      if (tx.giftExpireDate && new Date(tx.giftExpireDate) < new Date()) {
        return { valid: false, details: ['甜品券已过期'] }
      }

      return {
        valid: true,
        txId: tx._id,
        details: [`甜品券有效`, `会员：${tx.memberName || '未知'}`, `有效期至：${formatDate(tx.giftExpireDate)}`]
      }
    }

    case 'confirmGiftRedeem': {
      const { giftCode } = event
      if (!giftCode) return { success: false, msg: '缺少甜品券码' }

      const txRes = await db.collection('transactions')
        .where({ giftCode: giftCode, giftRedeemed: false })
        .limit(1)
        .get()

      if (txRes.data.length === 0) {
        return { success: false, msg: '甜品券已使用或不存在' }
      }

      const tx = txRes.data[0]
      const now = new Date()

      await db.collection('transactions').doc(tx._id).update({
        data: { giftRedeemed: true, giftRedeemedAt: now, giftRedeemedBy: OPENID }
      })

      // 同步更新 member 的 registrationGiftUsed
      if (tx.memberId) {
        await db.collection('members').doc(tx.memberId).update({
          data: { registrationGiftUsed: true }
        })
      }

      return { success: true, msg: '甜品券核销成功' }
    }

    default:
      return { success: false, msg: '未知操作' }
  }
}

function calcTier(cum) {
  if (cum >= 10000) return 2
  if (cum >= 5000) return 1
  return 0
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function pad(n) { return n < 10 ? '0' + n : '' + n }
