const pool = require('../config/db');
const { success, fail } = require('../utils/response');

exports.calculate = async (req, res) => {
  try {
    const {
      productId,
      productCost,
      quantity,
      weightPerItem,
      shippingMethod,
      shippingCost,
      otherFee,
      sellingPrice
    } = req.body;

    const cost = Number(productCost || 0);
    const qty = Number(quantity || 1);
    const ship = Number(shippingCost || 0);
    const other = Number(otherFee || 0);
    const sell = Number(sellingPrice || 0);

    const totalCost = cost * qty + ship + other;
    const revenue = sell * qty;
    const estimatedProfit = revenue - totalCost;
    const profitMargin = revenue > 0 ? Number(((estimatedProfit / revenue) * 100).toFixed(2)) : 0;

    const [result] = await pool.query(
      `INSERT INTO profit_calculation 
      (product_id, product_cost, quantity, weight_per_item, shipping_method, shipping_cost, other_fee, total_cost, selling_price, estimated_profit, profit_margin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId || null,
        cost,
        qty,
        Number(weightPerItem || 0),
        shippingMethod || '',
        ship,
        other,
        totalCost,
        sell,
        estimatedProfit,
        profitMargin
      ]
    );

    success(res, {
      id: result.insertId,
      totalCost,
      estimatedProfit,
      profitMargin
    });
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to calculate profit');
  }
};
