const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const rimraf = require('rimraf');
const { spawn } = require('child_process');

// Create express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// PostgreSQL Connection with retry logic
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',    // Changed from 'root' to default PostgreSQL user        
    password: process.env.DB_PASSWORD || '0306',
    port: process.env.DB_PORT || 5432   // Added port for PostgreSQL
};


// Replace the existing connectWithRetry function with this updated version:
async function connectWithRetry(maxRetries = 10, delay = 5000) {
    let retries = 0;
    let rootPool = null;

    const setupDatabase = async () => {
        try {
            // First connect to default postgres database
            rootPool = new Pool({
                ...dbConfig,
                database: 'postgres'
            });

            // Check if database exists
            const dbCheckResult = await rootPool.query(
                "SELECT 1 FROM pg_database WHERE datname = $1",
                ['apollo_tyres']
            );

            // Create database if it doesn't exist
            if (dbCheckResult.rows.length === 0) {
                console.log('Database apollo_tyres does not exist, creating it now...');
                await rootPool.query('CREATE DATABASE apollo_tyres');
                console.log('Database apollo_tyres created successfully');
            } else {
                console.log('Database apollo_tyres already exists');
            }

            // Close connection to postgres database
            await rootPool.end();

            // Create new pool for apollo_tyres database
            const pool = new Pool({
                ...dbConfig,
                database: 'apollo_tyres'
            });

            async function listTydexFiles(projectId) {
  const q = `
    SELECT id, protocol, filename, created_at
    FROM tydex_files
    WHERE project_id = $1
    ORDER BY created_at DESC;
  `;
  const { rows } = await pool.query(q, [projectId]);
  return rows;
}

            // Test connection and create tables
            await pool.query('SELECT NOW()');
            console.log('Connected to PostgreSQL database');

            // Create tables
            const tables = [
                {
                    name: 'users',
                    query: `CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        email VARCHAR(255) NOT NULL UNIQUE,
                        password VARCHAR(255) NOT NULL,
                        role VARCHAR(50) NOT NULL DEFAULT 'engineer',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TIMESTAMP
                    )`
                },
                {
                    name: 'mf_data',
                    query: `
                CREATE TABLE IF NOT EXISTS mf_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    ips VARCHAR(255),
                    loads VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    slip_angle VARCHAR(255),
                    slip_ratio VARCHAR(255),
                    test_velocity VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },

                {
                    name: 'mf52_data',
                    query: `
                CREATE TABLE IF NOT EXISTS mf52_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    loads VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    slip_angle VARCHAR(255),
                    slip_ratio VARCHAR(255),
                    test_velocity VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },
                {
                    name: 'ftire_data',
                    query: `
                CREATE TABLE IF NOT EXISTS ftire_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    loads VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    test_velocity VARCHAR(255),
                    longitudinal_slip VARCHAR(255),
                    slip_angle VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    cleat_orientation VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },

                {
                    name: 'cdtire_data',
                    query: `
                CREATE TABLE IF NOT EXISTS cdtire_data (
                    number_of_runs INT,
                    test_name VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    velocity VARCHAR(255),
                    preload VARCHAR(255),
                    camber VARCHAR(255),
                    slip_angle VARCHAR(255),
                    displacement VARCHAR(255),
                    slip_range VARCHAR(255),
                    cleat VARCHAR(255),
                    road_surface VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },
                {
                    name: 'custom_data',
                    query: `
                CREATE TABLE IF NOT EXISTS custom_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    loads VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    slip_angle VARCHAR(255),
                    slip_ratio VARCHAR(255),
                    test_velocity VARCHAR(255),
                    cleat_orientation VARCHAR(255),
                    displacement VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },

                {
                    name: 'projects',
                    query: `
                CREATE TABLE IF NOT EXISTS projects (
                    id SERIAL PRIMARY KEY,
                    project_name VARCHAR(255) NOT NULL,
                    region VARCHAR(100) NOT NULL,
                    department VARCHAR(100) NOT NULL,
                    tyre_size VARCHAR(100) NOT NULL,
                    protocol VARCHAR(50) NOT NULL,
                    status VARCHAR(50) DEFAULT 'Not Started',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    user_email VARCHAR(255)
                )
            `
                },

                // ➜ ADD BELOW inside the `tables` array in connectWithRetry()

{
  name: 'mf62_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS mf62_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      ips VARCHAR(255),
      loads VARCHAR(255),
      inclination_angle VARCHAR(255),
      slip_angle VARCHAR(255),
      slip_ratio VARCHAR(255),
      test_velocity VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'mf52_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS mf52_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      inflation_pressure VARCHAR(255),
      loads VARCHAR(255),
      inclination_angle VARCHAR(255),
      slip_angle VARCHAR(255),
      slip_ratio VARCHAR(255),
      test_velocity VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'cdtire_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS cdtire_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      test_name VARCHAR(255),
      inflation_pressure VARCHAR(255),
      velocity VARCHAR(255),
      preload VARCHAR(255),
      camber VARCHAR(255),
      slip_angle VARCHAR(255),
      displacement VARCHAR(255),
      slip_range VARCHAR(255),
      cleat VARCHAR(255),
      road_surface VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'ftire_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS ftire_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      loads VARCHAR(255),
      inflation_pressure VARCHAR(255),
      test_velocity VARCHAR(255),
      longitudinal_slip VARCHAR(255),
      slip_angle VARCHAR(255),
      inclination_angle VARCHAR(255),
      cleat_orientation VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'custom_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS custom_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      inflation_pressure VARCHAR(255),
      loads VARCHAR(255),
      inclination_angle VARCHAR(255),
      slip_angle VARCHAR(255),
      slip_ratio VARCHAR(255),
      test_velocity VARCHAR(255),
      cleat_orientation VARCHAR(255),
      displacement VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},


                // ... Add other table creation queries
            ];

            // Create tables sequentially
            for (const table of tables) {
                try {
                    await pool.query(table.query);
                    console.log(`${table.name} table created successfully`);
                } catch (err) {
                    console.error(`Error creating ${table.name} table:`, err);
                }
            }

            // ➜ ADD AFTER the for..of tables-creation loop
try {
  await pool.query(`
    ALTER TABLE mf62_project_data
      ADD CONSTRAINT mf62_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_mf62_proj_project_id ON mf62_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_mf62_proj_runs       ON mf62_project_data(project_id, number_of_runs);

    ALTER TABLE mf52_project_data
      ADD CONSTRAINT mf52_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_mf52_proj_project_id ON mf52_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_mf52_proj_runs       ON mf52_project_data(project_id, number_of_runs);

    ALTER TABLE cdtire_project_data
      ADD CONSTRAINT cdtire_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_cdtire_proj_project_id ON cdtire_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_cdtire_proj_runs       ON cdtire_project_data(project_id, number_of_runs);

    ALTER TABLE ftire_project_data
      ADD CONSTRAINT ftire_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_ftire_proj_project_id ON ftire_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_ftire_proj_runs       ON ftire_project_data(project_id, number_of_runs);

    ALTER TABLE custom_project_data
      ADD CONSTRAINT custom_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_custom_proj_project_id ON custom_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_custom_proj_runs       ON custom_project_data(project_id, number_of_runs);
  `);
  console.log('Ensured constraints/indexes on *_project_data tables');
} catch (e) {
  // benign if constraint already exists — ignore duplicate errors
  console.warn('Constraint/index bootstrap error (safe to ignore if already exists):', e.message);
}


            /* ➜ ADD THIS BLOCK (ensures 'name' column on users) */
try {
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)");
  console.log("Ensured 'name' column exists on users table");
} catch (e) {
  console.error("Error ensuring 'name' column:", e);
}
            // Ensure 'inputs' column exists on existing databases
try {
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS inputs JSONB DEFAULT '{}'::jsonb");
  console.log("Ensured 'inputs' column exists on projects table");
} catch (e) {
  console.error("Error ensuring 'inputs' column:", e);
}


            return pool;

        } catch (error) {
            if (rootPool) {
                try {
                    await rootPool.end();
                } catch (endError) {
                    console.error('Error closing root pool:', endError);
                }
            }
            throw error;
        }
    };

    // Function to try connecting with retry logic
    const tryConnect = async () => {
        try {
            return await setupDatabase();
        } catch (err) {
            console.error(`Error connecting to PostgreSQL database (attempt ${retries + 1}):`, err);

            if (retries < maxRetries) {
                retries++;
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return tryConnect();
            }

            console.error(`Max retries (${maxRetries}) reached. Unable to connect to PostgreSQL database.`);
            throw err;
        }
    };

    return tryConnect();
}

let db;

(async () => {
    try {
        db = await connectWithRetry();
        console.log('Database connection established and assigned to db variable');
    } catch (err) {
        console.error('Failed to establish database connection:', err);
        process.exit(1);  // Exit if we can't connect to the database
    }
})();

// Secret key for JWT
const JWT_SECRET = 'apollo-tyres-secret-key'; // In production, use environment variable

// API routes (including /api/manager/add-user) should be above this:
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
// Login API endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required'
        });
    }

    try {
        // Begin transaction
        await db.query('BEGIN');

        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        // Check if user exists
        if (result.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Compare password using bcrypt
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            await db.query('ROLLBACK');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last_login timestamp
        await db.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Create JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Commit transaction
        await db.query('COMMIT');

        return res.json({
            success: true,
            token: token,
            role: user.role,
            message: 'Login successful'
        });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Login error:', err);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

 app.post('/api/register', async (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required.'
        });
    }

    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const result = await db.query(
            'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role',
            [email, hashedPassword, role]
        );

        res.json({
            success: true,
            message: 'User registered successfully.',
            user: result.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            res.status(409).json({
                success: false,
                message: 'Email already exists.'
            });
        } else {
            console.error('Registration error:', err);
            res.status(500).json({
                success: false,
                message: 'Registration failed.'
            });
        }
    }
});

// Token verification endpoint
app.get('/api/verify-token', authenticateToken, (req, res) => {
    // If authentication middleware passes, token is valid
    res.json({
        success: true,
        user: { email: req.user.email }
    });
});

/**
 * GET /api/me
 * Return the current user with created_at and last_login.
 * Uses email from your JWT payload (set in authenticateToken).
 */
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const email = req.user && req.user.email;
    if (!email) return res.status(401).json({ error: 'unauthorized' });

    const q = `
      SELECT id, email, role, name, created_at, last_login
      FROM users
      WHERE email = $1
      LIMIT 1
    `;
    const r = await db.query(q, [email]);
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });

    return res.json({ user: r.rows[0] });
  } catch (e) {
    console.error('GET /api/me', e);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * Optional helper used by the front end when it has email but no name.
 * GET /api/users/by-email?email=x
 */
app.get('/api/users/by-email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });

    const q = `
      SELECT id, email, role, name, created_at, last_login
      FROM users
      WHERE email = $1
      LIMIT 1
    `;
    const r = await db.query(q, [email]);
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });

    return res.json({ user: r.rows[0] });
  } catch (e) {
    console.error('GET /api/users/by-email', e);
    return res.status(500).json({ error: 'server error' });
  }
});


// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token required'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        req.user = user;
        next();
    });
}

// New middleware to require manager role
function requireManager(req, res, next) {
    if (!req.user || req.user.role !== 'manager') {
        return res.status(403).json({ success: false, message: 'Manager access required' });
    }
    next();
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'protocol');
        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Use fixed filename 'output.xlsx'
        cb(null, 'output.xlsx');
    }
});

const upload = multer({ storage: storage });

// Add new endpoint for saving Excel files
app.post('/api/save-excel', upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file received'
        });
    }

    res.json({
        success: true,
        message: 'File saved successfully',
        filename: 'output.xlsx'
    });
});

// Add these utility functions after other middleware definitions
function clearProjectsFolder() {
    const projectsPath = path.join(__dirname, 'projects');
    if (fs.existsSync(projectsPath)) {
        rimraf.sync(projectsPath);
    }
    fs.mkdirSync(projectsPath, { recursive: true });
}

// Replace the existing store-excel-data endpoint with this modified version
app.post('/api/store-excel-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    // First truncate the table
    const truncateQuery = 'TRUNCATE TABLE mf_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            console.error('Error truncating table:', truncateErr);
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }

        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO mf_data 
                (number_of_runs, tests, ips, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;

            return db.query(insertQuery, [
                row.number_of_runs,
                row.tests,
                row.ips,
                row.loads,
                row.inclination_angle,
                row.slip_angle,
                row.slip_ratio,
                row.test_velocity,
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                console.error('Error storing data:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

// Update Excel file reading endpoint to be page-specific
app.get('/api/read-protocol-excel', (req, res) => {
    const protocolDir = path.join(__dirname, 'protocol');
    const referer = req.headers.referer || '';
    let fileName;

    if (referer.includes('ftire.html')) {
        fileName = 'FTire.xlsx';
    } else if (referer.includes('mf52.html')) {
        fileName = 'MF5pt2.xlsx';
    } else if (referer.includes('mf.html')) {
        fileName = 'MF6pt2.xlsx';
    } else if (referer.includes('cdtire.html')) {
        fileName = 'CDTire.xlsx';
    } else if (referer.includes('custom.html')) {
        fileName = 'Custom.xlsx';
    } else {
        return res.status(400).json({
            success: false,
            message: 'Unknown protocol page'
        });
    }

    const filePath = path.join(protocolDir, fileName);

    if (!fs.existsSync(protocolDir)) {
        fs.mkdirSync(protocolDir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: `${fileName} not found in protocol folder`
        });
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error reading Excel file'
            });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(data);
    });
});

// Add new endpoint for reading output Excel file
app.get('/api/read-output-excel', (req, res) => {
    const filePath = path.join(__dirname, 'protocol', 'output.xlsx');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: 'Output file not found'
        });
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading Excel file:', err);
            return res.status(500).json({
                success: false,
                message: 'Error reading Excel file'
            });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(data);
    });
});

// Add new endpoint to get MF data
app.get('/api/get-mf-data', (req, res) => {
    const query = 'SELECT * FROM mf_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching MF data:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

// Add new endpoint to get test summary data
app.get('/api/get-test-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM mf_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching test summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

// Add new endpoint to get MF 5.2 data
app.post('/api/store-mf52-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    // First truncate the table
    const truncateQuery = 'TRUNCATE TABLE mf52_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }

        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO mf52_data 
                (number_of_runs, tests, inflation_pressure, loads, inclination_angle, 
                 slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;

            return db.query(insertQuery, [
                row.number_of_runs,
                row.tests,
                row.inflation_pressure,
                row.loads,
                row.inclination_angle,
                row.slip_angle,
                row.slip_ratio,
                row.test_velocity,
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

// Add endpoint to get MF 5.2 data
app.get('/api/get-mf52-data', (req, res) => {
    const query = 'SELECT * FROM mf52_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

// Add new endpoint for MF 5.2 test summary data
app.get('/api/get-mf52-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM mf52_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching MF 5.2 summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []); // Changed from results to results.rows
    });
});

// Add FTire data endpoints with correct columns
app.post('/api/store-ftire-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    const truncateQuery = 'TRUNCATE TABLE ftire_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }

        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO ftire_data 
                (number_of_runs, tests, loads, inflation_pressure, test_velocity,
                 longitudinal_slip, slip_angle, inclination_angle, cleat_orientation, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `;

            return db.query(insertQuery, [
                row.number_of_runs || 0,
                row.tests || '',
                row.loads || '',
                row.inflation_pressure || '',
                row.test_velocity || '',
                row.longitudinal_slip || '',
                row.slip_angle || '',
                row.inclination_angle || '',
                row.cleat_orientation || '',
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

app.get('/api/get-ftire-data', (req, res) => {
    const query = 'SELECT * FROM ftire_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

app.get('/api/get-ftire-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM ftire_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []); // Changed from results to results.rows
    });
});

app.post('/api/store-cdtire-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    const truncateQuery = 'TRUNCATE TABLE cdtire_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }

        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO cdtire_data 
                (number_of_runs, test_name, inflation_pressure, velocity, preload,
                 camber, slip_angle, displacement, slip_range, cleat, road_surface, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            `;

            return db.query(insertQuery, [
                row.number_of_runs || 0,
                row.test_name || '',
                row.inflation_pressure || '',
                row.velocity || '',
                row.preload || '',
                row.camber || '',
                row.slip_angle || '',
                row.displacement || '',
                row.slip_range || '',
                row.cleat || '',
                row.road_surface || '',
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

app.get('/api/get-cdtire-data', (req, res) => {
    const query = 'SELECT * FROM cdtire_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

app.get('/api/get-cdtire-summary', (req, res) => {
    const query = `
        SELECT test_name, COUNT(*) as count
        FROM cdtire_data
        WHERE test_name IS NOT NULL AND test_name != ''
        GROUP BY test_name
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching CDTire summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []); // Changed from results to results.rows
    });
});

// Add Custom data endpoints
app.post('/api/store-custom-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    const truncateQuery = 'TRUNCATE TABLE custom_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO custom_data 
                (number_of_runs, tests, inflation_pressure, loads,
                 inclination_angle, slip_angle, slip_ratio, test_velocity, 
                 cleat_orientation, displacement, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `;

            return db.query(insertQuery, [
                row.number_of_runs || 0,
                row.tests || '',
                row.inflation_pressure || '',
                row.loads || '',
                row.inclination_angle || '',
                row.slip_angle || '',
                row.slip_ratio || '',
                row.test_velocity || '',
                row.cleat_orientation || '',
                row.displacement || '',
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

app.get('/api/get-custom-data', (req, res) => {
    const query = 'SELECT * FROM custom_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Using results.rows for PostgreSQL
    });
});

app.get('/api/get-custom-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM custom_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching Custom summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []);
    });
});

// Add new endpoints for folder management
app.post('/api/clear-folders', (req, res) => {
    const { projectName, protocol } = req.body;
    const combinedFolderName = `${projectName}_${protocol}`;
    const projectPath = path.join(__dirname, 'projects', combinedFolderName);

    try {
        if (fs.existsSync(projectPath)) {
            rimraf.sync(projectPath);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Error clearing folders'
        });
    }
});

app.post('/api/generate-parameters', (req, res) => {
    try {
        const referer = req.headers.referer || '';
        let templatePath;
        // Select template based on protocol page
        if (referer.includes('mf.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'mf62.inc');
        } else if (referer.includes('mf52.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'mf52.inc');
        } else if (referer.includes('ftire.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'ftire.inc');
        } else if (referer.includes('cdtire.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'cdtire.inc');
        } else if (referer.includes('custom.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'custom.inc');
        } else {
            throw new Error('Unknown protocol');
        }

        // Generate parameters.inc in the central template location
        // This file will be copied to individual Px_Ly folders during project creation
        const outputPath = path.join(__dirname, 'templates', 'inc', 'parameters.inc');

        // Read template file
        let content = fs.readFileSync(templatePath, 'utf8');

        // Replace parameter values, being careful with line matching
        const data = req.body;
        const replacements = {
            '^load1_kg=': `load1_kg=${data.load1_kg || ''}`,
            '^load2_kg=': `load2_kg=${data.load2_kg || ''}`,
            '^load3_kg=': `load3_kg=${data.load3_kg || ''}`,
            '^load4_kg=': `load4_kg=${data.load4_kg || ''}`,
            '^load5_kg=': `load5_kg=${data.load5_kg || ''}`,
            '^pressure1=': `pressure1=${data.pressure1 || ''}`,
            '^pressure2=': `pressure2=${data.pressure2 || ''}`,
            '^pressure3=': `pressure3=${data.pressure3 || ''}`,
            '^speed_kmph=': `speed_kmph=${data.speed_kmph || ''}`,
            '^IA=': `IA=${data.IA || ''}`,
            '^SA=': `SA=${data.SA || ''}`,
            '^SR=': `SR=${data.SR || ''}`,
            '^width=': `width=${data.width || ''}`,
            '^diameter=': `diameter=${data.diameter || ''}`,
            '^Outer_diameter=': `Outer_diameter=${data.Outer_diameter || ''}`,
            '^nomwidth=': `nomwidth=${data.nomwidth || ''}`,
            '^aspratio=': `aspratio=${data.aspratio || ''}`
        };

        // Replace each parameter if it exists in the template with exact line start matching
        Object.entries(replacements).forEach(([key, value]) => {
            const regex = new RegExp(key + '.*', 'm');
            if (content.match(regex)) {
                content = content.replace(regex, value);
            }
        });

        // Write new parameter file
        fs.writeFileSync(outputPath, content);

        res.json({
            success: true,
            message: 'Parameter file generated successfully'
        });
    } catch (err) {
        console.error('Error generating parameter file:', err);
        res.status(500).json({
            success: false,
            message: 'Error generating parameter file'
        });
    }
});

// Configure multer for mesh file upload (temporary storage)
const meshFileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'temp');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Keep original filename
        cb(null, file.originalname);
    }
});

const uploadMeshFile = multer({ storage: meshFileStorage });

// Add new endpoint for uploading mesh files temporarily
app.post('/api/upload-mesh-file', uploadMeshFile.single('meshFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file received'
        });
    }

    res.json({
        success: true,
        message: 'Mesh file uploaded successfully',
        filename: req.file.originalname
    });
});

// Add new endpoint for protocol-based folder creation on submit
app.post('/api/create-protocol-folders', (req, res) => {
    const { projectName, protocol } = req.body; if (!projectName || !protocol) {
        return res.status(400).json({
            success: false,
            message: 'Project name and protocol are required'
        });
    }
    // Function to generate unique folder name
    function generateUniqueFolderName(baseName, basePath) {
        let counter = 1;
        let uniqueName = baseName;
        let fullPath = path.join(basePath, uniqueName);

        // If folder doesn't exist, use the original name
        if (!fs.existsSync(fullPath)) {
            return uniqueName;
        }

        // If folder exists, remove it completely and create fresh
        if (fs.existsSync(fullPath)) {
            rimraf.sync(fullPath);
        }

        return uniqueName;
    }

    const baseCombinedName = `${projectName}_${protocol}`;
    const basePath = path.join(__dirname, 'projects');
    const combinedFolderName = generateUniqueFolderName(baseCombinedName, basePath);
    const projectPath = path.join(basePath, combinedFolderName);

    try {
        // Create base project folder
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        // Map protocol names to their template folder names
        const protocolMap = {
            'MF62': 'MF6pt2',
            'MF52': 'MF5pt2',
            'FTire': 'FTire',
            'CDTire': 'CDTire',
            'Custom': 'Custom'
        };

        const templateProtocolName = protocolMap[protocol];
        if (!templateProtocolName) {
            throw new Error(`Unknown protocol: ${protocol}`);
        }

        const templatePath = path.join(__dirname, 'templates', templateProtocolName);

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template folder not found: ${templatePath}`);
        }

        // Copy all template subfolders (P1_L1, P1_L2, etc.) to the project folder
        const subfolders = fs.readdirSync(templatePath).filter(item =>
            fs.statSync(path.join(templatePath, item)).isDirectory()
        );

        if (subfolders.length === 0) {
            throw new Error(`No subfolders found in template: ${templatePath}`);
        }

        subfolders.forEach(subfolder => {
            const sourceSubfolder = path.join(templatePath, subfolder);
            const destSubfolder = path.join(projectPath, subfolder);

            // Create destination subfolder
            if (!fs.existsSync(destSubfolder)) {
                fs.mkdirSync(destSubfolder, { recursive: true });
            }

            // Copy all files from template subfolder recursively
            function copyFolderSync(src, dest) {
                if (!fs.existsSync(dest)) {
                    fs.mkdirSync(dest, { recursive: true });
                }

                const items = fs.readdirSync(src);
                items.forEach(item => {
                    const srcPath = path.join(src, item);
                    const destPath = path.join(dest, item);

                    if (fs.statSync(srcPath).isDirectory()) {
                        copyFolderSync(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                });
            }

            copyFolderSync(sourceSubfolder, destSubfolder);
        });

        // Copy parameters.inc from central template location to each subfolder
        const centralParametersPath = path.join(__dirname, 'templates', 'inc', 'parameters.inc');
        if (fs.existsSync(centralParametersPath)) {
            subfolders.forEach(subfolder => {
                const destParametersPath = path.join(projectPath, subfolder, 'parameters.inc');
                fs.copyFileSync(centralParametersPath, destParametersPath);
            });
        }

        // Copy mesh file to all P_L folders if it exists
        const tempDir = path.join(__dirname, 'temp');
        if (fs.existsSync(tempDir)) {
            const meshFiles = fs.readdirSync(tempDir).filter(file => file.endsWith('.inp'));
            if (meshFiles.length > 0) {
                const meshFile = meshFiles[0]; // Use the first mesh file found
                const sourceMeshPath = path.join(tempDir, meshFile);

                subfolders.forEach(subfolder => {
                    const destMeshPath = path.join(projectPath, subfolder, meshFile);
                    try {
                        fs.copyFileSync(sourceMeshPath, destMeshPath);
                    } catch (copyErr) {
                        console.error(`Error copying mesh file to ${subfolder}:`, copyErr);
                    }
                });
                // Clean up temporary mesh file
                try {
                    fs.unlinkSync(sourceMeshPath);
                } catch (cleanupErr) {
                    console.error('Error cleaning up temporary mesh file:', cleanupErr);
                }
            }

            // Clean up the entire temp directory after mesh file copying is done
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (cleanupErr) {
                console.error('Error cleaning up temp directory:', cleanupErr);
            }
        }

        // Clean up parameters.inc from templates/inc/ after copying to all P_L folders
        try {
            if (fs.existsSync(centralParametersPath)) {
                fs.unlinkSync(centralParametersPath);
            }
        } catch (cleanupErr) {
            console.error('Error cleaning up central parameters.inc file:', cleanupErr);
        }

        res.json({
            success: true,
            message: 'Protocol folders created successfully',
            foldersCreated: subfolders,
            projectPath: combinedFolderName
        });

    } catch (err) {
        console.error('Error creating protocol folders:', err);
        res.status(500).json({
            success: false,
            message: 'Error creating protocol folders: ' + err.message
        });
    }
});

// Add new endpoint for getting row data with p, l, job, old_job, template_tydex, tydex_name
app.get('/api/get-row-data', (req, res) => {
    const { protocol, runNumber } = req.query;

    if (!protocol || !runNumber) {
        return res.status(400).json({
            success: false,
            message: 'Protocol and run number are required'
        });
    }

    // Map protocol to table name and column variations
    const tableMap = {
        'mf62': 'mf_data',
        'mf52': 'mf52_data',
        'ftire': 'ftire_data',
        'cdtire': 'cdtire_data',
        'custom': 'custom_data'
    };

    const tableName = tableMap[protocol.toLowerCase()];
    if (!tableName) {
        return res.status(400).json({
            success: false,
            message: 'Invalid protocol'
        });
    }

    // Build query based on available columns for each protocol
    let query;
    if (protocol.toLowerCase() === 'ftire') {
        // FTire uses longitudinal_slip instead of slip_ratio
        query = `SELECT p, l, job, old_job, template_tydex, tydex_name, slip_angle, longitudinal_slip as slip_ratio, inclination_angle FROM ${tableName} WHERE number_of_runs = $1`;
    } else if (protocol.toLowerCase() === 'cdtire') {
        // CDTire doesn't have inclination_angle or slip_ratio, has slip_range
        query = `SELECT p, l, job, old_job, template_tydex, tydex_name, slip_angle, slip_range as slip_ratio, NULL as inclination_angle FROM ${tableName} WHERE number_of_runs = $1`;
    } else {
        // MF62, MF52, Custom have standard columns
        query = `SELECT p, l, job, old_job, template_tydex, tydex_name, slip_angle, slip_ratio, inclination_angle FROM ${tableName} WHERE number_of_runs = $1`;
    }

    db.query(query, [runNumber], (err, results) => {
        if (err) {
            console.error('Error fetching row data:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching row data'
            });
        }

        if (results.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Row not found'
            });
        }

        res.json({
            success: true,
            data: results.rows[0]
        });
    });
});

