const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

// Middleware to check if user is a student
const isStudent = (req, res, next) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ error: 'Access denied. Students only.' });
    }
    next();
};

// Apply student middleware to all routes
router.use(isStudent);

// Get student dashboard data
router.get('/dashboard', async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        // Get statistics
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM quiz_results WHERE student_id = ?) as quizzes_taken,
                (SELECT COUNT(*) FROM notes WHERE student_id = ?) as notes_uploaded,
                (SELECT COUNT(*) FROM tutorial_enrollments WHERE student_id = ?) as tutorials_enrolled
        `, [userId, userId, userId]);

        // Get recent activity
        const [recentActivity] = await pool.query(`
            SELECT * FROM activities 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 5
        `, [userId]);

        res.json({
            stats: stats[0],
            recentActivity
        });
    } catch (error) {
        next(error);
    }
});

// Get student's notes
router.get('/notes', async (req, res, next) => {
    try {
        const { category, level } = req.query;
        let query = 'SELECT * FROM notes WHERE student_id = ?';
        const params = [req.user.id];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        if (level) {
            query += ' AND level = ?';
            params.push(level);
        }

        query += ' ORDER BY created_at DESC';
        const [notes] = await pool.query(query, params);
        res.json(notes);
    } catch (error) {
        next(error);
    }
});

// Upload a new note
router.post('/notes', [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim(),
    body('fileUrl').trim().notEmpty().withMessage('File URL is required'),
    body('subject').trim().notEmpty().withMessage('Subject is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('level').trim().notEmpty().withMessage('Level is required')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { title, description, fileUrl, subject, category, level } = req.body;
        
        const [result] = await pool.query(
            'INSERT INTO notes (student_id, title, description, file_url, subject, category, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, title, description, fileUrl, subject, category, level]
        );

        // Log activity
        await pool.query(
            'INSERT INTO activities (user_id, type, action, reference_id) VALUES (?, ?, ?, ?)',
            [req.user.id, 'note', 'upload', result.insertId]
        );

        res.status(201).json({
            id: result.insertId,
            title,
            description,
            fileUrl,
            subject,
            category,
            level
        });
    } catch (error) {
        next(error);
    }
});

// Get quiz results and progress
router.get('/progress', async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        // Get quiz results with subject information
        const [quizResults] = await pool.query(`
            SELECT qr.*, q.title as quiz_title, q.subject
            FROM quiz_results qr
            JOIN quizzes q ON qr.quiz_id = q.id
            WHERE qr.student_id = ?
            ORDER BY qr.created_at DESC
        `, [userId]);

        // Calculate progress by subject
        const progress = quizResults.reduce((acc, result) => {
            const subject = result.subject;
            if (!acc[subject]) {
                acc[subject] = { total: 0, correct: 0 };
            }
            acc[subject].total++;
            acc[subject].correct += result.score;
            return acc;
        }, {});

        const progressBySubject = Object.entries(progress).map(([subject, data]) => ({
            subject,
            progress: (data.correct / data.total) * 100
        }));

        res.json({
            quizResults,
            progress: progressBySubject
        });
    } catch (error) {
        next(error);
    }
});

// Get enrolled tutorials
router.get('/tutorials', async (req, res, next) => {
    try {
        const [tutorials] = await pool.query(`
            SELECT t.*, u.name as tutor_name,
                (SELECT AVG(rating) FROM tutorial_reviews WHERE tutorial_id = t.id) as average_rating
            FROM tutorials t
            JOIN tutorial_enrollments te ON t.id = te.tutorial_id
            JOIN users u ON t.tutor_id = u.id
            WHERE te.student_id = ?
            ORDER BY te.enrolled_at DESC
        `, [req.user.id]);

        res.json(tutorials);
    } catch (error) {
        next(error);
    }
});

module.exports = router; 