# China2PH Express + MySQL Mock API

## Install

```bash
npm install
cp .env.example .env
```

Create database:

```sql
CREATE DATABASE china2ph DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Init tables and seed data:

```bash
npm run init-db
```

Run:

```bash
npm run dev
```

## APIs

- GET /api/h5/category/list
- GET /api/h5/product/list?categoryId=3&page=1&pageSize=10&keyword=shoes
- GET /api/h5/logisticsSupplier/list?page=1&pageSize=10&keyword=海运
- GET /api/h5/banner/list?page=1&pageSize=10&scene=home
- GET /api/h5/procurement-contact/list?page=1&pageSize=10&contactType=messenger
- POST /api/h5/favorite/click
  body: `{ "productId": 1 }`
- GET /api/h5/favorite/list?page=1&pageSize=10
- POST /api/h5/email-code/send
- POST /api/h5/email-code/login
- POST /api/admin/login
- GET /api/admin/category/list
- GET /api/admin/product/list
- POST /api/admin/product/list/created
- GET /api/admin/logisticsSupplier/list?page=1&pageSize=10&keyword=海运&status=1
- POST /api/admin/logisticsSupplier/list/created
  body: `{ "name": "顺丰海运", "logo": "/uploads/logo.png", "shippingMethod": "海运", "deliveryTime": "7-15天", "unitPrice": 12.5, "pricingMethod": "按kg", "sort": 1, "status": 1 }`
- GET /api/admin/banner/list?page=1&pageSize=10&keyword=首页&status=1&scene=home
- POST /api/admin/banner/list/created
  body: `{ "title": "首页大促", "subtitle": "限时优惠", "image": "/uploads/banner.png", "scene": "home", "actionType": "product", "actionValue": "1001", "sort": 1, "status": 1, "startTime": "2026-06-11 00:00:00", "endTime": "2026-06-30 23:59:59" }`
- POST /api/admin/banner/list/dele
  body: `{ "id": 1 }`
- GET /api/admin/procurement-contact/list?page=1&pageSize=10&contactType=messenger&status=1
- POST /api/admin/procurement-contact/create
  body: `{ "contactType": "messenger", "contactValue": "m.me/YiwuHub", "description": "Most popular messaging app in the Philippines", "sort": 1, "status": 1 }`
- PUT /api/admin/procurement-contact/update
  body: `{ "id": 1, "contactType": "whatsapp", "contactValue": "+639000000000", "description": "WhatsApp contact", "sort": 2, "status": 1 }`
- DELETE /api/admin/procurement-contact/delete/:id
- GET /api/admin/user/list?page=1&pageSize=10&keyword=test&status=1
- GET /api/admin/user/detail/:id
- POST /api/admin/user/list/created
- POST /api/admin/user/list/update
- POST /api/admin/user/list/status
- POST /api/admin/user/list/dele
- GET /api/admin/emailCodeLog/list?page=1&pageSize=10&keyword=test&scene=login&status=0&sendStatus=1
- GET /api/admin/emailCodeLog/detail/:id
- POST /api/admin/emailCodeLog/list/dele
- GET /api/home/hot
- POST /api/profit/calculate
