# Coupon 后端模块

## 迁移与部署

SQL：`src/scripts/migrations/20260922-coupon.sql`。

部署应用前，在目标环境执行一次：

```powershell
node src/scripts/migrate-coupon.js --env=.env.local
# 生产环境部署时使用 --env=.env.production
```

迁移创建 InnoDB `coupon_config`、`user_coupon`，默认配置为 REGISTER 20.00、VERIFY 40.00、有效期 30 天；仅在缺少时增加 `order.user_coupon_id`。可以重复执行，不覆盖管理员已调整的配置。SQL 可直接在已选择业务数据库的同一 MySQL 会话执行。DDL 有隐式提交，按既有迁移方式部署。

本次开发只在独立随机测试库执行了迁移，没有对业务数据库执行迁移。不要用 `init-db` 迁移已有业务库：该项目原有初始化脚本会清理部分商品数据。新库初始化已接入优惠券迁移。

关键字段：金额 `DECIMAL(10,2)`，时间使用数据库 `NOW()` / `DATE_ADD`，数据库字段 snake_case。user_coupon 包含 user_id、type、amount、status、source、order_id、activated_at、expired_at、used_at、remark、created_at、updated_at 及需求中的五个索引。没有 `(user_id,type)` 普通唯一约束。

## API

沿用项目 `/api` 前缀及响应 `{ code: 0, message, data }`，失败使用 HTTP 状态码及 `{ code, message, data: null }`。使用现有 Bearer Token。优惠券金额按 mysql2 DECIMAL 默认行为返回两位小数字符串；订单既有金额响应仍为 JSON number，计算和写库不使用浮点运算。

| 方法 | 完整路径 | 参数或响应 |
| --- | --- | --- |
| GET | /api/admin/coupon/config | 两条配置：id/type/typeName/amount/validDays/enabled |
| PUT | /api/admin/coupon/config/:id | amount >= 0、validDays 正整数、enabled 布尔；禁止修改 type |
| GET | /api/admin/coupon/user/list | keyword/type/status/source/startDate/endDate/page/pageSize |
| GET | /api/admin/coupon/user/:id | 券信息、email/nickname/avatar、orderId |
| POST | /api/admin/coupon/send | userId/amount > 0/validDays/remark；强制 type=3/source=2/status=1 |
| PUT | /api/admin/coupon/user/:id/disable | 仅允许 Locked、未过期 Available → Disabled |
| GET | /api/h5/coupon/rewards | registration/verification/availableCount；没有已发奖励则为 null |
| GET | /api/h5/coupon/list | status/page/pageSize，仅当前用户 |
| GET | /api/h5/coupon/available | orderAmount 必填，返回可用券及封顶 discountAmount 预览 |
| POST | /api/h5/order/create | 原参数 + 可空 userCouponId；支持 cartIds |

没有优惠券 DELETE 路由。Admin 使用原 adminAuth；H5 使用原 auth，并要求 h5 角色，拒绝 query/body 中的 userId/user_id。

分页默认 page=1、pageSize=10，pageSize 最大 100。startDate/endDate 使用 YYYY-MM-DD，按创建时间查询，含结束日全天。用户表没有 username，因此 keyword 匹配精确 userId、email 或已有 nickname。amount 最大 99999999.99，最多两位小数；validDays 限 1～365000；remark 最长 255 字符。

下单示例：

```json
{"cartIds":[1,2],"deliveryType":1,"userCouponId":10001,"remark":""}
```

也保留原 `items: [{ productId, quantity }]` 直接购买，未提供 items/cartIds 时使用当前用户已勾选购物车。cartIds 与 items 不能混用；购物车 ID 必须全部属于当前用户且商品可用。只清理实际购买的购物车行。

## 事务与业务

