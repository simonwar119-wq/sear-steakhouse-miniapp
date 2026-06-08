// cloudfunctions/redeemReward/index.js
// 兑换奖励（葡萄酒）- 生成6位核销码

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const REWARDS = {
  wine: { name: '阿图斯葡萄酒', pointsCost: 3000, description: '价值¥368' }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { type } = event
  const reward = REWARDS[type]
  if (!reward) return { success: false, msg: '未知兑换类型' }

  try {
    // 获取会员
    const res = await db.collection('members').where({ openid: OPENID }).get()
    if (res.data.length === 0) return { success: false, msg: '请先注册会员' }
    const member = res.data[0]

    if (member.currentPoints < reward.pointsCost) {
      return { success: false, msg: `积分不足，还差 ${reward.pointsCost - member.currentPoints} 分` }
    }

    const now = new Date()
    const newPoints = member.currentPoints - reward.pointsCost

    // 生成6位核销码
    const redeemCode = String(Math.floor(100000 + Math.random() * 900000))

    // 有效期30天
    const expireDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // 扣除积分
    await db.collection('members').doc(member._id).update({
      data: {
        currentPoints: newPoints,
        lastActivityDate: now
      }
    })

    // 记录兑换事务 - 含核销码
    await db.collection('transactions').add({
      data: {
        memberId: member._id,
        memberName: member.name,
        openid: OPENID,
        type: 'redemption',
        typeLabel: `兑换${reward.name}`,
        pointsDelta: -reward.pointsCost,
        note: `${reward.name}（${reward.description}）`,
        redeemCode: redeemCode,
        redeemed: false,
        redeemedAt: null,
        redeemedBy: null,
        expireDate: expireDate,
        createTime: now,
        dateStr: formatDate(now)
      }
    })

    return {
      success: true,
      rewardName: reward.name,
      pointsUsed: reward.pointsCost,
      remainingPoints: newPoints,
      redeemCode: redeemCode,
      expireDate: formatDate(expireDate)
    }
  } catch (e) {
    console.error('redeemReward error:', e)
    return { success: false, msg: '兑换失败：' + e.message }
  }
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function pad(n) { return n < 10 ? '0' + n : '' + n }
