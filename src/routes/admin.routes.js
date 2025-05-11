const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

// Middleware to check if user is an admin
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

// Apply admin middleware to all routes
router.use(isAdmin);

// Get admin dashboard data
router.get('/dashboard', async (req, res, next) => {
    try {
        // Get platform statistics
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
                (SELECT COUNT(*) FROM users WHERE role = 'tutor') as total_tutors,
                (SELECT COUNT(*) FROM tutorials) as total_tutorials,
                (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as new_users_24h
        `);

        // Get recent activities
        const [recentActivity] = await pool.query(`
            SELECT a.*, u.name as user_name, u.role as user_role
            FROM activities a
            JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT 10
        `);

        res.json({
            stats: stats[0],
            recentActivity
        });
    } catch (error) {
        next(error);
    }
});

// Get all users with pagination
router.get('/users', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const role = req.query.role;
        const status = req.query.status;

        let query = 'SELECT id, name, email, role, status, created_at FROM users';
        const params = [];

        if (role || status) {
            query += ' WHERE';
            if (role) {
                query += ' role = ?';
                params.push(role);
            }
            if (status) {
                query += role ? ' AND' : '';
                query += ' status = ?';
                params.push(status);
            }
        }

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM (${query}) as t`,
            params
        );
        const total = countResult[0].total;

        // Get paginated results
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [users] = await pool.query(query, params);

        res.json({
            users,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get user details
router.get('/users/:userId', async (req, res, next) => {
    try {
        const { userId } = req.params;
        const [users] = await pool.query(
            'SELECT id, name, email, role, status, created_at, education_level, grade, specialization, experience, bio FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        next(error);
    }
});

// Update user
router.put('/users/:userId', [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('role').optional().isIn(['student', 'tutor', 'admin']).withMessage('Invalid role'),
    body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
    body('educationLevel').optional().isIn(['school', 'college', 'university']),
    body('grade').optional().isString(),
    body('specialization').optional().isString(),
    body('experience').optional().isInt({ min: 0 }),
    body('bio').optional().isString()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { userId } = req.params;
        const updateData = req.body;

        // Check if user exists
        const [existingUsers] = await pool.query(
            'SELECT id FROM users WHERE id = ?',
            [userId]
        );

        if (existingUsers.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user
        const [result] = await pool.query(
            'UPDATE users SET ? WHERE id = ?',
            [updateData, userId]
        );

        // Log activity
        await pool.query(
            'INSERT INTO activities (user_id, type, action, reference_id) VALUES (?, ?, ?, ?)',
            [req.user.id, 'user', 'update', userId]
        );

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        next(error);
    }
});

// Delete user
router.delete('/users/:userId', async (req, res, next) => {
    try {
        const { userId } = req.params;

        // Check if user exists
        const [existingUsers] = await pool.query(
            'SELECT id FROM users WHERE id = ?',
            [userId]
        );

        if (existingUsers.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete user
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);

        // Log activity
        await pool.query(
            'INSERT INTO activities (user_id, type, action, reference_id) VALUES (?, ?, ?, ?)',
            [req.user.id, 'user', 'delete', userId]
        );

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// Update user status
router.put('/users/:userId/status', [
    body('status').isIn(['active', 'suspended', 'banned']).withMessage('Invalid status')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { userId } = req.params;
        const { status } = req.body;

        const [result] = await pool.query(
            'UPDATE users SET status = ? WHERE id = ?',
            [status, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Log activity
        await pool.query(
            'INSERT INTO activities (user_id, type, action, reference_id) VALUES (?, ?, ?, ?)',
            [req.user.id, 'user', 'status_update', userId]
        );

        res.json({ message: 'User status updated successfully' });
    } catch (error) {
        next(error);
    }
});

// Get pending tutorials
router.get('/tutorials/pending', async (req, res, next) => {
    try {
        const [tutorials] = await pool.query(`
            SELECT t.*, u.name as tutor_name
            FROM tutorials t
            JOIN users u ON t.tutor_id = u.id
            WHERE t.status = 'pending'
            ORDER BY t.created_at DESC
        `);

        res.json(tutorials);
    } catch (error) {
        next(error);
    }
});

// Approve or reject tutorial
router.put('/tutorials/:tutorialId/status', [
    body('status').isIn(['approved', 'rejected']).withMessage('Invalid status'),
    body('reason').optional().trim()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { tutorialId } = req.params;
        const { status, reason } = req.body;

        const [result] = await pool.query(
            'UPDATE tutorials SET status = ? WHERE id = ?',
            [status, tutorialId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Tutorial not found' });
        }

        // Log activity
        await pool.query(
            'INSERT INTO activities (user_id, type, action, reference_id) VALUES (?, ?, ?, ?)',
            [req.user.id, 'tutorial', status, tutorialId]
        );

        res.json({ message: `Tutorial ${status} successfully` });
    } catch (error) {
        next(error);
    }
});

// Get system health
router.get('/system/health', async (req, res, next) => {
    try {
        // Get database status
        const [dbStatus] = await pool.query('SELECT 1');
        
        // Get storage usage
        const [storageStats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM materials) as total_materials,
                (SELECT COUNT(*) FROM tutorials) as total_tutorials
        `);

        res.json({
            status: 'healthy',
            database: dbStatus ? 'connected' : 'disconnected',
            storage: storageStats[0]
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router; 