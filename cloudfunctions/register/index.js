// cloudfunctions/register/index.js
// 新会员注册 - 生成会员编号 + 注册甜品券（7天有效期）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { name, phoneCode, birthMonth, birthDay } = event

  try {
    // 检查是否已注册
    const existing = await db.collection('members').where({ openid: OPENID }).get()
    if (existing.data.length > 0) {
      return { success: false, msg: '该用户已注册', member: existing.data[0] }
    }

    // 用 phoneCode 换手机号
    let phone = ''
    try {
      const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode })
      phone = phoneRes.phoneInfo.phoneNumber
    } catch (e) {
      // 不再 fallback 到 '未知号码'，返回错误让用户重新授权
      return { success: false, msg: '手机号获取失败，请重新授权', needReAuth: true }
    }

    if (!phone || phone === '') {
      return { success: false, msg: '手机号获取失败，请重新授权', needReAuth: true }
    }

    // 生成会员编号：SS + 8位顺序号
    let memberId = 'SS00000001'
    try {
      const maxRes = await db.collection('members')
        .orderBy('memberId', 'desc')
        .limit(1)
        .get()
      if (maxRes.data.length > 0 && maxRes.data[0].memberId) {
        const lastId = maxRes.data[0].memberId
        const num = parseInt(lastId.replace('SS', ''), 10)
        if (!isNaN(num)) {
          const nextNum = num + 1
          memberId = 'SS' + String(nextNum).padStart(8, '0')
        }
      }
    } catch (e) {
      console.error('memberId generation fallback, using default:', e)
    }

    const now = new Date()
    // 甜品券有效期：7天
    const giftExpire = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const member = {
      openid: OPENID,
      memberId,
      name,
      phone,
      birthMonth,
      birthDay,
      currentPoints: 0,
      cumulativePoints: 0,
      tier: 0,           // 0=普通 1=银卡 2=金卡
      registrationGiftUsed: false,
      registrationGiftExpire: giftExpire,
      joinDate: now,
      lastActivityDate: now,
      createTime: now
    }

    const addRes = await db.collection('members').add({ data: member })
    member._id = addRes._id

    // 记录注册赠品事务 - 含核销码 + 有效期
    const giftCode = 'DG' + String(Math.floor(100000 + Math.random() * 900000))
    await db.collection('transactions').add({
      data: {
        memberId: addRes._id,
        memberName: name,
        openid: OPENID,
        type: 'registration_gift',
        typeLabel: '注册赠品',
        pointsDelta: 0,
        note: '首次注册赠餐后甜品一份',
        giftCode: giftCode,
        giftRedeemed: false,
        giftExpireDate: giftExpire,
        createTime: now,
        dateStr: formatDate(now)
      }
    })

    return {
      success: true,
      member,
      giftCode,
      giftExpireDate: formatDate(giftExpire)
    }
  } catch (e) {
    console.error('register error:', e)
    return { success: false, msg: '注册失败：' + e.message }
  }
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function pad(n) { return n < 10 ? '0' + n : '' + n }
