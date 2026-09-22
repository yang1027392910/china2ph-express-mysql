-- Reconcile unused default rewards issued before live config synchronization.
-- Preserve redeemed coupons, bound orders, dates and statuses.
UPDATE user_coupon c
JOIN coupon_config cfg ON cfg.type = c.type
SET c.amount = cfg.amount
WHERE c.source = 1 AND c.type IN (1, 2)
  AND c.status <> 2 AND c.order_id IS NULL
  AND c.amount <> cfg.amount;
