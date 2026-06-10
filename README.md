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
- POST /api/admin/login
- GET /api/admin/category/list
- GET /api/admin/product/list
- POST /api/admin/product/list/created
- GET /api/home/hot
- POST /api/profit/calculate