// Add new endpoint for checking ODB file existence
app.get('/api/check-odb-file', (req, res) => {
    const { projectName, protocol, folderName, jobName } = req.query;

    if (!projectName || !protocol || !folderName || !jobName) {
        return res.status(400).json({
            success: false,
            message: 'All parameters are required'
        });
    }
    const combinedFolderName = `${projectName}_${protocol}`;
    const odbPath = path.join(__dirname, 'projects', combinedFolderName, folderName, `${jobName}.odb`);

    const exists = fs.existsSync(odbPath);

    res.json({
        success: true,
        exists: exists,
        path: odbPath
    });
});

// Add new endpoint for checking TYDEX file existence
app.get('/api/check-tydex-file', (req, res) => {
    const { projectName, protocol, folderName, tydexName } = req.query;

    if (!projectName || !protocol || !folderName || !tydexName) {
        return res.status(400).json({
            success: false,
            message: 'All parameters are required'
        });
    }

    const combinedFolderName = `${projectName}_${getProtocolAbbreviation(protocol)}`;

    // Ensure tydex_name has .tdx extension
    let fileName = tydexName.trim();
    if (!fileName.endsWith('.tdx')) {
        fileName += '.tdx';
    }

    const tydexPath = path.join(__dirname, 'projects', combinedFolderName, folderName, fileName);

    const exists = fs.existsSync(tydexPath);

    res.json({
        success: true,
        exists: exists,
        path: tydexPath
    });
});

