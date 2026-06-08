// cloudfunctions/getMember/index.js
// 获取当前用户会员信息 + 检查积分过期 + 检查管理员身份

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  try {
    // 查询会员
    const res = await db.collection('members').where({ openid: OPENID }).get()
    if (res.data.length === 0) {
      const isAdmin = await checkAdmin(OPENID)
      return { member: null, isAdmin }
    }

    let member = res.data[0]

    // 检查1年积分过期
    member = await checkPointsExpiry(member)

    // 最近10条交易记录
    const txRes = await db.collection('transactions')
      .where({ memberId: member._id })
      .orderBy('createTime', 'desc')
      .limit(10)
      .get()

    // 检查管理员
    const isAdmin = await checkAdmin(OPENID)

    return {
      member,
      transactions: txRes.data,
      isAdmin
    }
  } catch (e) {
    console.error('getMember error:', e)
    return { member: null, error: e.message }
  }
}

// 检查积分是否过期（1年未消费清零）
async function checkPointsExpiry(member) {
  if (!member.lastActivityDate) return member

  const lastActivity = new Date(member.lastActivityDate)
  const now = new Date()
  const oneYear = 365 * 24 * 60 * 60 * 1000

  if ((now - lastActivity) > oneYear && member.currentPoints > 0) {
    // 清零当前积分，保留等级和累计积分
    await db.collection('members').doc(member._id).update({
      data: { currentPoints: 0 }
    })
    // 记录清零事务
    await db.collection('transactions').add({
      data: {
        memberId: member._id,
        memberName: member.name,
        type: 'expiry',
        typeLabel: '积分清零',
        pointsDelta: -member.currentPoints,
        note: '超过1年未消费，积分自动清零',
        createTime: now,
        dateStr: formatDate(now)
      }
    })
    member.currentPoints = 0
  }
  return member
}

// 检查是否管理员（从 admins 集合查询）
async function checkAdmin(openid) {
  try {
    const res = await db.collection('admins').where({ openid }).get()
    return res.data.length > 0
  } catch (e) {
    return false
  }
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function pad(n) { return n < 10 ? '0' + n : '' + n }
