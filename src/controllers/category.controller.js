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

exports.adminUpdate = async (req, res) => {
  try {
    const body = req.body || {};
    const id = Number(body.id ?? req.params.id);

    if (!id) {
      return fail(res, 'Category id is required', 400);
    }

    const fields = [];
    const params = [];

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return fail(res, 'Category name is required', 400);
      fields.push('name = ?');
      params.push(name);
    }

    if (body.icon !== undefined) {
      fields.push('icon = ?');
      params.push(String(body.icon ?? ''));
    }

    const parentIdInput = body.parentId ?? body.parent_id;
    if (parentIdInput !== undefined) {
      fields.push('parent_id = ?');
      params.push(Number(parentIdInput));
    }

    if (body.sort !== undefined) {
      fields.push('sort = ?');
      params.push(Number(body.sort));
    }

    if (body.status !== undefined) {
      fields.push('status = ?');
      params.push(Number(body.status));
    }

    if (!fields.length) {
      return fail(res, 'No category fields to update', 400);
    }

    params.push(id);

    const [result] = await pool.query(
      `UPDATE category
      SET ${fields.join(', ')}
      WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return fail(res, 'Category not found', 404);
    }

    const [[updated]] = await pool.query(
      `SELECT
        id,
        name,
        icon,
        parent_id AS parentId,
        sort,
        status
      FROM category
      WHERE id = ?`,
      [id]
    );

    success(res, updated, 'updated');
  } catch (error) {
    console.error(error);
    fail(res, 'Failed to update category');
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
