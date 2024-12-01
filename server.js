require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const session = require('express-session');
const schedule = require('node-schedule');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const { body, validationResult } = require('express-validator');
const winston = require('winston');
const moment = require('moment');

// Configure Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? 'https://workers-production-system.onrender.com'
        : 'http://localhost:3000',
    credentials: true
}));
app.use(express.static(path.join(__dirname)));
app.use(session({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Enhanced Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "fonts.gstatic.com", "fonts.googleapis.com"],
            connectSrc: ["'self'", "https://workers-production-system.onrender.com"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Database setup
const dbPath = process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, 'production.db')
    : path.join(__dirname, 'production.db');
const db = new sqlite3.Database(dbPath);

// Create tables
db.serialize(() => {
    // Users table with more fields
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        fullName TEXT,
        role TEXT,
        email TEXT UNIQUE,
        lastLogin TEXT,
        status TEXT DEFAULT 'active',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Workers table
    db.run(`CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        name TEXT,
        department TEXT
    )`);

    // Production table
    db.run(`CREATE TABLE IF NOT EXISTS productions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workerId TEXT,
        pieces INTEGER,
        date TEXT,
        FOREIGN KEY(workerId) REFERENCES workers(id)
    )`);

    // Create default admin user if not exists
    const defaultAdmin = {
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        fullName: 'مدير النظام',
        email: 'admin@example.com',
        status: 'active'
    };

    db.get('SELECT * FROM users WHERE username = ?', [defaultAdmin.username], (err, row) => {
        if (!row) {
            db.run('INSERT INTO users (username, password, role, fullName, email, status) VALUES (?, ?, ?, ?, ?, ?)',
                [defaultAdmin.username, defaultAdmin.password, defaultAdmin.role, defaultAdmin.fullName, defaultAdmin.email, defaultAdmin.status]);
        }
    });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.sendStatus(401);

    jwt.verify(token.split(' ')[1], process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// التحقق من وجود مدير
async function checkAdminExists() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin'], (err, row) => {
            if (err) reject(err);
            resolve(row.count > 0);
        });
    });
}

// التسجيل
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, fullName, email, role } = req.body;

        // التحقق من البيانات المطلوبة
        if (!username || !password || !fullName || !email || !role) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        // التحقق من وجود مدير إذا كان الدور المطلوب هو مدير
        if (role === 'admin') {
            const adminExists = await checkAdminExists();
            if (adminExists) {
                return res.status(400).json({ error: 'عذراً، يوجد مدير واحد فقط في النظام' });
            }
        }

        // التحقق من عدم وجود اسم المستخدم أو البريد الإلكتروني مسبقاً
        db.get(
            'SELECT username, email FROM users WHERE username = ? OR email = ?',
            [username, email],
            async (err, user) => {
                if (err) {
                    logger.error('Error checking user existence:', err);
                    return res.status(500).json({ error: 'حدث خطأ في التحقق من البيانات' });
                }

                if (user) {
                    if (user.username === username) {
                        return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
                    }
                    if (user.email === email) {
                        return res.status(400).json({ error: 'البريد الإلكتروني موجود مسبقاً' });
                    }
                }

                // تشفير كلمة المرور
                const hashedPassword = await bcrypt.hash(password, 10);

                // إضافة المستخدم الجديد
                db.run(
                    `INSERT INTO users (username, password, fullName, email, role, status, lastLogin)
                     VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
                    [username, hashedPassword, fullName, email, role],
                    (err) => {
                        if (err) {
                            logger.error('Error creating user:', err);
                            return res.status(500).json({ error: 'حدث خطأ في إنشاء الحساب' });
                        }

                        res.json({ message: 'تم إنشاء الحساب بنجاح' });
                    }
                );
            }
        );
    } catch (error) {
        logger.error('Error in registration:', error);
        res.status(500).json({ error: 'حدث خطأ في عملية التسجيل' });
    }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }

        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                logger.error('Error in login:', err);
                return res.status(500).json({ error: 'حدث خطأ في تسجيل الدخول' });
            }

            if (!user) {
                return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            if (user.status !== 'active') {
                return res.status(401).json({ error: 'هذا الحساب غير نشط' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            // تحديث آخر تسجيل دخول
            db.run('UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

            // إنشاء توكن التصريح
            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username,
                    role: user.role,
                    fullName: user.fullName
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '24h' }
            );

            res.json({
                token,
                role: user.role,
                fullName: user.fullName
            });
        });
    } catch (error) {
        logger.error('Error in login:', error);
        res.status(500).json({ error: 'حدث خطأ في عملية تسجيل الدخول' });
    }
});

// User management routes
app.get('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح بالوصول' });
    }

    db.all('SELECT id, username, fullName, role, email, status, lastLogin, createdAt FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح بالوصول' });
    }

    const { username, password, fullName, role, email } = req.body;
    
    if (!username || !password || !fullName || !role || !email) {
        return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(`INSERT INTO users (username, password, fullName, role, email, status) 
            VALUES (?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, fullName, role, email, 'active'],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم مسبقاً' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID, message: 'تم إنشاء المستخدم بنجاح' });
        });
});

