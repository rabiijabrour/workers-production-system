require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const session = require('express-session');
const schedule = require('node-schedule');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH']
}));
app.use(express.static(path.join(__dirname)));
app.use(session({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production'
    }
}));

// Database setup
const dbPath = process.env.DATABASE_URL || 'production.db';
const db = new sqlite3.Database(dbPath);

// Create tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
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

    // Create default admin user
    const defaultAdmin = {
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin'
    };

    db.get('SELECT * FROM users WHERE username = ?', [defaultAdmin.username], (err, row) => {
        if (!row) {
            db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [defaultAdmin.username, defaultAdmin.password, defaultAdmin.role]);
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

// Login route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'User not found' });

        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET || 'your-secret-key');
            res.json({ token, role: user.role });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
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

// Schedule production reminder notifications
schedule.scheduleJob('0 * * * *', () => {
    console.log('Sending production reminder notification');
    // Here you would implement the actual notification logic
    // For now, we'll just log it
});

// تعديل مسار الملفات الثابتة
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});