// Add new endpoint for job dependency resolution
app.post('/api/resolve-job-dependencies', (req, res) => {
    const { projectName, protocol, runNumber } = req.body;

    if (!projectName || !protocol || !runNumber) {
        return res.status(400).json({
            success: false,
            message: 'Project name, protocol, and run number are required'
        });
    }

    // Map protocol to table name
    const tableMap = {
        'mf62': 'mf_data',
        'mf52': 'mf52_data',
        'ftire': 'ftire_data',
        'cdtire': 'cdtire_data',
        'custom': 'custom_data'
    };

    const tableName = tableMap[protocol.toLowerCase()];
    if (!tableName) {
        return res.status(400).json({
            success: false,
            message: 'Invalid protocol'
        });
    }
    const combinedFolderName = `${projectName}_${protocol}`;
    const projectPath = path.join(__dirname, 'projects', combinedFolderName);    // Function to recursively resolve job dependencies with enhanced backtracking
    async function resolveDependencies(jobName, visitedJobs = new Set(), callerContext = null) {
        try {
            // Prevent infinite loops
            if (visitedJobs.has(jobName)) {
                console.log(`Circular dependency detected for job: ${jobName}, skipping`);
                return { success: true, message: `Circular dependency avoided for ${jobName}` };
            }
            visitedJobs.add(jobName);

            console.log(`\n=== Resolving dependencies for job: ${jobName} ===`);

            // Strict folder containment: Only look for jobs in the current P_L folder
            let jobData = null;
            let actualJobName = jobName;

            // Look for the job in caller's context (P_L folder) - and ONLY in this folder
            if (callerContext) {
                console.log(`Searching for job "${jobName}" in folder ${callerContext.p}_${callerContext.l}...`);
                jobData = await findJobInFolder(jobName, callerContext.p, callerContext.l);
                if (jobData) {
                    actualJobName = jobData.job;
                    console.log(`✓ Found "${actualJobName}" in folder ${callerContext.p}_${callerContext.l}`);
                }
            }

            // If not found in folder, throw error - we never search globally
            if (!jobData) {
                throw new Error(`Job "${jobName}" not found in folder ${callerContext ? callerContext.p + '_' + callerContext.l : 'unknown'}. Dependencies must exist within the same P_L folder.`);
            }

            const folderName = `${jobData.p}_${jobData.l}`;
            const folderPath = path.join(projectPath, folderName);

            // Check if current job's ODB already exists
            const odbJobName = actualJobName.endsWith('.inp') ? actualJobName.replace('.inp', '') : actualJobName;
            const odbPath = path.join(folderPath, `${odbJobName}.odb`);
            if (fs.existsSync(odbPath)) {
                console.log(`✓ ODB already exists for job: ${odbJobName} in ${folderName}`);
                return { success: true, message: `Job ${odbJobName} already completed` };
            }

            // Step 3: Recursively resolve dependencies (old_job)
            if (jobData.old_job && jobData.old_job !== '-') {
                console.log(`Step 3: Resolving dependency "${jobData.old_job}" for job "${actualJobName}"`);

                // Recursively resolve the dependency first (backtracking approach)
                const dependencyResult = await resolveDependencies(jobData.old_job, visitedJobs, { p: jobData.p, l: jobData.l });
                if (!dependencyResult.success) {
                    throw new Error(`Failed to resolve dependency ${jobData.old_job}: ${dependencyResult.message}`);
                }
            } else {
                console.log(`Step 3: No dependencies for job "${actualJobName}" (old_job: ${jobData.old_job})`);
            }

            // Step 4: Execute current job after all dependencies are resolved
            console.log(`Step 4: Executing job "${odbJobName}" in folder ${folderName}...`);
            const executeResult = await executeAbaqusJob(folderPath, odbJobName, jobData.old_job, folderName);
            if (!executeResult.success) {
                throw new Error(`Failed to execute job ${odbJobName} in folder ${folderName}: ${executeResult.message}`);
            }

            console.log(`✓ Successfully executed job "${odbJobName}" in folder ${folderName}`);
            return { success: true, message: `Job ${odbJobName} executed successfully` };

        } catch (error) {
            console.error(`Error resolving dependencies for ${jobName}:`, error);
            throw error;
        }
    }
    // Helper function to find job in specific folder
    async function findJobInFolder(jobName, p, l) {
        const searchNames = [
            jobName,
            jobName.endsWith('.inp') ? jobName.replace('.inp', '') : jobName + '.inp'
        ];

        for (const searchName of searchNames) {
            const query = `SELECT p, l, job, old_job FROM ${tableName} WHERE job = $1 AND p = $2 AND l = $3`;
            const result = await db.query(query, [searchName, p, l]);
            if (result.rows.length > 0) {
                return result.rows[0];
            }
        }
        return null;
    }// Function to execute Abaqus job with enhanced dependency handling
    function executeAbaqusJob(folderPath, jobName, oldJobName, folderName = '') {
        return new Promise((resolve) => {
            try {
                // Ensure job names are clean (without .inp for command execution)
                const cleanJobName = jobName.endsWith('.inp') ? jobName.replace('.inp', '') : jobName;

                let command;
                // Handle cases where old_job exists vs doesn't exist
                if (oldJobName && oldJobName !== '-') {
                    const cleanOldJobName = oldJobName.endsWith('.inp') ? oldJobName.replace('.inp', '') : oldJobName;
                    command = `abaqus job=${cleanJobName} oldjob=${cleanOldJobName} input=${cleanJobName}.inp`;
                    console.log(`Executing with dependency in ${folderName}: ${command}`);
                } else {
                    command = `abaqus job=${cleanJobName} input=${cleanJobName}.inp`;
                    console.log(`Executing without dependency in ${folderName}: ${command}`);
                }

                console.log(`Working directory: ${folderPath}`);

                // Broadcast run start
                broadcastSse('run-status', { run: cleanJobName, folder: folderName, status: 'running', progress: 0 });

                const abaqusProcess = spawn('cmd', ['/c', command], {
                    cwd: folderPath,
                    shell: true
                });

                let output = '';
                let errorOutput = '';

                abaqusProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });

                abaqusProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                abaqusProcess.on('close', (code) => {
                    console.log(`Process finished with exit code: ${code} for job ${cleanJobName} in ${folderName}`);
                    if (code === 0) {
                        // Broadcast run completion
                        broadcastSse('run-status', { run: cleanJobName, folder: folderName, status: 'done', progress: 100 });
                        resolve({ success: true, output: output });
                    } else {
                        // Broadcast run failure
                        broadcastSse('run-status', { run: cleanJobName, folder: folderName, status: 'failed', message: errorOutput || output, progress: 100 });
                        resolve({ success: false, message: `Process exited with code ${code} in folder ${folderName}`, error: errorOutput, output: output });
                    }
                });

                abaqusProcess.on('error', (error) => {
                    console.error(`Process spawn error in ${folderName}: ${error.message}`);
                    resolve({
                        success: false,
                        message: `Failed to start process in ${folderName}: ${error.message}`
                    });
                });

            } catch (error) {
                console.error(`Function execution error in ${folderName}: ${error.message}`);
                resolve({
                    success: false,
                    message: `Error executing job in ${folderName}: ${error.message}`
                });
            }
        });
    }

    // Start the dependency resolution process
    (async () => {
        try {
            // Get the initial job data
            const query = `SELECT p, l, job, old_job FROM ${tableName} WHERE number_of_runs = $1`;
            const result = await db.query(query, [runNumber]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Row not found'
                });
            }

            const rowData = result.rows[0];

            if (!fs.existsSync(projectPath)) {
                return res.status(404).json({
                    success: false,
                    message: 'Project folder not found'
                });
            }
            console.log(`Starting dependency resolution for job: ${rowData.job} in context P${rowData.p}_L${rowData.l}`);
            // Pass the initial job's context to help with dependency resolution
            const initialContext = { p: rowData.p, l: rowData.l };
            await resolveDependencies(rowData.job, new Set(), initialContext);

            res.json({
                success: true,
                message: `Job ${rowData.job} and all dependencies executed successfully`
            });

        } catch (error) {
            console.error('Error in dependency resolution:', error);
            res.status(500).json({
                success: false,
                message: `Error resolving dependencies: ${error.message}`
            });
        }
    })();
});