app.put('/api/users/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'غير مصرح بالوصول' });
    }

    const { fullName, email, status, role, password } = req.body;
    let updates = [];
    let params = [];

    if (fullName) {
        updates.push('fullName = ?');
        params.push(fullName);
    }
    if (email) {
        updates.push('email = ?');
        params.push(email);
    }
    if (status && req.user.role === 'admin') {
        updates.push('status = ?');
        params.push(status);
    }
    if (role && req.user.role === 'admin') {
        updates.push('role = ?');
        params.push(role);
    }
    if (password) {
        updates.push('password = ?');
        params.push(bcrypt.hashSync(password, 10));
    }

    params.push(req.params.id);

    if (updates.length === 0) {
        return res.status(400).json({ error: 'لم يتم تحديد أي حقول للتحديث' });
    }

    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'تم تحديث المستخدم بنجاح' });
    });
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح بالوصول' });
    }

    if (req.user.id === parseInt(req.params.id)) {
        return res.status(400).json({ error: 'لا يمكن حذف حسابك الخاص' });
    }

    db.run('UPDATE users SET status = ? WHERE id = ?', ['deleted', req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'تم حذف المستخدم بنجاح' });
    });
});

// Workers routes
app.get('/api/workers', authenticateToken, (req, res) => {
    db.all('SELECT * FROM workers', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/workers', authenticateToken, (req, res) => {
    const { id, name, department } = req.body;
    db.run('INSERT INTO workers (id, name, department) VALUES (?, ?, ?)',
        [id, name, department], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Worker added successfully' });
        });
});

app.delete('/api/workers/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM workers WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Worker deleted successfully' });
    });
});

// Production routes
app.get('/api/productions', authenticateToken, (req, res) => {
    db.all(`SELECT p.*, w.name as workerName, w.department 
            FROM productions p 
            JOIN workers w ON p.workerId = w.id 
            ORDER BY p.date DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/productions', authenticateToken, (req, res) => {
    const { workerId, pieces } = req.body;
    const date = new Date().toISOString();
    
    db.run('INSERT INTO productions (workerId, pieces, date) VALUES (?, ?, ?)',
        [workerId, pieces, date], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Production recorded successfully' });
        });
});

// Summary route
app.get('/api/summary', authenticateToken, (req, res) => {
    db.all(`SELECT 
                w.name, 
                w.department,
                SUM(p.pieces) as total,
                ROUND(AVG(p.pieces)) as average
            FROM workers w
            LEFT JOIN productions p ON w.id = p.workerId
            GROUP BY w.id`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// مسار لجلب معلومات المستخدم الحالي
app.get('/api/me', authenticateToken, (req, res) => {
    db.get('SELECT id, username, fullName, role, email, lastLogin, createdAt FROM users WHERE id = ?', 
        [req.user.id], (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
            res.json(user);
        });
});

// API endpoint for production summary
app.get('/api/production/summary', authenticateToken, async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const last7Days = moment().subtract(7, 'days').format('YYYY-MM-DD');

        // Get today's total production
        const todayTotalQuery = `
            SELECT SUM(pieces) as total
            FROM production
            WHERE date(timestamp) = date('now')
        `;

        // Get average production per day
        const averageQuery = `
            SELECT AVG(daily_total) as average
            FROM (
                SELECT date(timestamp) as date, SUM(pieces) as daily_total
                FROM production
                GROUP BY date(timestamp)
            )
        `;

        // Get best production day
        const bestQuery = `
            SELECT MAX(daily_total) as best
            FROM (
                SELECT date(timestamp) as date, SUM(pieces) as daily_total
                FROM production
                GROUP BY date(timestamp)
            )
        `;

        // Get last 7 days production
        const weeklyQuery = `
            SELECT date(timestamp) as date, SUM(pieces) as total
            FROM production
            WHERE date(timestamp) >= ?
            GROUP BY date(timestamp)
            ORDER BY date(timestamp)
        `;

        const [todayResult, averageResult, bestResult, weeklyResult] = await Promise.all([
            new Promise((resolve, reject) => {
                db.get(todayTotalQuery, [], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            }),
            new Promise((resolve, reject) => {
                db.get(averageQuery, [], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            }),
            new Promise((resolve, reject) => {
                db.get(bestQuery, [], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            }),
            new Promise((resolve, reject) => {
                db.all(weeklyQuery, [last7Days], (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                });
            })
        ]);

        const dates = weeklyResult.map(row => moment(row.date).format('MM/DD'));
        const values = weeklyResult.map(row => row.total);

        res.json({
            todayTotal: todayResult.total || 0,
            average: Math.round(averageResult.average) || 0,
            best: bestResult.best || 0,
            dates,
            values
        });
    } catch (error) {
        logger.error('Error in production summary:', error);
        res.status(500).json({ error: 'حدث خطأ في استرجاع ملخص الإنتاج' });
    }
});

// Schedule production reminder notifications
schedule.scheduleJob('0 * * * *', () => {
    console.log('Sending production reminder notification');
    // Here you would implement the actual notification logic
    // For now, we'll just log it
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error({
        message: err.message,
        stack: err.stack,
        timestamp: moment().format(),
        path: req.path,
        method: req.method,
        ip: req.ip
    });

    // Don't expose error details in production
    const error = process.env.NODE_ENV === 'production'
        ? 'حدث خطأ في النظام'
        : err.message;

    res.status(err.status || 500).json({ error });
});

// Handle 404 errors
app.use((req, res) => {
    res.status(404).json({ error: 'الصفحة غير موجودة' });
});

// Catch-all route to serve index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${PORT}`);
    console.log(`Server running at http://localhost:${PORT}`);
});
