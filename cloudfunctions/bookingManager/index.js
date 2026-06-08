// cloudfunctions/bookingManager/index.js
// 预订管理：创建/查询/核销/标记未到/释放押金/取消

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  // ── 创建预订 ──────────────────────────────────────
  if (action === 'createBooking') {
    const { name, phone, date, time, guests, table, zoneName, cap } = event
    if (!name || !phone || !date || !time || !guests || !table) {
      return { success: false, msg: '信息不完整' }
    }

    // 查会员
    const memberRes = await db.collection('members').where({ _openid: OPENID }).limit(1).get()
    const isMember = memberRes.data.length > 0
    const member = memberRes.data[0] || null

    // 判断是否需要押金
    let needsDeposit = false
    let depositAmount = 0
    
    if (!isMember) {
      // 非会员 → 押金
      needsDeposit = true
      depositAmount = 100
    } else {
      // 会员：查strikes和有消费记录
      const strikes = member.strikes || 0
      const cumulativePoints = member.cumulativePoints || 0
      
      if (strikes > 0) {
        // 有未到记录 → 押金
        needsDeposit = true
        depositAmount = 100
      } else if (cumulativePoints <= 0) {
        // 有会员身份但无消费记录 → 押金
        needsDeposit = true
        depositAmount = 100
      }
      // else: 有消费记录+无strike → 免押金
    }

    // 生成预订码 (6位)
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // 去掉易混淆的0/O/1/I
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }

    const now = new Date()
    const booking = {
      _openid: OPENID,
      name, phone, date, time,
      guests: parseInt(guests),
      table, zoneName, cap: cap || 4,
      code,
      memberId: isMember ? member._id : null,
      isMember,
      deposit: depositAmount,
      depositPaid: false,
      depositRelease: false,
      status: 'pending',
      strikeIncremented: false,
      source: 'weapp',
      createdAt: now,
      updatedAt: now,
      // 存储member快照信息（员工查看方便）
      memberSnap: isMember ? {
        name: member.name,
        phone: member.phone,
        tier: member.cumulativePoints >= 10000 ? 2 : member.cumulativePoints >= 5000 ? 1 : 0
      } : null
    }

    const res = await db.collection('bookings').add({ data: booking })

    return {
      success: true,
      bookingId: res._id,
      code,
      needsDeposit,
      depositAmount,
      isMember,
      msg: needsDeposit ? '需支付押金¥100' : '免押金，预订成功'
    }
  }

  // ── 获取我的预订（当前用户最近的） ─────────────────
  if (action === 'getMyBooking') {
    const res = await db.collection('bookings')
      .where({ _openid: OPENID })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    return { success: true, booking: res.data[0] || null }
  }

  // ── 取消预订（用户自己取消，仅限距预订时间≥2h） ────
  if (action === 'cancelBooking') {
    const { bookingId } = event
    if (!bookingId) return { success: false, msg: '缺少预订ID' }
    
    const res = await db.collection('bookings').doc(bookingId).get()
    const booking = res.data
    if (!booking) return { success: false, msg: '预订不存在' }
    if (booking._openid !== OPENID) return { success: false, msg: '无权操作' }
    if (booking.status !== 'pending') return { success: false, msg: '该预订状态无法取消' }

    // 检查是否提前≥2小时
    const bookingDateTime = new Date(`${booking.date}T${booking.time}:00`)
    const now = new Date()
    const hoursDiff = (bookingDateTime - now) / (1000 * 60 * 60)
    
    if (hoursDiff < 2) {
      return { success: false, msg: '距预订时间不足2小时，无法在线取消，请联系店方 18690550336' }
    }

    await db.collection('bookings').doc(bookingId).update({
      data: { status: 'cancelled', updatedAt: new Date() }
    })

    // 如果付了押金，自动退返（标记待退，员工后台处理）
    if (booking.depositPaid) {
      await db.collection('bookings').doc(bookingId).update({
        data: { depositRelease: true, depositReleaseMethod: 'auto_cancel' }
      })
    }

    return { success: true, msg: '已取消' }
  }

  // ── 管理员操作 ────────────────────────────────────
  // 验证管理员
  const adminRes = await db.collection('admins').where({ openid: OPENID }).get()
  const isAdmin = adminRes.data.length > 0
  if (!isAdmin && ['listBookings','markArrived','markNoShow','releaseDeposit','getMemberStrikes'].includes(action)) {
    return { success: false, msg: '无管理员权限' }
  }

  // ── 获取预订列表（按日期） ─────────────────────────
  if (action === 'listBookings') {
    const { date } = event
    const match = date ? { date } : {}
    const res = await db.collection('bookings')
      .where(match)
      .orderBy('date', 'desc')
      .orderBy('time', 'asc')
      .get()
    return { success: true, list: res.data }
  }

  // ── 标记到店 ───────────────────────────────────────
  if (action === 'markArrived') {
    const { bookingId } = event
    await db.collection('bookings').doc(bookingId).update({
      data: { status: 'arrived', updatedAt: new Date() }
    })
    return { success: true, msg: '已标记到店' }
  }

  // ── 标记未到（strike+1） ──────────────────────────
  if (action === 'markNoShow') {
    const { bookingId } = event
    const res = await db.collection('bookings').doc(bookingId).get()
    const booking = res.data
    if (!booking) return { success: false, msg: '预订不存在' }
    
    // 更新预订状态
    await db.collection('bookings').doc(bookingId).update({
      data: { status: 'no-show', updatedAt: new Date() }
    })

    // 如果是会员，strike+1
    if (booking.memberId) {
      await db.collection('members').doc(booking.memberId).update({
        data: { strikes: _.inc(1) }
      })
    }

    return { success: true, msg: '已标记未到，会员strike+1' }
  }

  // ── 释放押金（员工手动） ───────────────────────────
  if (action === 'releaseDeposit') {
    const { bookingId } = event
    await db.collection('bookings').doc(bookingId).update({
      data: { depositRelease: true, depositReleaseMethod: 'manual', updatedAt: new Date() }
    })
    return { success: true, msg: '押金已释放' }
  }

  // ── 获取会员strike信息 ─────────────────────────────
  if (action === 'getMemberStrikes') {
    const { memberId } = event
    if (!memberId) {
      // 查自己
      const mRes = await db.collection('members').where({ _openid: OPENID }).limit(1).get()
      if (mRes.data.length === 0) return { success: false, msg: '非会员' }
      return { success: true, strikes: mRes.data[0].strikes || 0, cumulativePoints: mRes.data[0].cumulativePoints || 0 }
    }
    const mRes = await db.collection('members').doc(memberId).get()
    return { success: true, strikes: mRes.data.strikes || 0, cumulativePoints: mRes.data.cumulativePoints || 0 }
  }

  return { success: false, msg: '未知操作' }
}
