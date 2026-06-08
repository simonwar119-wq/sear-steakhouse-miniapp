# SEAR STEAK 会员小程序 · 部署手册

## 项目结构

```
sear-steak-mini/
├── pages/
│   ├── index/          启动页（自动检测登录状态）
│   ├── register/       注册页（姓名+微信手机号+生日）
│   ├── home/           会员主页（积分/等级/记录）
│   ├── upload/         上传小票（OCR自动识分）
│   ├── rewards/        积分兑换（葡萄酒/折扣）
│   └── admin/          管理后台（审核/手动录入）
├── cloudfunctions/
│   ├── register/       注册云函数
│   ├── getMember/      获取会员信息 + 检查过期
│   ├── ocrAndAddPoints/ OCR识票 + 自动加积分
│   ├── redeemReward/   积分兑换
│   └── manualAddPoints/ 管理员操作
```

---

## 第一步：注册准备

1. 前往 [微信公众平台](https://mp.weixin.qq.com) 注册小程序账号（企业账号）
2. 记录你的 **AppID**
3. 在微信开发者工具中开通 **云开发**，记录 **环境ID**

---

## 第二步：修改配置

打开以下文件，替换对应内容：

| 文件 | 修改内容 |
|------|---------|
| `project.config.json` | `appid` 替换为你的 AppID |
| `app.js` | `YOUR_ENV_ID` 替换为云开发环境ID |
| `cloudfunctions/ocrAndAddPoints/index.js` | `YOUR_TENCENT_SECRET_ID` 和 `YOUR_TENCENT_SECRET_KEY` 替换为腾讯云密钥 |

---

## 第三步：开通腾讯云 OCR

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com)
2. 搜索「文字识别OCR」，开通**通用印刷体识别**（GeneralBasicOCR）
3. 在「访问管理 → 密钥管理」创建子账号密钥，获取 SecretId 和 SecretKey
4. 填入 `ocrAndAddPoints/index.js` 顶部

> 费用参考：通用OCR约 0.0015元/次，1000次/月免费

---

## 第四步：初始化数据库集合

在微信云开发控制台 → 数据库，创建以下集合并设置权限：

| 集合名 | 权限 |
|--------|------|
| `members` | 仅创建者可读写 |
| `transactions` | 仅创建者可读写 |
| `admins` | 管理端读写（需在控制台手动操作） |

---

## 第五步：添加管理员

在云开发数据库 → `admins` 集合，手动插入一条记录：

```json
{
  "openid": "你的微信openid",
  "name": "高牧洪",
  "role": "super_admin",
  "createTime": "2026-04-27"
}
```

**如何获取自己的 openid：**
在微信开发者工具中调试，进入任意页面后，在控制台运行：
```js
wx.cloud.callFunction({ name: 'getMember' }).then(r => console.log(r))
```
返回数据中会包含 openid（或在云函数日志中查看）。

---

## 第六步：部署云函数

在微信开发者工具中，右键每个云函数文件夹 → **上传并部署（云端安装依赖）**

需要部署的云函数：
- register
- getMember
- ocrAndAddPoints
- redeemReward
- manualAddPoints

---

## 第七步：生成扫码入口

小程序上线后，在微信公众平台 → 设置 → 小程序码，生成带参数的二维码：

- **餐桌二维码**：`pages/index/index`（直接进入注册流程）
- 可以打印放在桌面台卡上，或印在账单夹内页

---

## 会员规则总结

| 等级 | 触发条件（累计积分） | 特权 |
|------|---------------------|------|
| 普通会员 | 0 - 4,999 | 无折扣 |
| 银卡会员 | 累计满 5,000 | 永久全场9折 |
| 金卡会员 | 累计满 10,000 | 永久全场8.5折 |

- 消费1元 = 1积分，拍小票OCR自动录入
- 3,000积分可兑换阿图斯葡萄酒一瓶（¥368）
- 首次注册赠餐后甜品一份（当次出示领取）
- 1年无消费，当前积分自动清零（等级永久保留）
- 小票须在24小时内上传，超时联系员工手动录入

---

## 常见问题

**Q：OCR识别不准怎么办？**
A：小票字体太小或拍摄模糊时会失败。建议提示客人「确保金额和日期清晰可见」，失败时引导联系员工。

**Q：客户重复提交同一张小票？**
A：系统已做防重复检查（相同金额+6小时内），自动拦截并提示。

**Q：如何让员工使用管理后台？**
A：将员工的openid加入 `admins` 集合即可，他们打开小程序就能看到管理选项。

**Q：积分清零后等级还在吗？**
A：等级永久保留。1年清零的只是 `currentPoints`（当前可用积分），`cumulativePoints`（历史累计）不变，等级不降。