// Add endpoint for checking job completion status more comprehensively
app.get('/api/check-job-status', (req, res) => {
    const { projectName, protocol, folderName, jobName } = req.query;

    if (!projectName || !protocol || !folderName || !jobName) {
        return res.status(400).json({
            success: false,
            message: 'All parameters are required'
        });
    }
    const combinedFolderName = `${projectName}_${protocol}`;
    const jobPath = path.join(__dirname, 'projects', combinedFolderName, folderName);

    try {
        // Check for various file types to determine job status
        const odbFile = path.join(jobPath, `${jobName}.odb`);
        const staFile = path.join(jobPath, `${jobName}.sta`);
        const msgFile = path.join(jobPath, `${jobName}.msg`);

        let status = 'not_started';
        let message = '';

        if (fs.existsSync(odbFile)) {
            status = 'completed';
            message = 'Job completed successfully - ODB file exists';
        } else if (fs.existsSync(staFile)) {
            // Check status file content
            try {
                const staContent = fs.readFileSync(staFile, 'utf8');
                if (staContent.includes('COMPLETED')) {
                    status = 'completed';
                    message = 'Job completed according to status file';
                } else if (staContent.includes('ABORTED') || staContent.includes('ERROR')) {
                    status = 'error';
                    message = 'Job aborted or encountered error';
                } else {
                    status = 'running';
                    message = 'Job is currently running';
                }
            } catch (readErr) {
                status = 'running';
                message = 'Status file exists but could not be read';
            }
        } else if (fs.existsSync(msgFile)) {
            status = 'running';
            message = 'Job started - message file exists';
        }

        res.json({
            success: true,
            status: status,
            message: message,
            files: {
                odb: fs.existsSync(odbFile),
                sta: fs.existsSync(staFile),
                msg: fs.existsSync(msgFile)
            }
        });

    } catch (err) {
        console.error('Error checking job status:', err);
        res.status(500).json({
            success: false,
            message: 'Error checking job status: ' + err.message
        });
    }
});

