// API Routes and Logic for StudyMate

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'studymate',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Authentication Routes
const authRoutes = {
    // Student Authentication
    'POST /api/student/login': async (req, res) => {
        const { email, password } = req.body;
        try {
            const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
            const user = users[0];
            
            if (!user || !await bcrypt.compare(password, user.password)) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
            res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    },

    'POST /api/student/signup': async (req, res) => {
        const { name, email, password, role, educationLevel, grade } = req.body;
        try {
            const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'Email already registered' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const [result] = await pool.query(
                'INSERT INTO users (name, email, password, role, education_level, grade) VALUES (?, ?, ?, ?, ?, ?)',
                [name, email, hashedPassword, role, educationLevel, grade]
            );

            const token = jwt.sign({ id: result.insertId, role }, process.env.JWT_SECRET);
            res.status(201).json({ token, user: { id: result.insertId, name, role } });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    }
};

// Student Dashboard Routes
const studentRoutes = {
    'GET /api/student/dashboard': async (req, res) => {
        try {
            const userId = req.user.id;
            const [stats] = await pool.query(`
                SELECT 
                    (SELECT COUNT(*) FROM quiz_results WHERE student_id = ?) as quizzes_taken,
                    (SELECT COUNT(*) FROM notes WHERE student_id = ?) as notes_uploaded,
                    (SELECT COUNT(*) FROM tutorial_enrollments WHERE student_id = ?) as tutorials_enrolled
            `, [userId, userId, userId]);

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
            res.status(500).json({ error: 'Server error' });
        }
    },

    'GET /api/library': async (req, res) => {
        try {
            const { category, level } = req.query;
            let query = 'SELECT * FROM materials';
            const params = [];

            if (category || level) {
                query += ' WHERE';
                if (category) {
                    query += ' category = ?';
                    params.push(category);
                }
                if (level) {
                    query += category ? ' AND' : '';
                    query += ' level = ?';
                    params.push(level);
                }
            }

            query += ' ORDER BY created_at DESC';
            const [materials] = await pool.query(query, params);
            res.json(materials);
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    }
};

// Notes Management Routes
const notesRoutes = {
    'GET /api/notes': async (req, res) => {
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
            res.status(500).json({ error: 'Server error' });
        }
    },

    'POST /api/notes/upload': async (req, res) => {
        try {
            const { title, description, fileUrl, subject, category, level } = req.body;
            const [result] = await pool.query(
                'INSERT INTO notes (student_id, title, description, file_url, subject, category, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.user.id, title, description, fileUrl, subject, category, level]
            );
            res.status(201).json({ id: result.insertId, ...req.body });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    }
};

// Quiz Management Routes
const quizRoutes = {
    'GET /api/quizzes/:noteId': async (req, res) => {
        try {
            const { noteId } = req.params;
            const [quizzes] = await pool.query(`
                SELECT q.*, 
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', qq.id,
                            'question', qq.question,
                            'options', qq.options,
                            'correct_answer', qq.correct_answer
                        )
                    ) as questions
                FROM quizzes q
                LEFT JOIN quiz_questions qq ON q.id = qq.quiz_id
                WHERE q.note_id = ?
                GROUP BY q.id
                ORDER BY q.created_at DESC
            `, [noteId]);
            res.json(quizzes);
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    },

    'POST /api/quizzes/submit': async (req, res) => {
        try {
            const { quizId, answers } = req.body;
            const [questions] = await pool.query(
                'SELECT * FROM quiz_questions WHERE quiz_id = ?',
                [quizId]
            );

            const score = calculateScore(questions, answers);
            const [result] = await pool.query(
                'INSERT INTO quiz_results (student_id, quiz_id, score, answers) VALUES (?, ?, ?, ?)',
                [req.user.id, quizId, score, JSON.stringify(answers)]
            );

            res.status(201).json({ id: result.insertId, score, answers });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    }
};

// Progress Tracking Routes
const progressRoutes = {
    'GET /api/progress': async (req, res) => {
        try {
            const userId = req.user.id;
            const [quizResults] = await pool.query(`
                SELECT qr.*, q.title as quiz_title, q.subject
                FROM quiz_results qr
                JOIN quizzes q ON qr.quiz_id = q.id
                WHERE qr.student_id = ?
                ORDER BY qr.created_at DESC
            `, [userId]);

            const progress = calculateProgress(quizResults);
            res.json({ quizResults, progress });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    }
};

// Tutorial Management Routes
const tutorialRoutes = {
    'GET /api/tutorials': async (req, res) => {
        try {
            const { level, subject, category } = req.query;
            let query = `
                SELECT t.*, u.name as tutor_name,
                    (SELECT AVG(rating) FROM tutorial_reviews WHERE tutorial_id = t.id) as average_rating,
                    (SELECT COUNT(*) FROM tutorial_enrollments WHERE tutorial_id = t.id) as enrolled_students
                FROM tutorials t
                JOIN users u ON t.tutor_id = u.id
                WHERE t.status = 'approved'
            `;
            const params = [];

            if (level) {
                query += ' AND t.level = ?';
                params.push(level);
            }
            if (subject) {
                query += ' AND t.subject = ?';
                params.push(subject);
            }
            if (category) {
                query += ' AND t.category = ?';
                params.push(category);
            }

            query += ' ORDER BY t.created_at DESC';
            const [tutorials] = await pool.query(query, params);
            res.json(tutorials);
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    },

    'GET /api/tutorial/:tutorialId': async (req, res) => {
        try {
            const { tutorialId } = req.params;
            const [tutorials] = await pool.query(`
                SELECT t.*, u.name as tutor_name,
                    (SELECT AVG(rating) FROM tutorial_reviews WHERE tutorial_id = t.id) as average_rating,
                    (SELECT COUNT(*) FROM tutorial_enrollments WHERE tutorial_id = t.id) as enrolled_students
                FROM tutorials t
                JOIN users u ON t.tutor_id = u.id
                WHERE t.id = ?
            `, [tutorialId]);

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

            res.json({ ...tutorials[0], reviews });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    }
};

// Profile Management Routes
const profileRoutes = {
    'GET /api/student/profile': async (req, res) => {
        try {
            const [users] = await pool.query(
                'SELECT id, name, email, role, education_level, grade, specialization, experience, bio FROM users WHERE id = ?',
                [req.user.id]
            );
            res.json(users[0]);
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    },

    'PUT /api/student/profile': async (req, res) => {
        try {
            const { name, email, currentPassword, newPassword } = req.body;
            const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
            const user = users[0];

            if (currentPassword && newPassword) {
                const isValid = await bcrypt.compare(currentPassword, user.password);
                if (!isValid) {
                    return res.status(400).json({ error: 'Current password is incorrect' });
                }
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                await pool.query(
                    'UPDATE users SET password = ? WHERE id = ?',
                    [hashedPassword, req.user.id]
                );
            }

            await pool.query(
                'UPDATE users SET name = ?, email = ? WHERE id = ?',
                [name || user.name, email || user.email, req.user.id]
            );

            res.json({ message: 'Profile updated successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    }
};

// Helper Functions
function calculateScore(questions, answers) {
    let score = 0;
    questions.forEach((question, index) => {
        if (question.correct_answer === answers[index]) {
            score++;
        }
    });
    return (score / questions.length) * 100;
}

function calculateProgress(quizResults) {
    const subjects = {};
    quizResults.forEach(result => {
        const subject = result.subject;
        if (!subjects[subject]) {
            subjects[subject] = { total: 0, correct: 0 };
        }
        subjects[subject].total++;
        subjects[subject].correct += result.score;
    });
    
    return Object.entries(subjects).map(([subject, data]) => ({
        subject,
        progress: (data.correct / data.total) * 100
    }));
}

// Export all routes
module.exports = {
    ...authRoutes,
    ...studentRoutes,
    ...notesRoutes,
    ...quizRoutes,
    ...progressRoutes,
    ...tutorialRoutes,
    ...profileRoutes
}; 