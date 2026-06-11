const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const h5CategoryRoutes = require('./routes/h5.category.routes');
const h5ProductRoutes = require('./routes/h5.product.routes');
const h5HotProductRoutes = require('./routes/h5.hotProduct.routes');
const h5LogisticsSupplierRoutes = require('./routes/h5.logisticsSupplier.routes');
const h5FavoriteRoutes = require('./routes/h5.favorite.routes');
const h5BannerRoutes = require('./routes/h5.banner.routes');
const h5ProcurementContactRoutes = require('./routes/h5.procurementContact.routes');
const h5AuthRoutes = require('./routes/h5.auth.routes');
const adminAuthRoutes = require('./routes/admin.auth.routes');
const adminCategoryRoutes = require('./routes/admin.category.routes');
const adminProductRoutes = require('./routes/admin.product.routes');
const adminHotProductRoutes = require('./routes/admin.hotProduct.routes');
const adminLogisticsSupplierRoutes = require('./routes/admin.logisticsSupplier.routes');
const adminBannerRoutes = require('./routes/admin.banner.routes');
const adminProcurementContactRoutes = require('./routes/admin.procurementContact.routes');
const adminUploadRoutes = require('./routes/admin.upload.routes');
const adminUserRoutes = require('./routes/admin.user.routes');
const adminEmailCodeLogRoutes = require('./routes/admin.emailCodeLog.routes');
const homeRoutes = require('./routes/home.routes');
const profitRoutes = require('./routes/profit.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/', (req, res) => {
  res.json({ code: 200, message: 'China2PH API is running' });
});

app.use('/api/h5/category', h5CategoryRoutes);
app.use('/api/h5/product', h5ProductRoutes);
app.use('/api/h5/hotProduct', h5HotProductRoutes);
app.use('/api/h5/logisticsSupplier', h5LogisticsSupplierRoutes);
app.use('/api/h5/favorite', h5FavoriteRoutes);
app.use('/api/h5/banner', h5BannerRoutes);
app.use('/api/h5/procurement-contact', h5ProcurementContactRoutes);
app.use('/api/h5', h5AuthRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminUploadRoutes);
app.use('/api/admin/category', adminCategoryRoutes);
app.use('/api/admin/product', adminProductRoutes);
app.use('/api/admin/hotProduct', adminHotProductRoutes);
app.use('/api/admin/logisticsSupplier', adminLogisticsSupplierRoutes);
app.use('/api/admin/banner', adminBannerRoutes);
app.use('/api/admin/procurement-contact', adminProcurementContactRoutes);
app.use('/api/admin/user', adminUserRoutes);
app.use('/api/admin/emailCodeLog', adminEmailCodeLogRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/profit', profitRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running: http://localhost:${port}`);
});
