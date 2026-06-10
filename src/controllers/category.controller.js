const pool = require('../config/db');
const { success, fail } = require('../utils/response');

exports.h5List = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        id,
        name,
        icon,
        parent_id AS parentId,
        sort,
        status
      FROM category
      WHERE parent_id = 0 AND status = 1
      ORDER BY sort ASC, id ASC`
    );
    success(res, rows);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get category list');
  }
};

exports.adminList = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        id,
        name,
        icon,
        parent_id AS parentId,
        sort,
        status
      FROM category
      ORDER BY parent_id ASC, sort ASC, id ASC`
    );
    success(res, rows);
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to get admin category list');
  }
};

exports.adminCreate = async (req, res) => {
  try {
    const {
      name,
      icon = '',
      parent_id: parentIdInput,
      parentId,
      sort: sortInput,
      status: statusInput
    } = req.body;

    if (!name || !String(name).trim()) {
      return fail(res, 'Category name is required', 400);
    }

    const parent_id = Number(parentIdInput ?? parentId ?? 0);
    const sort = Number(sortInput ?? 0);
    const status = Number(statusInput ?? 1);

    const [idRows] = await pool.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM category'
    );
    const id = idRows[0].nextId;

    const [result] = await pool.query(
      `INSERT INTO category
        (id, name, icon, parent_id, sort, status)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [id, String(name).trim(), icon, parent_id, sort, status]
    );

    success(res, {
      id: result.insertId || id,
      name: String(name).trim(),
      icon,
      parentId: parent_id,
      sort,
      status
    }, 'created');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to create category');
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const id = Number(req.body?.id ?? req.query.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Category id is required', 400);
    }

    const [children] = await pool.query(
      'SELECT id FROM category WHERE parent_id = ? LIMIT 1',
      [id]
    );

    if (children.length) {
      return fail(res, 'Cannot delete category with child categories', 400);
    }

    const [result] = await pool.query(
      'DELETE FROM category WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return fail(res, 'Category not found', 404);
    }

    success(res, { id }, 'deleted');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to delete category');
  }
};

exports.list = exports.h5List;
