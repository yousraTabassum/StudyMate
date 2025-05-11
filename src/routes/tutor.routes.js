const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

// Middleware to check if user is a tutor
const isTutor = (req, res, next) => {
    if (req.user.role !== 'tutor') {
        return res.status(403).json({ error: 'Access denied. Tutors only.' });
    }
    next();
};

// Apply tutor middleware to all routes
router.use(isTutor);

// Get tutor dashboard data
router.get('/dashboard', async (req, res, next) => {
    try {
        const tutorId = req.user.id;
        
        // Get statistics
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM tutorials WHERE tutor_id = ?) as total_tutorials,
                (SELECT COUNT(*) FROM tutorial_enrollments te 
                 JOIN tutorials t ON te.tutorial_id = t.id 
                 WHERE t.tutor_id = ?) as total_students,
                (SELECT AVG(rating) FROM tutorial_reviews tr 
                 JOIN tutorials t ON tr.tutorial_id = t.id 
                 WHERE t.tutor_id = ?) as average_rating
        `, [tutorId, tutorId, tutorId]);

        // Get recent enrollments
        const [recentEnrollments] = await pool.query(`
            SELECT te.*, t.title as tutorial_title, u.name as student_name
            FROM tutorial_enrollments te
            JOIN tutorials t ON te.tutorial_id = t.id
            JOIN users u ON te.student_id = u.id
            WHERE t.tutor_id = ?
            ORDER BY te.enrolled_at DESC
            LIMIT 5
        `, [tutorId]);

        res.json({
            stats: stats[0],
            recentEnrollments
        });
    } catch (error) {
        next(error);
    }
});

// Get tutor's tutorials
router.get('/tutorials', async (req, res, next) => {
    try {
        const [tutorials] = await pool.query(`
            SELECT t.*,
                (SELECT COUNT(*) FROM tutorial_enrollments WHERE tutorial_id = t.id) as enrolled_students,
                (SELECT AVG(rating) FROM tutorial_reviews WHERE tutorial_id = t.id) as average_rating
            FROM tutorials t
            WHERE t.tutor_id = ?
            ORDER BY t.created_at DESC
        `, [req.user.id]);

        res.json(tutorials);
    } catch (error) {
        next(error);
    }
});

// Create a new tutorial
router.post('/tutorials', [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('content').trim().notEmpty().withMessage('Content is required'),
    body('subject').trim().notEmpty().withMessage('Subject is required'),
    body('level').trim().notEmpty().withMessage('Level is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('type').isIn(['free', 'premium']).withMessage('Invalid tutorial type'),
    body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            title,
            description,
            content,
            subject,
            level,
            category,
            type,
            price
        } = req.body;

        const [result] = await pool.query(
            `INSERT INTO tutorials (
                tutor_id, title, description, content, subject, level, 
                category, type, price, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [req.user.id, title, description, content, subject, level, category, type, price]
        );

        // Log activity
        await pool.query(
            'INSERT INTO activities (user_id, type, action, reference_id) VALUES (?, ?, ?, ?)',
            [req.user.id, 'tutorial', 'create', result.insertId]
        );

        res.status(201).json({
            id: result.insertId,
            title,
            description,
            content,
            subject,
            level,
            category,
            type,
            price,
            status: 'pending'
        });
    } catch (error) {
        next(error);
    }
});

// Update a tutorial
router.put('/tutorials/:tutorialId', [
    body('title').optional().trim().notEmpty(),
    body('description').optional().trim().notEmpty(),
    body('content').optional().trim().notEmpty(),
    body('subject').optional().trim().notEmpty(),
    body('level').optional().trim().notEmpty(),
    body('category').optional().trim().notEmpty(),
    body('type').optional().isIn(['free', 'premium']),
    body('price').optional().isFloat({ min: 0 })
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { tutorialId } = req.params;
        const updates = req.body;

        // Check if tutorial belongs to tutor
        const [tutorials] = await pool.query(
            'SELECT id FROM tutorials WHERE id = ? AND tutor_id = ?',
            [tutorialId, req.user.id]
        );

        if (tutorials.length === 0) {
            return res.status(404).json({ error: 'Tutorial not found' });
        }

        // Build update query
        const updateFields = [];
        const values = [];
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                updateFields.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No valid updates provided' });
        }

        values.push(tutorialId);
        await pool.query(
            `UPDATE tutorials SET ${updateFields.join(', ')} WHERE id = ?`,
            values
        );

        // Log activity
        await pool.query(
            'INSERT INTO activities (user_id, type, action, reference_id) VALUES (?, ?, ?, ?)',
            [req.user.id, 'tutorial', 'update', tutorialId]
        );

        res.json({ message: 'Tutorial updated successfully' });
    } catch (error) {
        next(error);
    }
});

// Get tutorial reviews
router.get('/tutorials/:tutorialId/reviews', async (req, res, next) => {
    try {
        const { tutorialId } = req.params;

        // Check if tutorial belongs to tutor
        const [tutorials] = await pool.query(
            'SELECT id FROM tutorials WHERE id = ? AND tutor_id = ?',
            [tutorialId, req.user.id]
        );

        if (tutorials.length === 0) {
            return res.status(404).json({ error: 'Tutorial not found' });
        }

        const [reviews] = await pool.query(`
            SELECT tr.*, u.name as student_name
            FROM tutorial_reviews tr
            JOIN users u ON tr.student_id = u.id
            WHERE tr.tutorial_id = ?
            ORDER BY tr.created_at DESC
        `, [tutorialId]);

        res.json(reviews);
    } catch (error) {
        next(error);
    }
});

module.exports = router; 