- H5 邮箱首次登录注册，以及管理员创建用户，在用户创建事务内发奖励：REGISTER Available，VERIFY Locked。配置关闭则不生成对应券。现有用户普通登录不补发历史奖励。
- 发奖励先锁 user 行，再以当前读检查 source=System 的 REGISTER/VERIFY。并发重复调用也只发一次；后台 SYSTEM 类型允许多张。奖励服务必须传入调用方的事务 connection。
- 认证审核通过在原审核事务中，仅把 VERIFY/source=System/status=Locked 激活，使用激活时配置的 valid_days。未使用的默认奖励金额随后台配置同步；已使用的券保留核销时金额；重复审核不会重新发券或刷新有效期。关闭配置停止新发券，已发 Locked 券仍可认证激活。
- 查询用 SQL CASE 将 Available 且 expired_at <= NOW() 显示并过滤为 Expired；不依赖定时任务，不改写 Used/Disabled。可用列表、数量和实际使用均检查实时有效期。
- 下单在原事务中读取商品价格并累计总额，FOR UPDATE 锁券，校验归属、状态、到期时间和未绑定订单。锁取得后刷新数据库时间；核销 UPDATE 再次校验有效期。
- discount_amount = min(total_amount, coupon.amount)，pay_amount = total_amount - discount_amount + shipping_fee。整数分 BigInt 做精确计算，DECIMAL 字符串写入数据库；拒绝超出 DECIMAL 范围的金额。
- order、order_item、券 USED/order_id/used_at 和购物车清理同事务提交，任一步异常全部回滚。
- 原项目没有服务端运费规则；shipping_fee 使用原默认 0.00。忽略前端 price/totalAmount/discountAmount/couponAmount/payAmount/shippingFee，服务端定价。若需要收费运费，应后续接入实际服务端运费规则。
- 管理员修改订单明细数量时锁订单并精确重新计算优惠封顶，保证金额关系。订单取消沿用原逻辑，不自动返券；需求未定义返券规则。

## 文件清单

新增：

- src/controllers/coupon.controller.js
- src/services/coupon.service.js
- src/utils/money.js
- src/routes/admin.coupon.routes.js
- src/routes/h5.coupon.routes.js
- src/scripts/migrate-coupon.js
- src/scripts/migrations/20260922-coupon.sql
- tests/coupon.test.js
- tests/coupon.mysql.test.js
- docs/coupon.md

修改：

- src/app.js：挂载两组路由。
- src/controllers/auth.controller.js：首次注册发券。
- src/controllers/user.controller.js：管理员创建用户事务发券。
- src/controllers/userVerification.controller.js：审核通过激活奖励。
- src/controllers/order.controller.js：券接入、cartIds、精确金额、金额防篡改及订单修改时封顶。
- src/scripts/init-db.js：初始化接入迁移。
- package.json：test、migrate:coupon 命令。

原工作区已有未提交的订单、购物车和路由改动均保留。项目是 Express + mysql2，无 ORM/独立 DTO/统一异常类，沿用 Controller、Service、原生 SQL、现有鉴权和 success/fail 规范；参数验证在 Controller 内，业务错误沿用 statusCode。

## 验证

```powershell
npm test
# 真实 MySQL 测试，默认从 .env.local 读取连接信息，环境变量可覆盖
$env:COUPON_MYSQL_TEST='1'
npm test
```

集成测试仅创建随机 `coupon_test_<16位hex>` 数据库，并在 finally 中删除同一个测试库；需要 MySQL CREATE/DROP DATABASE 权限，不读取或修改业务库的数据。未开启开关时自动跳过数据库测试。

已在 MySQL 8.0.45 验证 17 项测试全部通过（含父测试）：真实注册/审核接口、并发幂等、配置金额同步、重复派券、身份隔离、各种不可用状态、实时过期、并发核销、价格防篡改、购物车选择、精确小数、管理员改量、用户及订单失败回滚、迁移重复执行。故障注入测试会打印预期错误日志。

现有项目没有 lint/build 脚本；全 src JavaScript 已用 node --check 验证。测试使用 Node 内置 node:test，无新增依赖。


## 默认奖励金额同步（最新规则）

按用户最新确认，后台 PUT /api/admin/coupon/config/:id 修改金额时，同一事务同步该类型 source=System、status != Used 且未绑定订单的默认奖励券。状态、激活时间、到期时间保持原值；不重新激活过期或禁用券。管理员单独派发的 SYSTEM 类型券以及已使用券、历史订单不受影响。

历史未使用默认券通过 `src/scripts/migrations/20260922-coupon-reward-amount.sql` 对齐当前配置。该 SQL 可重复执行；本地业务库已执行。其他环境部署新版时也需执行一次。

Rewards、My Coupons、结算预览及实际下单均读取同步后的券金额，避免只改展示导致实际抵扣不一致。配置更新及券金额同步失败时一并回滚。