app.post('/api/save-project', authenticateToken, async (req, res) => {
  try {
    const { project_name, region, department, tyre_size, protocol, status, inputs } = req.body;
    const userEmail = req.user.email;

    const result = await db.query(`
      INSERT INTO projects
        (project_name, region, department, tyre_size, protocol, status, created_at, user_email, inputs)
      VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,$7,$8)
      RETURNING id
    `, [
      project_name,
      region,
      department,
      tyre_size,
      protocol,
      status,
      userEmail,
      inputs || {}   // make sure it’s an object
    ]);

    res.json({ success: true, message: 'Project saved successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error saving project:', error);
    res.status(500).json({ success: false, message: 'Failed to save project' });
  }
});


// Update the project history endpoint (engineers = own, managers = all with ?all=1)
app.get('/api/project-history', authenticateToken, async (req, res) => {
  try {
    const viewAll = req.query.all === '1' || req.query.view === 'all';
    const isManager = req.user && req.user.role === 'manager';

    const baseFields = `
      id, project_name, region, department, tyre_size, protocol,
      created_at, status, completed_at, user_email
    `;

    let sql, params;
    if (viewAll && isManager) {
      // Manager view: all users’ projects
      sql = `SELECT ${baseFields} FROM projects ORDER BY created_at DESC`;
      params = [];
    } else {
      // Default/engineer view: only their own projects
      sql = `SELECT ${baseFields} FROM projects WHERE user_email = $1 ORDER BY created_at DESC`;
      params = [req.user.email];
    }

    const result = await db.query(sql, params);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project history',
      details: error.message
    });
  }
});

// === Rename a project (PATCH preferred; PUT kept for fallback) ===
// Place ABOVE: app.all('/api/*', ...) and below your other project endpoints.

async function canRenameProject(db, requester, projectId) {
  // Managers can rename anything; engineers can rename only their own projects
  if (!requester) return false;
  if (requester.role === 'manager') return true;

  const r = await db.query('SELECT user_email FROM projects WHERE id = $1', [projectId]);
  if (!r.rows.length) return false;
  return r.rows[0].user_email === requester.email;
}

