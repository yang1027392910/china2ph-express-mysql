const pool = require('../config/db');
const { success, fail } = require('../utils/response');

function positiveId(value) {
  const id = Number(value);
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(id) ? id : 0;
}

async function updatePayment(req, res, approve) {
  const role = approve ? 'admin' : 'h5';
  if (!req.user?.id || req.user.role !== role) return fail(res, 'Forbidden', 403);
  const body = req.body || {};
  const orderId = positiveId(body.orderId);
  if (!orderId) return fail(res, 'Valid orderId is required', 400);
  let paymentMethod, paymentReference;
  if (!approve) {
    if (![1, 2, '1', '2'].includes(body.paymentMethod)) {
      return fail(res, 'paymentMethod must be 1 (GCash) or 2 (Maya)', 400);
    }
    paymentMethod = Number(body.paymentMethod);
    if (typeof body.referenceNo !== 'string' || !body.referenceNo.trim() || [...body.referenceNo.trim()].length > 100) {
      return fail(res, 'referenceNo must contain 1 to 100 characters', 400);
    }
    paymentReference = body.referenceNo.trim();
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[order]] = await connection.query(
      `SELECT id AS orderId, status, payment_status AS paymentStatus,
        payment_method AS paymentMethod, payment_reference AS paymentReference
       FROM \`order\` WHERE id = ?${approve ? '' : ' AND user_id = ?'} FOR UPDATE`,
      approve ? [orderId] : [orderId, req.user.id]
    );
    if (!order) {
      await connection.rollback();
      return fail(res, 'Order not found', 404);
    }
    const status = Number(order.status);
    const paymentStatus = Number(order.paymentStatus ?? 0);
    // Repeated approval is safe, but a payment submission cannot reset a paid order.
    if (approve && paymentStatus === 2 && status === 3) {
      await connection.commit();
      return success(res, order, 'approved');
    }
    if ([3, 4].includes(status) || paymentStatus === 2) {
      await connection.rollback();
      return fail(res, 'Order is completed, cancelled, or already paid', 409);
    }
    if (approve) {
      if (paymentStatus !== 1) {
        await connection.rollback();
        return fail(res, 'Payment is not pending review', 409);
      }
      await connection.query(
        'UPDATE `order` SET payment_status = 2, status = 3, updated_at = NOW() WHERE id = ?',
        [orderId]
      );
      order.paymentStatus = 2;
      order.status = 3;
    } else {
      await connection.query(
        'UPDATE `order` SET payment_status = 1, payment_method = ?, payment_reference = ?, updated_at = NOW() WHERE id = ?',
        [paymentMethod, paymentReference, orderId]
      );
      order.paymentStatus = 1;
      order.paymentMethod = paymentMethod;
      order.paymentReference = paymentReference;
    }
    await connection.commit();
    success(res, order, approve ? 'approved' : 'Payment submitted for review');
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    fail(res, 'Failed to update order payment');
  } finally {
    if (connection) connection.release();
  }
}

exports.pay = (req, res) => updatePayment(req, res, false);
exports.approve = (req, res) => updatePayment(req, res, true);
