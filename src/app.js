const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const h5CategoryRoutes = require('./routes/h5.category.routes');
const h5ProductRoutes = require('./routes/h5.product.routes');
const h5HotProductRoutes = require('./routes/h5.hotProduct.routes');
const h5AuthRoutes = require('./routes/h5.auth.routes');
const adminAuthRoutes = require('./routes/admin.auth.routes');
const adminCategoryRoutes = require('./routes/admin.category.routes');
const adminProductRoutes = require('./routes/admin.product.routes');
const adminHotProductRoutes = require('./routes/admin.hotProduct.routes');
const adminUploadRoutes = require('./routes/admin.upload.routes');
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
app.use('/api/h5', h5AuthRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminUploadRoutes);
app.use('/api/admin/category', adminCategoryRoutes);
app.use('/api/admin/product', adminProductRoutes);
app.use('/api/admin/hotProduct', adminHotProductRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/profit', profitRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running: http://localhost:${port}`);
});
