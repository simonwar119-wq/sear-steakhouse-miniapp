// cloudfunctions/ocrAndAddPoints/index.js
// OCR识别小票 + 自动加积分（三重去重防刷分）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ⚠️ 重要：正式环境请改用 微信云开发环境变量
// 微信云开发控制台 → 环境 → 环境变量 → 添加 TENCENT_SECRET_ID / TENCENT_SECRET_KEY
const SECRET_ID = process.env.TENCENT_SECRET_ID || ''
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || ''

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { fileID } = event

  if (!fileID) return { success: false, msg: '缺少图片fileID' }

  try {
    // ── 1. 获取会员信息 ──
    const memberRes = await db.collection('members').where({ openid: OPENID }).get()
    if (memberRes.data.length === 0) return { success: false, msg: '请先注册会员' }
    const member = memberRes.data[0]

    // ── 2. 三重去重 ──

    // 2a. 按 fileID 精确去重（同一张图片只能上传一次）
    const dupByFileID = await db.collection('transactions')
      .where({ receiptFileID: fileID }).limit(1).get()
    if (dupByFileID.data.length > 0) {
      return { success: false, msg: '该小票已上传过', duplicate: true }
    }

    // 2b. 下载图片，计算 MD5（防改文件名重复上传）
    const fileRes = await cloud.downloadFile({ fileID })
    const fileContent = fileRes.fileContent
    const CryptoJS = require('crypto-js')
    const md5 = CryptoJS.MD5(fileContent.toString('base64')).toString()

    const dupByMD5 = await db.collection('transactions')
      .where({ receiptMD5: md5 }).limit(1).get()
    if (dupByMD5.data.length > 0) {
      return { success: false, msg: '该小票图片已上传过', duplicate: true }
    }

    // 下载完成后释放内存
    fileContent = null

    // ── 3. OCR 识别 ──
    // 直接使用腾讯云 OCR API（无需额外 SDK）
    const amount = await recognizeAmount(fileID)
    if (!amount || amount <= 0) {
      return { success: false, msg: '未能识别小票金额，请重拍或联系员工手动录入' }
    }

    // 2c. 同一会员 + 相同金额 + 48小时内（原6小时太短）
    const dupByAmount = await db.collection('transactions')
      .where({
        memberId: member._id,
        amount: amount,
        createTime: _.gte(new Date(Date.now() - 48 * 60 * 60 * 1000))
      }).limit(1).get()
    if (dupByAmount.data.length > 0) {
      return { success: false, msg: '该笔消费已记录过积分（相同金额48小时内）', duplicate: true }
    }

    // ── 4. 计算积分（1元=1分） ──
    const pointsToAdd = Math.floor(amount)

    const now = new Date()
    const newCurrent = (member.currentPoints || 0) + pointsToAdd
    const newCumulative = (member.cumulativePoints || 0) + pointsToAdd

    // 计算等级（银卡=5000累计，金卡=10000累计）
    let newTier = member.tier || 0
    if (newCumulative >= 10000) newTier = 2
    else if (newCumulative >= 5000) newTier = 1

    // ── 5. 写数据库（原子操作：用事务或顺序执行） ──
    await db.collection('members').doc(member._id).update({
      data: {
        currentPoints: newCurrent,
        cumulativePoints: newCumulative,
        tier: newTier,
        lastActivityDate: now
      }
    })

    await db.collection('transactions').add({
      data: {
        memberId: member._id,
        memberName: member.name,
        openid: OPENID,
        type: 'receipt_ocr',
        typeLabel: '小票积分',
        pointsDelta: pointsToAdd,
        amount: amount,
        note: `OCR识别消费 ¥${amount}`,
        receiptFileID: fileID,
        receiptMD5: md5,
        createTime: now,
        dateStr: formatDate(now)
      }
    })

    return {
      success: true,
      pointsAdded: pointsToAdd,
      currentPoints: newCurrent,
      cumulativePoints: newCumulative,
      tier: newTier,
      amount: amount
    }
  } catch (e) {
    console.error('ocrAndAddPoints error:', e)
    return { success: false, msg: '处理失败：' + e.message }
  }
}

// ── OCR 识别金额（调用腾讯云通用OCR API） ──
async function recognizeAmount(fileID) {
  const crypto = require('crypto')
  const https = require('https')

  // 获取图片临时下载链接
  const tempFileURLRes = await cloud.getTempFileURL({
    fileList: [fileID]
  })
  const imgUrl = tempFileURLRes.fileList[0].tempFileURL
  if (!imgUrl) throw new Error('获取图片临时URL失败')

  // 下载图片并转 base64
  const fileRes = await cloud.downloadFile({ fileID })
  const base64 = fileRes.fileContent.toString('base64')

  // 腾讯云 OCR API 调用
  const endpoint = 'ocr.tencentcloudapi.com'
  const service = 'ocr'
  const host = endpoint
  const region = 'ap-guangzhou'
  const action = 'GeneralBasicOCR'
  const version = '2018-11-19'
  const timestamp = Math.floor(Date.now() / 1000)

  // 构建请求参数
  const params = {
    ImageBase64: base64
  }

  // 签名（TC3-HMAC-SHA256）
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const payload = JSON.stringify(params)
  const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`

  const date = new Date(timestamp * 1000).toISOString().split('T')[0]
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

  const secretDate = crypto.createHmac('sha256', 'TC3' + SECRET_KEY).update(date).digest()
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  // 发送请求
  const response = await new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': version,
        'X-TC-Region': region,
        'Authorization': authorization
      }
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('解析OCR响应失败')) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })

  if (response.Response && response.Response.TextDetections) {
    const texts = response.Response.TextDetections.map(t => t.DetectedText).join(' ')
    return parseAmount(texts)
  }
  return null
}

// ── 金额解析（支持多种小票格式） ──
function parseAmount(text) {
  if (!text) return null

  // 匹配模式，按优先级从高到低
  const patterns = [
    /实收[：:]\s*¥?([\d,]+\.?\d*)/,
    /实付[：:]\s*¥?([\d,]+\.?\d*)/,
    /应收[：:]\s*¥?([\d,]+\.?\d*)/,
    /合计[：:]\s*¥?([\d,]+\.?\d*)/,
    /总计[：:]\s*¥?([\d,]+\.?\d*)/,
    /小计[：:]\s*¥?([\d,]+\.?\d*)/,
    /微信支付[：:\s]*¥?([\d,]+\.?\d*)/,
    /支付宝[：:\s]*¥?([\d,]+\.?\d*)/,
    /网付[：:]\s*¥?([\d,]+\.?\d*)/,
    /消费金额[：:]\s*¥?([\d,]+\.?\d*)/,
    /订单金额[：:]\s*¥?([\d,]+\.?\d*)/,
    /¥\s*([\d,]+\.\d{2})\s*$/m,
    /([\d,]+\.\d{2})\s*$/m,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const num = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(num) && num > 0) return num
    }
  }
  return null
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function pad(n) { return n < 10 ? '0' + n : '' + n }