async function renameProjectHandler(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { project_name } = req.body || {};
    if (!id || !project_name || !project_name.trim()) {
      return res.status(400).json({ success: false, message: 'Valid project id and project_name required' });
    }

    // Check the project exists
    const existing = await db.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Project not found' });

    // Authorization
    const allowed = await canRenameProject(db, req.user, id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Forbidden' });

    // Update ONLY the name (no updated_at column in your schema)
    const q = 'UPDATE projects SET project_name = $1 WHERE id = $2 RETURNING id, project_name';
    const r = await db.query(q, [project_name.trim(), id]);

    return res.json({ success: true, project: r.rows[0] });
  } catch (err) {
    console.error('PATCH /api/projects/:id/name error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Auth required so req.user is available
app.patch('/api/projects/:id/name', authenticateToken, renameProjectHandler);
app.put('/api/projects/:id/name', authenticateToken, renameProjectHandler); // front-end fallback


// Add this with your other endpoints
app.post('/api/mark-project-complete', async (req, res) => {
    try {
        const { project_name } = req.body;

        // First, check if project exists
        const checkQuery = 'SELECT * FROM projects WHERE project_name = $1';
        const checkResult = await db.query(checkQuery, [project_name]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Update project status and completion time
        const updateQuery = `
            UPDATE projects 
            SET status = 'Completed', 
                completed_at = CURRENT_TIMESTAMP 
            WHERE project_name = $1
            RETURNING completed_at
        `;

        const result = await db.query(updateQuery, [project_name]);

        if (result.rows.length > 0) {
            res.json({
                success: true,
                message: 'Project marked as completed',
                completed_at: result.rows[0].completed_at
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update project status'
            });
        }
    } catch (error) {
        console.error('Error marking project as complete:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark project as complete'
        });
    }
});

// POST /api/mark-project-in-progress
app.post('/api/mark-project-in-progress', async (req, res) => {
  try {
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ success: false, message: 'projectName required' });

    const q = `
      UPDATE projects
      SET status = $1, completed_at = NULL
      WHERE project_name = $2
      RETURNING id, project_name, status, completed_at
    `;
    const r = await db.query(q, ['In Progress', projectName]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.json({ success: true, project: r.rows[0] });
  } catch (err) {
    console.error('mark-project-in-progress error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/check-project-exists
app.post('/api/check-project-exists', async (req, res) => {
  try {
    const { projectName, protocol } = req.body;
    if (!projectName) return res.status(400).json({ success: false, message: 'projectName required' });

    // Search by project_name (and protocol if provided)
    let q = 'SELECT id, project_name, protocol FROM projects WHERE project_name = $1';
    const params = [projectName];
    if (protocol) {
      q = 'SELECT id, project_name, protocol FROM projects WHERE project_name = $1 AND protocol = $2';
      params.push(protocol);
    }

    const r = await db.query(q, params);
    const exists = r.rows.length > 0;
    const folderName = projectName + (protocol ? `_${protocol}` : '');
    res.json({ success: true, exists, folderName, project: r.rows[0] || null });
  } catch (err) {
    console.error('/api/check-project-exists', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Fix GET /api/projects/:id to return proper 404 or project
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const q = 'SELECT * FROM projects WHERE id = $1';
    const r = await db.query(q, [id]);
    if (!r.rows || r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    return res.json({ success: true, project: r.rows[0] });
  } catch (err) {
    console.error('GET /api/projects/:id error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Fix PUT /api/projects/:id/inputs to return proper responses
app.put('/api/projects/:id/inputs', async (req, res) => {
  try {
    const { id } = req.params;
    const inputs = req.body.inputs || null;
    const q = 'UPDATE projects SET inputs = $1 WHERE id = $2 RETURNING id, inputs';
    const r = await db.query(q, [inputs, id]);
    if (!r.rows || r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    return res.json({ success: true, inputs: r.rows[0].inputs });
  } catch (err) {
    console.error('PUT /api/projects/:id/inputs error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Manager APIs (requires authenticateToken + requireManager)
app.get('/api/manager/users', authenticateToken, requireManager, async (req, res) => {
  try {
    // Return users with project counts
    const q = `
      SELECT u.id, u.email, u.role, u.created_at, u.last_login,
             COALESCE(p.project_count, 0) AS project_count
      FROM users u
      LEFT JOIN (
        SELECT user_email, COUNT(*) AS project_count
        FROM projects
        GROUP BY user_email
      ) p ON p.user_email = u.email
      WHERE u.role = 'engineer'
      ORDER BY u.created_at DESC
    `;
    const r = await db.query(q);
    res.json({ success: true, users: r.rows });
  } catch (err) {
    console.error('/api/manager/users error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/manager/add-user', authenticateToken, requireManager, async (req, res) => {
  try {
    const { email, password, role = 'engineer' } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    const hashed = await bcrypt.hash(password, 10);
    const insertQ = 'INSERT INTO users (email, password, role, created_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP) RETURNING id, email, role';
    const r = await db.query(insertQ, [email, hashed, role]);
    res.json({ success: true, user: r.rows[0] });
  } catch (err) {
    console.error('/api/manager/add-user error', err);
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Email already exists' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Lightweight notifications & recent-activity stubs used by manager dashboard
app.get('/api/manager/notifications', authenticateToken, requireManager, async (req, res) => {
  try {
    // Replace with real notifications query if you have one
    const notifications = []; // e.g. fetch recent system messages
    res.json({ success: true, notifications });
  } catch (err) {
    console.error('/api/manager/notifications error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/manager/recent-activity', authenticateToken, requireManager, async (req, res) => {
  try {
    // Replace with real activity query if you have one
    const activities = []; // e.g. fetch recent manager-visible events
    res.json({ success: true, activities });
  } catch (err) {
    console.error('/api/manager/recent-activity error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Simple Server-Sent Events endpoint for run status updates
const sseClients = new Set();

function broadcastSse(eventName, payload) {
  const data = `event: ${eventName}\n` + `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (e) { /* ignore broken client */ }
  }
}

app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  sseClients.add(res);

  // keepalive ping
  const ping = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

// Start the server
const port = process.env.PORT || 3001;

const startServer = (attemptPort) => {
    app.listen(attemptPort)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${attemptPort} is busy, trying ${attemptPort + 1}...`);
                startServer(attemptPort + 1);
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            console.log(`Server running on port ${attemptPort}`);
        });
};

startServer(port);

// Add TYDEX generation endpoint
app.post('/api/generate-tydex', async (req, res) => {
    try {
        const { protocol, projectName, rowData } = req.body;

        if (!protocol || !projectName || !rowData || !rowData.template_tydex) {
            return res.json({ success: false, message: 'Missing required parameters or template_tydex' });
        }

        // Use template_tydex to find the template file
        let templateFileName = rowData.template_tydex.trim();
        if (!templateFileName.endsWith('.tdx')) {
            templateFileName += '.tdx';
        }
        let outputFileName = rowData.tydex_name ? rowData.tydex_name.trim() : templateFileName;
        if (!outputFileName.endsWith('.tdx')) {
            outputFileName += '.tdx';
        }

        const projectFolder = `${projectName}_${getProtocolAbbreviation(protocol)}`;
        const outputDir = path.join(__dirname, 'projects', projectFolder, `${rowData.p}_${rowData.l}`);
        const odbName = rowData.job ? rowData.job.replace(/\.inp$/i, '') : '';
        const odbPath = path.join(outputDir, `${odbName}.odb`);
        const pythonScriptPath = path.join(__dirname, 'extract_odb_data.py');
        const tempDir = path.join(outputDir, 'temp');
        const templatePath = path.join(__dirname, 'templates', 'Tydex', protocol, templateFileName);
        const outputPath = path.join(outputDir, outputFileName);

        // Step 1: Run the Python script to extract ODB data
        if (!fs.existsSync(odbPath)) {
            return res.json({ success: false, message: `ODB file not found: ${odbPath}` });
        }
        if (!fs.existsSync(pythonScriptPath)) {
            return res.json({ success: false, message: `Python script not found: ${pythonScriptPath}` });
        }

        // Run "abaqus python extract_odb_data.py odbPath outputDir"
        await new Promise((resolve, reject) => {
            const args = [
                'python',
                `"${pythonScriptPath}"`,
                `"${odbPath}"`,
                `"${outputDir}"`
            ];
            // Use spawn with shell to allow quoted paths
            const cmd = `abaqus ${args.join(' ')}`;
            const proc = spawn('cmd', ['/c', cmd], { cwd: __dirname, shell: true });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', data => { stdout += data.toString(); });
            proc.stderr.on('data', data => { stderr += data.toString(); });

            proc.on('close', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Python script failed: ${stderr || stdout}`));
                }
            });
            proc.on('error', err => reject(err));
        });

        // Step 2: Check if temp folder was created
        if (!fs.existsSync(tempDir)) {
            return res.json({ success: false, message: 'CSV temp directory not found after running Python script.' });
        }
        // Step 3: Check if template exists
        if (!fs.existsSync(templatePath)) {
            const tydexDir = path.join(__dirname, 'templates', 'Tydex', protocol);
            let availableTemplates = [];
            if (fs.existsSync(tydexDir)) {
                availableTemplates = fs.readdirSync(tydexDir).filter(file => file.endsWith('.tdx'));
            }
            return res.json({
                success: false,
                message: `Template file not found: ${templateFileName}. Available templates: ${availableTemplates.join(', ') || 'None found'}`
            });
        }

        // Step 4: Read template and generate TYDEX as before
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const processedContent = await processTydexTemplate(templateContent, tempDir, rowData);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(outputPath, processedContent, 'utf8');
        res.json({ success: true, message: 'TYDEX file generated successfully' });

    } catch (error) {
        console.error('Error generating TYDEX:', error);
        res.json({ success: false, message: `Error: ${error.message}` });
    }
});

// Add new endpoint for opening TYDEX file in notepad
app.post('/api/open-tydex-file', (req, res) => {
    try {
        const { protocol, projectName, p, l, tydex_name } = req.body;

        if (!protocol || !projectName || !p || !l || !tydex_name) {
            return res.json({ success: false, message: 'Missing required parameters' });
        }

        // Construct the file path
        const projectFolder = `${projectName}_${getProtocolAbbreviation(protocol)}`;
        const folderName = `${p}_${l}`;

        // Ensure tydex_name has .tdx extension
        let fileName = tydex_name.trim();
        if (!fileName.endsWith('.tdx')) {
            fileName += '.tdx';
        }

        const filePath = path.join(__dirname, 'projects', projectFolder, folderName, fileName);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.json({ success: false, message: `TYDEX file not found: ${fileName}` });
        }

        // Open file in notepad (spawn is already declared at the top)
        spawn('notepad.exe', [filePath], { detached: true });

        res.json({ success: true, message: 'TYDEX file opened in notepad' });

    } catch (error) {
        console.error('Error opening TYDEX file:', error);
        res.json({ success: false, message: `Error: ${error.message}` });
    }
});

function getProtocolAbbreviation(protocol) {
    switch (protocol) {
        case 'MF6pt2': return 'MF62';
        case 'MF5pt2': return 'MF52';
        case 'FTire': return 'FTire';
        case 'CDTire': return 'CDTire';
        case 'Custom': return 'Custom';
        default: return protocol;
    }
}

async function processTydexTemplate(templateContent, csvDir, rowData = null) {
    const lines = templateContent.split('\n');
    let inMeasurChannels = false;
    let inMeasurData = false;
    let inHeader = false;
    let inConstants = false;
    let channelMapping = {};
    let processedLines = [];

    // Get current date and time
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).replace(/,/g, '-'); // Format: DD-MMM-YYYY (e.g., 15-Jan-2024)

    const currentTime = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) + ' IST'; // Format: HH:MM AM/PM IST

    // Extract ODB file name from csvDir path for MEASID
    const odbFileName = path.basename(path.dirname(csvDir)); // Get parent directory name which should be the P_L folder
    const parentPath = path.dirname(path.dirname(csvDir)); // Get project folder path
    const projectFolderName = path.basename(parentPath); // Get project folder name

    // Try to find ODB file in the P_L folder to get actual name
    let measId = 'unknown_measurement';
    try {
        const plFolderPath = path.dirname(csvDir);
        const files = fs.readdirSync(plFolderPath);
        const odbFile = files.find(file => file.endsWith('.odb'));
        if (odbFile) {
            measId = odbFile.replace('.odb', ''); // Remove .odb extension
        }
    } catch (error) {
        console.warn('Could not determine ODB file name for MEASID:', error.message);
    }

    // Read parameters.inc file to get parameter values
    const parametersPath = path.join(path.dirname(csvDir), 'parameters.inc');
    let parameterValues = {};

    if (fs.existsSync(parametersPath)) {
        try {
            const parametersContent = fs.readFileSync(parametersPath, 'utf8');
            parameterValues = parseParametersFile(parametersContent);
        } catch (error) {
            console.warn('Could not read parameters.inc file:', error.message);
        }
    }

    // First pass: identify channel mappings and process header/constants
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('**HEADER')) {
            inHeader = true;
            inConstants = false;
            processedLines.push(line);
            continue;
        }

        if (line.includes('**CONSTANTS')) {
            inHeader = false;
            inConstants = true;
            processedLines.push(line);
            continue;
        }

        if (line.includes('**MEASURCHANNELS')) {
            inHeader = false;
            inConstants = false;
            inMeasurChannels = true;
            processedLines.push(line);
            continue;
        }

        if (line.includes('**MEASURDATA')) {
            inHeader = false;
            inConstants = false;
            inMeasurChannels = false;
            inMeasurData = true;
            processedLines.push(line);
            continue;
        }

        // Check for any other ** section
        if (line.startsWith('**') && !line.includes('**HEADER') && !line.includes('**CONSTANTS') && !line.includes('**MEASURCHANNELS') && !line.includes('**MEASURDATA')) {
            inHeader = false;
            inConstants = false;
            inMeasurChannels = false;
            inMeasurData = false;
            processedLines.push(line);
            continue;
        }

        if (inHeader && line.trim()) {
            // Process header lines for DATE, CLCKTIME, SUPPLIER, and MEASID
            let processedLine = line;

           
            // For DATE lines: find the last non-whitespace sequence and replace it with current date
            if (line.trim().startsWith('DATE')) {
                processedLine = line.replace(/\S+(?=\s*$)/, currentDate);
            }

            // For CLCKTIME lines: find the last non-whitespace sequence and replace it with current time
            if (line.trim().startsWith('CLCKTIME')) {
                processedLine = line.replace(/\S+(?=\s*$)/, currentTime);
            }

            // For SUPPLIER lines: replace everything after "Supplier" while preserving whitespace
            if (line.trim().startsWith('SUPPLIER')) {
                processedLine = line.replace(/(SUPPLIER\s+Data\s+Supplier\s+).*/, '$1Apollo/Vredestein');
            }

            // For MEASID lines: replace with ODB file name
            if (line.trim().startsWith('MEASID')) {
                processedLine = line.replace(/\S+(?=\s*$)/, measId);
            }

            processedLines.push(processedLine);
        } else if (inConstants && line.trim()) {
            // Process constants section
            let processedLine = line;

            // Map TYDEX constants to parameters.inc values
            if (line.trim().startsWith('RIMDIAME')) {
                // diameter from parameters.inc (convert to meters if needed)
                if (parameterValues.diameter) {
                    const diameterValue = (parseFloat(parameterValues.diameter) / 1000).toFixed(4); // Convert mm to m
                    processedLine = line.replace(/\S+(?=\s*$)/, diameterValue);
                }
            } else if (line.trim().startsWith('RIMWIDTH')) {
                // width from parameters.inc (convert to meters if needed)
                if (parameterValues.width) {
                    const widthValue = (parseFloat(parameterValues.width) / 1000).toFixed(4); // Convert mm to m
                    processedLine = line.replace(/\S+(?=\s*$)/, widthValue);
                }
            } else if (line.trim().startsWith('LONGVEL') || line.trim().startsWith('TRAJVELH')) {
                // speed from parameters.inc (convert km/h to m/s)
                if (parameterValues.speed_kmph) {
                    const velocityValue = (parseFloat(parameterValues.speed_kmph) * 1000 / 3600).toFixed(2);
                    processedLine = line.replace(/\S+(?=\s*$)/, velocityValue);
                }
            } else if (line.trim().startsWith('INFLPRES')) {
                // pressure1 from parameters.inc (convert PSI to Pa)
                if (parameterValues.pressure1) {
                    const pressureValue = (parseFloat(parameterValues.pressure1) * 6894.76).toFixed(0); // Convert PSI to Pa (1 PSI = 6894.76 Pa)
                    processedLine = line.replace(/\S+(?=\s*$)/, pressureValue);
                } 
            } else if (line.trim().startsWith('INCLANGL')) {
                // Use inclination angle from database row data only (convert degrees to radians)
                if (rowData && rowData.inclination_angle !== undefined) {
                    const inclinationValue = (parseFloat(rowData.inclination_angle) * Math.PI / 180).toFixed(4);
                    processedLine = line.replace(/\S+(?=\s*$)/, inclinationValue);
                }
            } else if (line.trim().startsWith('LONGSLIP')) {
                // Use slip ratio from database row data only (convert percentage to decimal)
                if (rowData && rowData.slip_ratio !== undefined) {
                    const slipValue = (parseFloat(rowData.slip_ratio) / 100).toFixed(4);
                    processedLine = line.replace(/\S+(?=\s*$)/, slipValue);
                }
            } else if (line.trim().startsWith('SLIPANGL')) {
                // Use slip angle from database row data only (convert degrees to radians)
                if (rowData && rowData.slip_angle !== undefined) {
                    const slipAngleValue = (parseFloat(rowData.slip_angle) * Math.PI / 180).toFixed(4);
                    processedLine = line.replace(/\S+(?=\s*$)/, slipAngleValue);
                }
            } else if (line.trim().startsWith('LOCATION')) {
                // Replace everything after "-" with "R&D Chennai"
                processedLine = line.replace(/(LOCATION\s+Location\s+-\s+).*/, '$1R&D Chennai');
            } else if (line.trim().startsWith('MANUFACT')) {
                // Replace everything after "-" with "Apollo/Vredestein", preserving original spacing
                processedLine = line.replace(/(MANUFACT\s+Tyre brand name\s+-\s+).*/, '$1Apollo/Vredestein');
            } else if (line.trim().startsWith('OVALLDIA')) {
                // Use Outside_diameter from parameters.inc (convert to meters)
                if (parameterValues.Outer_diameter) {
                    const ovallDiaValue = (parseFloat(parameterValues.Outer_diameter) / 1000).toFixed(3); // Convert mm to m
                    processedLine = line.replace(/\S+(?=\s*$)/, ovallDiaValue);
                }
            }

            processedLines.push(processedLine);
        } else if (inMeasurChannels && line.trim()) {
            // Parse channel definition: CHANNELNAME Unit description 1 0 0
            const parts = line.split(/\s+/);
            if (parts.length >= 4) {
                const channelName = parts[0];
                channelMapping[channelName] = Object.keys(channelMapping).length;
            }
            processedLines.push(line);
        } else if (inMeasurData && line.trim() && !line.startsWith('**')) {
            // This is measurement data - will be replaced
            processedLines.push(line);
        } else {
            // Preserve all other content unchanged
            processedLines.push(line);
        }
    }

    // Read CSV data
    const csvData = await readCsvData(csvDir, channelMapping);

    // Second pass: replace measurement data only
    const finalLines = [];
    inMeasurData = false;
    let dataRowCount = 0;

    for (let i = 0; i < processedLines.length; i++) {
        const line = processedLines[i];

        if (line.includes('**MEASURDATA')) {
            inMeasurData = true;
            // Extract the number from the line if present
            const match = line.match(/\*\*MEASURDATA\s+(\d+)/);
            if (match) {
                const newCount = csvData.maxRows || parseInt(match[1]);
                finalLines.push(`**MEASURDATA ${newCount}`);
            } else {
                finalLines.push(line);
            }
            continue;
        }

        // Check for any other ** section to end MEASURDATA processing
        if (line.startsWith('**') && !line.includes('**MEASURDATA')) {
            inMeasurData = false;
            finalLines.push(line);
            continue;
        }

        if (inMeasurData && line.trim() && !line.startsWith('**')) {
            // Replace with CSV data
            if (dataRowCount < csvData.maxRows) {
                const newDataLine = generateDataLine(csvData, channelMapping, dataRowCount, line);
                finalLines.push(newDataLine);
                dataRowCount++;
            }
        } else {
            // Preserve all other content unchanged
            finalLines.push(line);
        }
    }

    return finalLines.join('\n');
}

async function readCsvData(csvDir, channelMapping) {
    const csvData = {};
    let maxRows = 0;

    // Map common channel names to CSV file names
    const channelToCsvMap = {
        'FX': 'FX.csv',
        'FXW': 'FX.csv',
        'FYW': 'FYW.csv',
        'FYH': 'FYW.csv',
        'FZW': 'FZW.csv',
        'FZH': 'FZW.csv',
        'MXW': 'MXW.csv',
        'MXH': 'MXW.csv',
        'MZW': 'MZW.csv',
        'MZH': 'MZW.csv',
        'U1': 'U1.csv',
        'U2': 'U2.csv',
        'U3': 'U3.csv',
        'TYREDEFW': 'U3.csv', // Map TYREDEFW to U3 displacement data
        'DSTGRWHC': 'U3.csv', // Map DSTGRWHC to U3 for calculation
        'RUNTIME': 'FX.csv', // Use time from any CSV, fallback to U1.csv if FX not available
        'MEASNUMB': null // Will be generated as sequence
    };

    // Read parameters.inc file to get Outer_diameter value for DSTGRWHC calculation
    const parametersPath = path.join(path.dirname(csvDir), 'parameters.inc');
    let outerDiameter = 0;

    if (fs.existsSync(parametersPath)) {
        try {
            const parametersContent = fs.readFileSync(parametersPath, 'utf8');
            const parameters = parseParametersFile(parametersContent);
            outerDiameter = parseFloat(parameters.Outer_diameter) || 0;
        } catch (error) {
            console.warn('Could not read Outer_diameter from parameters.inc:', error.message);
        }
    }

    for (const [channelName, index] of Object.entries(channelMapping)) {
        const csvFileName = channelToCsvMap[channelName];

        if (csvFileName) {
            const csvPath = path.join(csvDir, csvFileName);

            if (fs.existsSync(csvPath)) {
                const csvContent = fs.readFileSync(csvPath, 'utf8');
                const lines = csvContent.split('\n').filter(line => line.trim());

                // Skip header line
                const dataLines = lines.slice(1);
                const values = dataLines.map(line => {
                    const parts = line.split(',');
                    if (channelName === 'RUNTIME') {
                        return parseFloat(parts[0]) || 0; // Time column
                    } else if (channelName === 'DSTGRWHC') {
                        // Calculate Outer_diameter/2 - U3 (convert mm to m and apply formula)
                        const u3Value = parseFloat(parts[1]) || 0; // U3 displacement value
                        const radiusInMeters = (outerDiameter) / 2; // Convert diameter to radius
                        return radiusInMeters - u3Value; // Distance from ground to wheel center
                    } else {
                        return parseFloat(parts[1]) || 0; // Value column
                    }
                });

                csvData[channelName] = values;
                maxRows = Math.max(maxRows, values.length);
            }
        } else if (channelName === 'MEASNUMB') {
            // Generate sequence numbers
            csvData[channelName] = [];
        } else if (channelName === 'RUNTIME' && !csvData[channelName]) {
            // Fallback: try to get runtime from U1.csv if FX.csv doesn't exist
            const fallbackPath = path.join(csvDir, 'U1.csv');
            if (fs.existsSync(fallbackPath)) {
                const csvContent = fs.readFileSync(fallbackPath, 'utf8');
                const lines = csvContent.split('\n').filter(line => line.trim());
                const dataLines = lines.slice(1);
                const values = dataLines.map(line => {
                    const parts = line.split(',');
                    return parseFloat(parts[0]) || 0; // Time column
                });
                csvData[channelName] = values;
                maxRows = Math.max(maxRows, values.length);
            }
        }
    }

    // Generate sequence numbers for MEASNUMB
    if (csvData['MEASNUMB'] !== undefined) {
        csvData['MEASNUMB'] = Array.from({ length: maxRows }, (_, i) => i + 1);
    }

    csvData.maxRows = maxRows;
    return csvData;
}

function generateDataLine(csvData, channelMapping, rowIndex, originalLine) {
    let processedLine = originalLine;

    // Get all the data values for this row
    const dataValues = {};
    for (const [channelName, columnIndex] of Object.entries(channelMapping)) {
        if (csvData[channelName] && rowIndex < csvData[channelName].length) {
            const value = csvData[channelName][rowIndex];

            // Format number to maintain reasonable precision
            if (channelName === 'MEASNUMB') {
                dataValues[columnIndex] = value.toString();
            } else if (channelName === 'RUNTIME') {
                dataValues[columnIndex] = value.toFixed(8);
            } else {
                dataValues[columnIndex] = value.toFixed(4);
            }
        }
    }

    // Process each value position in the line from left to right
    let currentColumnIndex = 0;
    let tempLine = processedLine;

    // Find all non-whitespace sequences and replace them one by one
    while (currentColumnIndex < Object.keys(channelMapping).length) {
        if (dataValues[currentColumnIndex] !== undefined) {
            const newValue = dataValues[currentColumnIndex];

            // Find the position of the current value to replace
            const regex = new RegExp(`(^|\\s+)(\\S+)`, 'g');
            let match;
            let valuePosition = 0;
            let lastMatch = null;

            // Find the specific value position we want to replace
            while ((match = regex.exec(tempLine)) !== null && valuePosition <= currentColumnIndex) {
                if (valuePosition === currentColumnIndex) {
                    lastMatch = match;
                    break;
                }
                valuePosition++;
            }

            if (lastMatch) {
                const fullMatch = lastMatch[0];
                const whitespace = lastMatch[1];
                const currentValue = lastMatch[2];

                // Check if the current value starts with a negative sign
                if (currentValue.startsWith('-')) {
                    // Remove the negative sign and add space before the value
                    const replacement = whitespace + ' ' + newValue;
                    tempLine = tempLine.substring(0, lastMatch.index) + replacement + tempLine.substring(lastMatch.index + fullMatch.length);
                } else {
                    // Use the same replacement logic as date/time - replace the last non-whitespace sequence
                    const replacement = whitespace + currentValue.replace(/\S+(?=\s*$)/, newValue);
                    tempLine = tempLine.substring(0, lastMatch.index) + replacement + tempLine.substring(lastMatch.index + fullMatch.length);
                }
            }
        }
        currentColumnIndex++;
    }

    return tempLine;
}

// Helper function to parse parameters.inc file
function parseParametersFile(content) {
    const parameters = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip comments and empty lines
        if (trimmedLine.startsWith('*') || trimmedLine.startsWith('!') || !trimmedLine) {
            continue;
        }

        // Parse parameter assignments (parameter=value)
        const match = trimmedLine.match(/^(\w+)\s*=\s*(.+)$/);
        if (match) {
            const paramName = match[1].trim();
            let paramValue = match[2].trim();

            // Remove any trailing comments
            paramValue = paramValue.split('!')[0].split('*')[0].trim();

            parameters[paramName] = paramValue;
        }
    }

    return parameters;
}


app.post('/api/manager/reset-password', authenticateToken, requireManager, async (req, res) => {
    try {
        const { engineerEmail, newPassword } = req.body;

        // Validate inputs
        if (!engineerEmail || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Engineer email and new password are required'
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password for the engineer
        const result = await db.query(
            'UPDATE users SET password = $1 WHERE email = $2 AND role = \'engineer\' RETURNING email',
            [hashedPassword, engineerEmail]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Engineer not found'
            });
        }

        res.json({
            success: true,
            message: 'Password updated successfully',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password'
        });
    }
});

// --- Engineer: my projects (scoped to logged-in user) ---
app.get('/api/my-projects', authenticateToken, async (req, res) => {
  try {
    const q = `
      SELECT id, project_name, protocol, status, created_at, completed_at, user_email
      FROM projects
      WHERE user_email = $1
      ORDER BY created_at DESC
    `;
    const r = await db.query(q, [req.user.email]);
    return res.json({ success: true, projects: r.rows || [] });
  } catch (err) {
    console.error('GET /api/my-projects error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- Engineer: simple recent activity derived from projects ---
app.get('/api/my-activity', authenticateToken, async (req, res) => {
  try {
    const q = `
      SELECT project_name, protocol, status, created_at, completed_at
      FROM projects
      WHERE user_email = $1
      ORDER BY GREATEST(COALESCE(completed_at,'epoch'), created_at) DESC
      LIMIT 50
    `;
    const r = await db.query(q, [req.user.email]);

    // Turn project rows into "activities"
    const activities = [];
    for (const row of r.rows) {
      activities.push({
        type: 'Project created',
        message: `${row.project_name} (${row.protocol})`,
        created_at: row.created_at
      });
      if (row.completed_at) {
        activities.push({
          type: 'Project completed',
          message: `${row.project_name} (${row.protocol})`,
          created_at: row.completed_at
        });
      }
      if (row.status && !/^(completed|not started)$/i.test(row.status)) {
        activities.push({
          type: `Status: ${row.status}`,
          message: `${row.project_name} (${row.protocol})`,
          created_at: row.created_at
        });
      }
    }

    // Sort newest first and trim
    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json({ success: true, activities: activities.slice(0, 30) });
  } catch (err) {
    console.error('GET /api/my-activity error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// === In-Progress Drafts (resume state) ===

// Upsert draft snapshot (inputs + computed tables) for a project+protocol
app.post('/api/projects/:projectId/drafts/:protocol', async (req, res) => {
  const { projectId, protocol } = req.params;
  const { inputs_json, matrix_json } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO protocol_drafts (project_id, protocol, inputs_json, matrix_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, protocol)
       DO UPDATE SET inputs_json = EXCLUDED.inputs_json,
                     matrix_json = EXCLUDED.matrix_json,
                     updated_at = NOW()
       RETURNING *;`,
      [projectId, protocol, inputs_json, matrix_json]
    );
    res.json({ ok: true, draft: result.rows[0] });
  } catch (e) {
    console.error('save draft error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Read latest draft snapshot for a project+protocol
app.get('/api/projects/:projectId/drafts/:protocol', async (req, res) => {
  const { projectId, protocol } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM protocol_drafts
       WHERE project_id = $1 AND protocol = $2;`,
      [projectId, protocol]
    );
    res.json({ ok: true, draft: result.rows[0] || null });
  } catch (e) {
    console.error('get draft error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// -----------------------------
// Run-time persistence endpoints
// -----------------------------

/**
 * POST /api/record-run-time
 * Body: { projectName, protocol, runNumber, startTime?, endTime?, durationSeconds? }
 * Adds columns to protocol table if missing and updates row for number_of_runs.
 */
app.post('/api/record-run-time', async (req, res) => {
  try {
    const { projectName, protocol, runNumber } = req.body;
    const startTime = req.body.startTime || null;
    const endTime = req.body.endTime || null;
    const durationSeconds = req.body.durationSeconds != null ? Number(req.body.durationSeconds) : null;

    if (!protocol || !runNumber) return res.status(400).json({ success:false, message: 'protocol and runNumber required' });

    const tableMap = {
      'mf62': 'mf_data',
      'mf52': 'mf52_data',
      'ftire': 'ftire_data',
      'cdtire': 'cdtire_data',
      'custom': 'custom_data'
    };
    const tableName = tableMap[String(protocol).toLowerCase()];
    if (!tableName) return res.status(400).json({ success:false, message: 'Unknown protocol' });

    // Ensure columns exist
    const alterQueries = [
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_start_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_end_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_duration_seconds INTEGER`
    ];
    for (const q of alterQueries) {
      try { await db.query(q); } catch (e) { /* ignore */ }
    }

    // Build update parts
    const parts = [];
    const params = [];
    let idx = 1;
    if (startTime) { parts.push(`run_start_time = $${idx++}`); params.push(startTime); }
    if (endTime)   { parts.push(`run_end_time = $${idx++}`); params.push(endTime); }
    if (durationSeconds !== null) { parts.push(`run_duration_seconds = $${idx++}`); params.push(durationSeconds); }

    if (parts.length === 0) {
      return res.json({ success: true, message: 'Nothing to update' });
    }

    // final param for number_of_runs
    params.push(runNumber);
    const updateQuery = `UPDATE ${tableName} SET ${parts.join(', ')} WHERE number_of_runs = $${idx} RETURNING *`;
    const { rows } = await db.query(updateQuery, params);

    // if no row updated, try to insert a minimal row (best-effort; won't include other columns)
    if (rows.length === 0) {
      const insertCols = ['number_of_runs'];
      const insertVals = [];
      const insertParams = [];
      let pidx = 1;
      insertVals.push(`$${pidx++}`);
      insertParams.push(runNumber);
      if (startTime) { insertCols.push('run_start_time'); insertVals.push(`$${pidx++}`); insertParams.push(startTime); }
      if (endTime)   { insertCols.push('run_end_time'); insertVals.push(`$${pidx++}`); insertParams.push(endTime); }
      if (durationSeconds !== null) { insertCols.push('run_duration_seconds'); insertVals.push(`$${pidx++}`); insertParams.push(durationSeconds); }
      const insertQ = `INSERT INTO ${tableName} (${insertCols.join(',')}) VALUES (${insertVals.join(',')}) RETURNING *`;
      try {
        const ir = await db.query(insertQ, insertParams);
        return res.json({ success: true, inserted: ir.rows[0] || null });
      } catch (e) {
        // could fail due to NOT NULL constraints; log and still return ok
        console.error('insert run-time fallback failed', e && e.message);
        return res.json({ success: true, message: 'No matching row updated; attempted insert failed' });
      }
    }

    res.json({ success: true, updated: rows[0] });
  } catch (err) {
    console.error('record-run-time error', err && err.stack || err);
    res.status(500).json({ success: false, message: 'Server error recording run time' });
  }
});

/**
 * GET /api/get-run-times
 * Query: projectId (optional) & protocol
 * Returns list of { number_of_runs, run_start_time, run_end_time, run_duration_seconds }
 */
app.get('/api/get-run-times', async (req, res) => {
  try {
    const protocol = req.query.protocol;
    if (!protocol) return res.status(400).json({ success: false, message: 'protocol required' });

    const tableMap = {
      'mf62': 'mf_data',
      'mf52': 'mf52_data',
      'ftire': 'ftire_data',
      'cdtire': 'cdtire_data',
      'custom': 'custom_data'
    };
    const tableName = tableMap[String(protocol).toLowerCase()];
    if (!tableName) return res.status(400).json({ success: false, message: 'Unknown protocol' });

    // Ensure the runtime columns exist (safe even if they already do)
    const alterQueries = [
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_start_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_end_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_duration_seconds INTEGER`
    ];
    for (const q of alterQueries) {
      try { await db.query(q); } catch (e) { /* ignore alter errors */ }
    }

    // Now safely select
    const q = `SELECT number_of_runs, run_start_time, run_end_time, run_duration_seconds FROM ${tableName} ORDER BY number_of_runs`;
    const { rows } = await db.query(q);
    res.json(rows);
  } catch (err) {
    console.error('get-run-times error', err && err.stack || err);

    // Fallback: try to return number_of_runs only (map to uniform shape)
    try {
      const protocol = req.query.protocol || '';
      const tableMap = {
        'mf62': 'mf_data',
        'mf52': 'mf52_data',
        'ftire': 'ftire_data',
        'cdtire': 'cdtire_data',
        'custom': 'custom_data'
      };
      const tableName = tableMap[String(protocol).toLowerCase()];
      if (tableName) {
        const { rows } = await db.query(`SELECT number_of_runs FROM ${tableName} ORDER BY number_of_runs`);
        const mapped = rows.map(r => ({
          number_of_runs: r.number_of_runs,
          run_start_time: null,
          run_end_time: null,
          run_duration_seconds: 0
        }));
        return res.json(mapped);
      }
    } catch (e) {
      console.error('get-run-times fallback failed', e && e.stack || e);
    }

    res.status(500).json({ success: false, message: 'Server error fetching run times' });
  }
});

// Generic JSON 404 for API routes — must be placed AFTER all /api/* endpoints
app.all('/api/*', (_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Catch-all for SPA (keep last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

