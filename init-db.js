const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Get database path from environment or use default
const dbPath = process.env.NODE_ENV === 'production'
    ? path.join('/data', 'production.db')
    : path.join(__dirname, 'production.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new sqlite3.Database(dbPath);

// Create default admin user
async function createDefaultAdmin() {
    return new Promise((resolve, reject) => {
        const defaultAdmin = {
            username: 'admin',
            password: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            fullName: 'مدير النظام',
            email: 'admin@example.com',
            status: 'active'
        };

        db.get('SELECT * FROM users WHERE username = ?', [defaultAdmin.username], (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            if (!row) {
                db.run(
                    'INSERT INTO users (username, password, role, fullName, email, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [defaultAdmin.username, defaultAdmin.password, defaultAdmin.role, defaultAdmin.fullName, defaultAdmin.email, defaultAdmin.status],
                    (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        console.log('Default admin user created successfully');
                        resolve();
                    }
                );
            } else {
                console.log('Default admin user already exists');
                resolve();
            }
        });
    });
}

// Run initialization
async function initializeDatabase() {
    try {
        await createDefaultAdmin();
        console.log('Database initialization completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

initializeDatabase();
