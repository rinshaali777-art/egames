// // backend/config/db.js
// const mysql = require('mysql2/promise');

// const pool = mysql.createPool({
//   host:     process.env.DB_HOST     || 'localhost',
//   port:     process.env.DB_PORT     || 3306,
//   user:     process.env.DB_USER     || 'root',
//   password: process.env.DB_PASSWORD || '',
//   database: process.env.DB_NAME     || 'egames_db',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
//   ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
// });

// // ── Create tables if they don't exist ──────────────────────
// async function initDB() {
//   const conn = await pool.getConnection();
//   try {
//     // Coordinators / Admin accounts
//     await conn.execute(`
//       CREATE TABLE IF NOT EXISTS coordinators (
//         id           INT AUTO_INCREMENT PRIMARY KEY,
//         name         VARCHAR(100)        NOT NULL,
//         email        VARCHAR(150) UNIQUE NOT NULL,
//         password     VARCHAR(255)        NOT NULL,
//         role         ENUM('admin','coordinator') DEFAULT 'coordinator',
//         created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `);

//     // Participant registrations
//     await conn.execute(`
//       CREATE TABLE IF NOT EXISTS registrations (
//         id                  INT AUTO_INCREMENT PRIMARY KEY,
//         reg_id              VARCHAR(20) UNIQUE NOT NULL,
//         participant_name    VARCHAR(150)       NOT NULL,
//         semester_department VARCHAR(50)        NOT NULL,
//         event_name          VARCHAR(100)       NOT NULL,
//         event_fee           INT                NOT NULL DEFAULT 0,
//         team_name           VARCHAR(100),
//         team_members        TEXT,
//         contact_number      VARCHAR(20)        NOT NULL,
//         email               VARCHAR(150)       NOT NULL,
//         payment_method      ENUM('upi','screenshot','cash') NOT NULL,
//         transaction_id      VARCHAR(100),
//         screenshot_path     VARCHAR(255),
//         payment_status      ENUM('pending','verified','rejected') DEFAULT 'pending',
//         verified_by         INT,
//         verified_at         TIMESTAMP NULL,
//         notes               TEXT,
//         registration_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (verified_by) REFERENCES coordinators(id) ON DELETE SET NULL
//       )
//     `);

//     console.log('✅ Database tables ready');
//   } finally {
//     conn.release();
//   }
// }

// module.exports = { pool, initDB };


const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // ── Resilience settings (critical for Render + Railway free tier) ──
  enableKeepAlive: true,         // send TCP keepalives so the connection doesn't drop silently
  keepAliveInitialDelay: 10000,  // start keepalives after 10 s
  connectTimeout: 20000,         // give Railway 20 s to accept the connection
});

// Ping the pool every 5 minutes to prevent Railway from closing idle connections
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.warn('⚠️  DB keepalive ping failed:', err.message);
  }
}, 5 * 60 * 1000);

async function initializeDatabase() {
  const conn = await pool.getConnection();
  try {
    // Coordinators table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS coordinators (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'coordinator') DEFAULT 'coordinator',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Registrations table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        participant_name VARCHAR(150) NOT NULL,
        semester_department VARCHAR(150) NOT NULL,
        event_name VARCHAR(100) NOT NULL,
        contact_number VARCHAR(20) NOT NULL,
        email VARCHAR(150) NOT NULL,
        payment_method ENUM('upi', 'screenshot', 'cash') NOT NULL,
        transaction_id VARCHAR(100),
        team_name VARCHAR(100),
        team_members TEXT,
        screenshot_path VARCHAR(255),
        fee_amount DECIMAL(10,2) DEFAULT 0,
        status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
        verified_by INT,
        verified_at TIMESTAMP NULL,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (verified_by) REFERENCES coordinators(id) ON DELETE SET NULL
      )
    `);

    // Seed default admin
    const bcrypt = require('bcryptjs');
    const [existing] = await conn.query('SELECT id FROM coordinators WHERE email = ?', ['admin@egames.com']);
    if (existing.length === 0) {
      const hash = await bcrypt.hash('admin@egames123', 12);
      await conn.query(
        'INSERT INTO coordinators (name, email, password, role) VALUES (?, ?, ?, ?)',
        ['Admin', 'admin@egames.com', hash, 'admin']
      );
      console.log('✅ Default admin created: admin@egames.com / admin@egames123');
    }

    console.log('✅ Database initialized');
  } finally {
    conn.release();
  }
}

module.exports = { pool, initializeDatabase };