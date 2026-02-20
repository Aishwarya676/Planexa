require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");
const db = require("./src/config/db");
const webpush = require("web-push");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const nodemailer = require("nodemailer");

const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
// Define allowed origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://planexa.co.in",
  "https://www.planexa.co.in"
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  }
});

/* ---------------- CORS ---------------- */
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log(`[Request] ${req.method} ${req.url} - Content-Length: ${req.headers['content-length']}`);
  }
  next();
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());

/* ---------------- Session Store ---------------- */
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: true,
  schema: {
    tableName: "sessions",
    columnNames: {
      session_id: "session_id",
      expires: "expires",
      data: "data",
    },
  },
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  })
);

/* ---------------- Cache-Control + Route Guards ---------------- */
const strictLoginPages = new Set(["/login.html", "/login-fixed.html", "/get-started.html", "/landing.html", "/index.html"]);
const publicPages = new Set(["/index.html", "/landing.html", "/get-started.html"]);
const userPages = new Set(["/app.html", "/dashboard", "/account.html", "/customization.html", "/customer-service/customer.html"]);
const adminPages = new Set(["/admin/admin-dashboard.html"]);

/* ---------------- Site Access Middleware ---------------- */
const siteAccessMiddleware = (req, res, next) => {
  const reqPath = req.path;

  // Exclude static assets, the access page, and the check API
  const isPublicAsset = reqPath.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf)$/i);
  const isAccessPage = reqPath === '/site-access.html';
  const isCheckApi = reqPath === '/api/check-site-password';

  if (isPublicAsset || isAccessPage || isCheckApi) {
    return next();
  }

  // Check for site access in session
  if (req.session && req.session.hasSiteAccess) {
    return next();
  }

  // Redirect to password wall
  const query = reqPath !== '/' ? `?next=${encodeURIComponent(reqPath)}` : '';
  res.redirect(`/site-access.html${query}`);
};

app.use(siteAccessMiddleware);

app.use((req, res, next) => {
  const reqPath = req.path;

  // ----------------- GLOBAL CACHE CONTROL -----------------
  // Prevent caching for ALL HTML pages to ensure back button security
  if (reqPath.endsWith('.html') || reqPath === '/' || !path.extname(reqPath)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }

  // Session check helper
  const isAuthenticated = req.session && (req.session.userId || req.session.coachId);
  const userType = req.session?.userType || (req.session?.coachId ? 'coach' : 'user');

  // ----------------- ONBOARDING EXCLUSION -----------------
  if (reqPath.toLowerCase().includes("onboarding")) {
    return next();
  }

  // ----------------- STRICT LOGIN PAGE REDIRECTS -----------------
  // Prevent logged-in users from accessing login pages (but allow landing/home)
  // strictLoginPages should ONLY contain actual login/signup pages now
  const strictLoginPages = new Set(["/login.html", "/login-fixed.html", "/get-started.html", "/coach-login.html"]);

  // Is it a strict login page? (removed '/' and landing pages from this check)
  const isStrictLoginPage = strictLoginPages.has(reqPath);

  // REDUNDANT: Client-side auth-helper.js handles these with window.location.replace
  // to prevent back-button traps and history bloating. 
  /*
  if (isStrictLoginPage && isAuthenticated) {
    if (userType === 'admin') return res.redirect("/admin/admin-dashboard.html");
    if (userType === 'coach') {
      const coachStatus = req.session.coachStatus || '';
      if (coachStatus === 'approved' || coachStatus === 'active') {
        return res.redirect("/coach/business-coach-dashboard/index.html");
      }
      // If pending/rejected coach tries to go to login, send to landing
      return res.redirect("/landing.html");
    } else {
      // Regular user trying to access login page -> redirect to landing page
      return res.redirect("/landing.html");
    }
  }
  */

  // ----------------- ROLE-BASED ACCESS CONTROL -----------------

  // ADMIN PAGES
  if (reqPath.startsWith("/admin/")) {
    if (!isAuthenticated) return res.redirect("/login-fixed.html");
    if (userType !== 'admin') return res.redirect("/landing.html");
  }

  // COACH PAGES
  if (reqPath.startsWith("/coach/")) {
    if (reqPath.includes("onboarding.html") || reqPath.includes("onboarding")) {
      // Allow access
    } else {
      if (!isAuthenticated) return res.redirect("/coach-login.html");
      if (userType !== 'coach') return res.redirect("/landing.html");
    }
  }

  // PROTECTED USER PAGES (app.html, account.html, etc)
  if (userPages.has(reqPath) || userPages.has(decodeURIComponent(reqPath))) {
    if (!isAuthenticated) return res.redirect("/login-fixed.html");
    if (userType === 'admin') return res.redirect("/admin/admin-dashboard.html");
    // Coaches can view app.html? Usually coaches have their own dashboard, 
    // but let's be strict for now if that's the requirement.
    if (userType === 'coach') return res.redirect("/coach/business-coach-dashboard/index.html");
  }

  next();
});

/* ---------------- Static Files ---------------- */
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    // Disable caching for sensitive/auth-dependent pages
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  }
}));

const JWT_SECRET = process.env.JWT_SECRET;

/* ---------------- Push Notification Keys ---------------- */
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
  process.env.VAPID_MAILTO || "mailto:admin@planexa.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

/* ---------------- ADMIN EXTENSIONS ---------------- */
const adminRoutes = require("./src/routes/adminRoutes");
const analyticsController = require("./src/controllers/analyticsController");
app.use("/api", adminRoutes);


// Ensure coaches table exists (helper)
let coachesTableEnsured = false;

// FIX: Ensure coach_details schema is flexible (No FK to users, all columns present)
async function fixCoachSchema() {
  try {
    await db.query("ALTER TABLE coach_details DROP FOREIGN KEY fk_coach_details_user");
  } catch (e) { } // Ignore if not exists

  try {
    await db.query("ALTER TABLE coach_details DROP INDEX unique_user");
  } catch (e) { }

  // Ensure all columns
  const cols = [
    "name VARCHAR(255)", "email VARCHAR(255)", "dob DATE", "coach_type VARCHAR(100)",
    "location VARCHAR(255)", "bio TEXT", "years_experience INT", "hours_coached INT",
    "specialties TEXT", "certifications TEXT", "social_links TEXT",
    "profile_photo LONGTEXT", "certificate_files LONGTEXT", "status VARCHAR(50) DEFAULT 'pending'"
  ];
  for (const col of cols) {
    try {
      await db.query(`ALTER TABLE coach_details ADD COLUMN ${col}`);
    } catch (e) { }
  }
}
async function ensureOnboardingColumn() {
  try {
    const [columns] = await db.query("SHOW COLUMNS FROM users LIKE 'onboarding_completed'");
    if (columns.length === 0) {
      await db.query("ALTER TABLE users ADD COLUMN onboarding_completed TINYINT(1) DEFAULT 0");
    }

    const [coachColumns] = await db.query("SHOW COLUMNS FROM coaches LIKE 'onboarding_completed'");
    if (coachColumns.length === 0) {
      await db.query("ALTER TABLE coaches ADD COLUMN onboarding_completed TINYINT(1) DEFAULT 0");
    }
  } catch (e) {
    console.error('Error ensuring onboarding column:', e);
  }
}
ensureOnboardingColumn();
fixCoachSchema();
ensureCoachesTable();
ensureFeedbackTable();
ensureAnnouncementsTable();

async function ensureAnnouncementsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS coach_announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coach_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        start_datetime DATETIME NOT NULL,
        end_datetime DATETIME NOT NULL,
        timezone VARCHAR(100) NOT NULL,
        visibility ENUM('public', 'private') DEFAULT 'private',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log("Coach announcements table ensured");
  } catch (e) {
    console.error("Error ensuring announcements table:", e);
  }
}

async function ensureFeedbackTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS website_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        user_type VARCHAR(50) NULL,
        good_points TEXT,
        bad_points TEXT,
        helpful_ui TEXT,
        not_working TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    console.log("Feedback table ensured");
  } catch (e) {
    console.error("Error ensuring feedback table:", e);
  }
}

async function ensureCoachesTable() {
  if (coachesTableEnsured) return;
  try {
    await db.query(
      `CREATE TABLE IF NOT EXISTS coaches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        hashed_password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (email)
      ) ENGINE=InnoDB`
    );
    coachesTableEnsured = true;
    await ensureCoachRelationshipTables();
  } catch (e) {
    console.error('Failed ensuring coaches table:', e);
  }
}

async function ensureCoachRelationshipTables() {
  try {
    // 1. Coach-Client Relationships (Standardized)
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_coach_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coach_id INT NOT NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_connection (user_id, coach_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // 2. Coach Payments
    await db.query(`
      CREATE TABLE IF NOT EXISTS coach_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coach_id INT NOT NULL,
        client_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status ENUM('paid', 'pending', 'failed', 'refunded') DEFAULT 'pending',
        invoice_id VARCHAR(50),
        transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coach_id) REFERENCES coaches(id),
        FOREIGN KEY (client_id) REFERENCES users(id)
      ) ENGINE=InnoDB
    `);
    console.log("Coach relationship tables ensured");
  } catch (e) {
    console.error("Error ensuring coach relationship tables:", e);
  }
}

/* ---------------- SESSION CHECK ---------------- */
app.get("/api/session", async (req, res) => {
  try {
    // 1. Session-based Check (Priority)
    if (req.session) {
      if (req.session.userId === 'admin') {
        return res.json({
          isAuthenticated: true,
          user: { id: 'admin', username: 'Admin', email: process.env.ADMIN_EMAIL, user_type: 'admin' },
          userType: 'admin',
          isAdmin: true
        });
      }

      if (req.session.userId) {
        // Regular User
        const [rows] = await db.query(
          "SELECT id, username, email, user_type, onboarding_completed FROM users WHERE id = ?",
          [req.session.userId]
        );
        if (rows.length > 0) {
          // Check for active coaching connection
          const [connectionsSlice] = await db.query(
            "SELECT COUNT(*) as count FROM user_coach_connections WHERE user_id = ? AND status = 'active'",
            [req.session.userId]
          );

          return res.json({
            isAuthenticated: true,
            user: rows[0],
            userType: rows[0].user_type,
            onboarding_completed: rows[0].onboarding_completed,
            canMessage: connectionsSlice[0].count > 0
          });
        }
      } else if (req.session.coachId) {
        // Coach
        const [rows] = await db.query(
          "SELECT c.id, c.name, c.email, c.onboarding_completed, cd.status FROM coaches c LEFT JOIN coach_details cd ON c.id = cd.user_id WHERE c.id = ?",
          [req.session.coachId]
        );
        if (rows.length > 0) {
          const coach = rows[0];
          return res.json({
            isAuthenticated: true,
            coachId: coach.id,
            status: coach.status || 'pending_onboarding',
            onboarding_completed: !!coach.onboarding_completed,
            user: { ...coach, username: coach.name, user_type: 'coach' },
            userType: 'coach'
          });
        }
      }
    }

    // 2. JWT-based Check (Fallback/API)
    let token;
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.split(" ")[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;
      const [rows2] = await db.query(
        "SELECT id, username, email, user_type, theme_id, theme_colors, onboarding_completed FROM users WHERE id = ?",
        [userId]
      );
      if (rows2 && rows2.length > 0) {
        let user = rows2[0];
        if (user.theme_colors && typeof user.theme_colors === 'string') {
          try { user.theme_colors = JSON.parse(user.theme_colors); } catch (e) { }
        }
        // Check for active coaching connection
        const [connections2] = await db.query(
          "SELECT COUNT(*) as count FROM user_coach_connections WHERE user_id = ? AND status = 'active'",
          [user.id]
        );

        return res.json({
          isAuthenticated: true,
          user: user,
          userType: user.user_type,
          canMessage: connections2[0].count > 0
        });
      }
    }

    return res.json({ isAuthenticated: false });
  } catch (e) {
    return res.json({ isAuthenticated: false });
  }
});



/* ---------------- FRONTEND ROUTES ---------------- */
app.get("/", (req, res) => {
  const isAuthenticated = req.session && (req.session.userId || req.session.coachId);
  const userType = req.session?.userType || (req.session?.coachId ? 'coach' : 'user');

  if (isAuthenticated) {
    if (userType === 'admin') return res.redirect("/admin/admin-dashboard.html");
    if (userType === 'coach') return res.redirect("/coach/business-coach-dashboard/index.html");
    return res.redirect("/app.html");
  }

  return res.sendFile(path.join(__dirname, "public", "landing.html"));
});
app.get("/dashboard", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "coach", "business-coach-dashboard", "index.html"))
);

/* ---------------- REGISTER (Moved to separate block) ---------------- */
// Replaced by improved implementation supporting coaches table
// See below or search 'app.post("/api/register"'

/* ---------------- LOGIN ---------------- */
// Admin login route
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "All fields required" });

  // Hardcoded admin credentials (in production, use environment variables)
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    req.session.userId = 'admin';
    req.session.userType = 'user'; // Admin acts as a user
    req.session.isAdmin = true;
    return res.json({
      message: 'Admin login successful',
      user: {
        id: 'admin',
        email: process.env.ADMIN_EMAIL,
        isAdmin: true
      }
    });
  }

  return res.status(401).json({ error: "Invalid admin credentials" });
});



// Get user statistics
app.get("/api/admin/stats", async (req, res) => {
  try {
    // Check if user is admin
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Allow if session says admin OR check DB
    let isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const [user] = await db.query("SELECT user_type FROM users WHERE id = ?", [req.session.userId]);
      if (user.length > 0 && user[0].user_type === 'admin') {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get daily active users (users who logged in today successfully)
    const [dailyActive] = await db.query(
      `SELECT COUNT(DISTINCT user_id) as count 
       FROM login_activity 
       WHERE DATE(created_at) = CURDATE() AND success = 1`
    );

    // Get monthly active users (users who logged in this month successfully)
    const [monthlyActive] = await db.query(
      `SELECT COUNT(DISTINCT user_id) as count 
       FROM login_activity 
       WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) 
       AND YEAR(created_at) = YEAR(CURRENT_DATE()) AND success = 1`
    );

    // Get total users (exclude admins)
    const [totalUsers] = await db.query("SELECT COUNT(*) as count FROM users WHERE user_type != 'admin'");

    res.json({
      dailyActive: dailyActive[0]?.count || 0,
      monthlyActive: monthlyActive[0]?.count || 0,
      totalUsers: totalUsers[0]?.count || 0
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({ error: "Error fetching user statistics", details: error.message, stack: error.stack });
  }
});

/* ---------------- Site Password Check API ---------------- */
app.post("/api/check-site-password", (req, res) => {
  const { password } = req.body;
  const sitePassword = process.env.SITE_PASSWORD || "51}Thl51[Nj";

  if (password === sitePassword) {
    if (req.session) {
      req.session.hasSiteAccess = true;
      return res.json({ success: true });
    } else {
      return res.status(500).json({ error: "Session not initialized" });
    }
  }

  res.status(401).json({ success: false, error: "Incorrect password" });
});

/*
// Feedback API
app.post("/api/feedback", async (req, res) => {
  try {
    const { goodPoints, badPoints, helpfulUI, notWorking } = req.body;
    const userId = req.session?.userId || req.session?.coachId || null;
    const userType = req.session?.userType || (req.session?.coachId ? "coach" : "user");

    await db.query(
      "INSERT INTO website_feedback (user_id, user_type, good_points, bad_points, helpful_ui, not_working) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, userType, goodPoints, badPoints, helpfulUI, notWorking]
    );

    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (e) {
    console.error("Error submitting feedback:", e);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});
*/

// Get all users (admin only)
app.get("/api/admin/users", async (req, res) => {
  try {
    // Check if user is admin
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    let isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const [user] = await db.query("SELECT user_type FROM users WHERE id = ?", [req.session.userId]);
      if (user.length > 0 && user[0].user_type === 'admin') {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const [users] = await db.query(`
      SELECT 
        id, 
        username, 
        email, 
        user_type as role, 
        status,
        created_at as joinDate,
        (SELECT MAX(created_at) FROM login_activity WHERE user_id = users.id AND success = 1) as lastLogin
      FROM users
      WHERE user_type != 'admin'
      ORDER BY created_at DESC
    `);

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Error fetching users" });
  }
});

// Update user status
app.post("/api/admin/users/:id/status", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });

    // Admin check
    let isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const [u] = await db.query("SELECT user_type FROM users WHERE id = ?", [req.session.userId]);
      if (u.length > 0 && u[0].user_type === 'admin') isAdmin = true;
    }
    if (!isAdmin) return res.status(403).json({ error: "Unauthorized" });

    const userId = req.params.id;
    const { status } = req.body;

    if (!['active', 'inactive', 'banned'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await db.query("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
    res.json({ success: true, message: `User marked as ${status}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update status" });
  }
});

/*
// GET Website Feedback (Admin Only)
app.get("/api/admin/feedback", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });

    let isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const [u] = await db.query("SELECT user_type FROM users WHERE id = ?", [req.session.userId]);
      if (u.length > 0 && u[0].user_type === 'admin') isAdmin = true;
    }
    if (!isAdmin) return res.status(403).json({ error: "Unauthorized" });

    const [rows] = await db.query(`
      SELECT f.*, u.username, u.email as user_email 
      FROM website_feedback f 
      LEFT JOIN users u ON f.user_id = u.id AND f.user_type = 'user'
      ORDER BY f.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error("Error fetching feedback:", e);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});
*/

// Delete user
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });

    // Admin check
    let isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const [u] = await db.query("SELECT user_type FROM users WHERE id = ?", [req.session.userId]);
      if (u.length > 0 && u[0].user_type === 'admin') isAdmin = true;
    }
    if (!isAdmin) return res.status(403).json({ error: "Unauthorized" });

    const userId = req.params.id;

    // Delete related data first if no cascade (safe bet)
    await db.query("DELETE FROM login_activity WHERE user_id = ?", [userId]);
    // clean up other tables if needed, but for now just user
    await db.query("DELETE FROM users WHERE id = ?", [userId]);

    res.json({ success: true, message: "User deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password, rememberMe } = req.body;
  if (!email || !password) return res.status(400).json({ error: "All fields required" });

  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "";

    // Special Bypass for Admin Credentials (from .env)
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      req.session.userId = 'admin';
      req.session.userType = 'admin';
      req.session.isAdmin = true;
      if (rememberMe) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

      await db.query(
        "INSERT INTO admin_audit (admin_email, login_time) VALUES (?, NOW())",
        [email]
      );

      return res.json({
        success: true,
        message: "Admin login successful",
        user: { id: 'admin', username: 'Admin', email: email, user_type: 'admin' },
        token: jwt.sign({ userId: 'admin', isAdmin: true }, JWT_SECRET, { expiresIn: "7d" })
      });
    }

    const [rows] = await db.query("SELECT id, username, email, user_type, password_hash, theme_id, theme_colors, status FROM users WHERE email = ?", [email]);

    if (rows.length === 0) {
      await db.query(
        "INSERT INTO login_activity (user_id, email, ip_address, success) VALUES (?, ?, ?, ?)",
        [null, email, ip, 0]
      );
      return res.status(401).json({ error: "User not found" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      await db.query(
        "INSERT INTO login_activity (user_id, email, ip_address, success) VALUES (?, ?, ?, ?)",
        [user.id, email, ip, 0]
      );
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Check if user is banned or inactive
    if (user.status === 'banned') {
      return res.status(403).json({ error: "Your account has been permanently banned. Please contact support." });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ error: "Your account is currently inactive. Please contact support." });
    }

    // Store session
    req.session.userId = user.id;
    req.session.userType = 'user';
    req.session.isAdmin = (user.user_type === 'admin');

    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    await db.query(
      "INSERT INTO login_activity (user_id, email, ip_address, success) VALUES (?, ?, ?, ?)",
      [user.id, email, ip, 1]
    );

    // Admin Audit
    if (email === process.env.ADMIN_EMAIL) {
      await db.query(
        "INSERT INTO admin_audit (admin_email, login_time) VALUES (?, NOW())",
        [email]
      );
    }

    // Parse theme colors
    let themeColors = user.theme_colors;
    if (themeColors && typeof themeColors === 'string') {
      try { themeColors = JSON.parse(themeColors); } catch (e) { }
    }

    res.json({
      success: true,
      message: "Login successful",
      user: { id: user.id, username: user.username, email: user.email, user_type: user.user_type },
      token,
      theme_id: user.theme_id,
      theme_colors: themeColors
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* ---------------- COACH LOGIN ---------------- */
/* ---------------- COACH LOGIN ---------------- */
app.post("/api/coach/login", async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    // 1. Check COACH Credentials in COACHES table
    const [coaches] = await db.query("SELECT id, name, email, hashed_password FROM coaches WHERE email = ?", [email]);

    if (coaches.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const coach = coaches[0];
    const match = await bcrypt.compare(password, coach.hashed_password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 2. Check Coach Profile Status (in coach_details)
    // Try by user_id first, then by email to handle missing links
    let [coachDetails] = await db.query("SELECT id, status FROM coach_details WHERE user_id = ?", [coach.id]);

    if (coachDetails.length === 0) {
      [coachDetails] = await db.query("SELECT id, status FROM coach_details WHERE email = ?", [coach.email]);
      // If found by email but user_id is null, link it now
      if (coachDetails.length > 0) {
        await db.query("UPDATE coach_details SET user_id = ? WHERE id = ?", [coach.id, coachDetails[0].id]);
      }
    }

    let status = 'pending_onboarding';
    if (coachDetails.length > 0) {
      status = coachDetails[0].status || 'pending_onboarding';
    }

    if (status === 'deleted') {
      return res.status(403).json({ error: "This account has been deleted." });
    }

    if (status === 'rejected') {
      return res.status(403).json({ error: "Your application has been rejected. Please contact support." });
    }

    if (status === 'pending') {
      return res.status(403).json({
        error: "Your account is awaiting admin approval. Please wait for the confirmation."
      });
    }

    if (status === 'blocked') {
      return res.status(403).json({
        error: "Your account has been temporarily blocked. Please contact support."
      });
    }

    if (status === 'banned') {
      return res.status(403).json({
        error: "Your account has been permanently banned due to policy violations."
      });
    }

    // Allow status: approved, deactivated, and pending_onboarding
    // Note: deactivated coaches can still log in to manage their account or reactivate.

    // 3. Login Success
    req.session.userId = null;
    req.session.coachId = coach.id;
    req.session.userType = 'coach';
    req.session.coachStatus = status;

    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    // Optional: Update login activity (adjust schema if needed or reuse logic with user_id=null/coach_id col)
    // skipping for now or log with user_id=null

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session save failed" });
      }
      return res.json({
        success: true,
        user: { id: coach.id, email: coach.email, name: coach.name, user_type: 'coach', status }
      });
    });

  } catch (e) {
    console.error('Coach login error:', e);
    return res.status(500).json({ error: "Login failed" });
  }
});

/* ---------------- COACH ANNOUNCEMENTS ---------------- */
app.post("/api/coach/announcements", async (req, res) => {
  try {
    if (!req.session.coachId) {
      return res.status(401).json({ error: "Unauthorized. Coach only." });
    }

    const { title, description, start_datetime, end_datetime, timezone, visibility } = req.body;
    if (!title || !start_datetime || !end_datetime || !timezone) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    const coachId = req.session.coachId;

    // 1. Save to coach_announcements
    const [result] = await db.query(
      "INSERT INTO coach_announcements (coach_id, title, description, start_datetime, end_datetime, timezone, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [coachId, title, description, start_datetime, end_datetime, timezone, visibility || 'private']
    );

    const announcementId = result.insertId;

    // 2. Notify Users
    let targetUserIds = [];
    if (visibility === 'public') {
      const [allUsers] = await db.query("SELECT id FROM users WHERE user_type != 'admin'");
      targetUserIds = allUsers.map(u => u.id);
    } else {
      const [students] = await db.query("SELECT user_id FROM user_coach_connections WHERE coach_id = ? AND status = 'active'", [coachId]);
      targetUserIds = students.map(u => u.user_id);
    }

    if (targetUserIds.length > 0) {
      const notificationTitle = `New Event: ${title}`;
      const notificationBody = `Coach has announced a new event starting on ${start_datetime} (${timezone}).`;

      const values = targetUserIds.map(uid => [uid, notificationTitle, notificationBody]);
      await db.query("INSERT INTO notifications (user_id, title, body) VALUES ?", [values]);

      // Real-time socket notification can be added here if needed
      // io.emit('announcement', { title, body: notificationBody });
    }

    res.json({ success: true, message: "Announcement posted successfully", announcementId });
  } catch (err) {
    console.error("Error posting announcement:", err);
    res.status(500).json({ error: "Failed to post announcement" });
  }
});

app.get("/api/coach/announcements", async (req, res) => {
  try {
    if (!req.session.coachId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [rows] = await db.query(
      "SELECT * FROM coach_announcements WHERE coach_id = ? ORDER BY created_at DESC",
      [req.session.coachId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching announcements:", err);
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

/* ---------------- CURRENT COACH ---------------- */
/* ---------------- CURRENT COACH ---------------- */
app.get("/api/coach/me", async (req, res) => {
  try {
    if (!req.session || !req.session.coachId) return res.status(401).json({ error: "Not authenticated" });

    // Check coaches table
    const [rows] = await db.query("SELECT id, email, name FROM coaches WHERE id = ?", [req.session.coachId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Coach not found" });

    // Optional: Return extra profile info
    const [details] = await db.query("SELECT * FROM coach_details WHERE user_id = ?", [req.session.coachId]);
    const profile = details[0] || { status: 'pending_onboarding' };

    return res.json({
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].name,
      ...profile
    });
  } catch (e) {
    console.error("Error fetching coach profile:", e);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/* ---------------- COACH ANALYTICS ---------------- */
app.get("/api/coach/analytics/clients", async (req, res) => {
  try {
    if (!req.session || !req.session.coachId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const coachId = req.session.coachId;

    // 1. Get all active connected clients
    const [clients] = await db.query(
      `SELECT u.id, u.username, u.email 
       FROM users u
       JOIN user_coach_connections ucc ON u.id = ucc.user_id
       WHERE ucc.coach_id = ? AND ucc.status = 'active'`,
      [coachId]
    );

    if (clients.length === 0) {
      return res.json([]);
    }

    // 2. For each client, fetch analytics
    const analyticsData = await Promise.all(clients.map(async (client) => {
      // Fetch Todos Stats
      const [todos] = await db.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as completed
         FROM todos 
         WHERE user_id = ?`,
        [client.id]
      );

      // Fetch Goals Stats & Details
      const [goalsStats] = await db.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as completed
         FROM goals 
         WHERE user_id = ?`,
        [client.id]
      );

      const [activeGoals] = await db.query(
        `SELECT id, text, category, total, spent, done 
         FROM goals 
         WHERE user_id = ? AND done = 0`,
        [client.id]
      );

      // Fetch Weekly Task Completion (Last 7 Days)
      const [weeklyStats] = await db.query(
        `SELECT DATE(completed_at) as date, COUNT(*) as count 
         FROM todos 
         WHERE user_id = ? AND done = 1 AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(completed_at)
         ORDER BY date ASC`,
        [client.id]
      );

      return {
        userId: client.id,
        name: client.username || client.email.split('@')[0], // Fallback name
        email: client.email,
        todos: {
          total: todos[0].total || 0,
          completed: Math.floor(todos[0].completed || 0), // Ensure number
          weekly: weeklyStats // Return the raw date/count data
        },
        goals: {
          total: goalsStats[0].total || 0,
          completed: Math.floor(goalsStats[0].completed || 0), // Ensure number
          active: activeGoals
        }
      };
    }));

    res.json(analyticsData);

  } catch (e) {
    console.error("Error fetching client analytics:", e);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

/* ---------------- JWT Middleware ---------------- */
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

/* ---------------- CURRENT USER ---------------- */
app.get("/api/me", async (req, res) => {
  try {
    let userId = null;

    // 1. Try JWT first (middleware legacy)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (e) {
        // Invalid token
      }
    }

    // 2. Try Session fallback
    if (!userId && req.session && req.session.userId) {
      userId = req.session.userId;
    }

    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const [rows] = await db.query("SELECT id, username, email, user_type FROM users WHERE id = ?", [userId]);
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("/api/me error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------- DELETE ACCOUNT ---------------- */
app.delete("/api/me", async (req, res) => {
  try {
    let userId = req.session?.userId;
    // Allow JWT auth too
    if (!userId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (e) { }
    }

    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    // Manually delete related data where CASCADE might be missing or safe to be explicit
    await db.query("DELETE FROM login_activity WHERE user_id = ?", [userId]);
    await db.query("DELETE FROM push_subscriptions WHERE user_id = ?", [userId]);
    await db.query("DELETE FROM notifications WHERE user_id = ?", [userId]);

    // Deleting from users table should CASCADE to todos, reminders, goals, etc. based on schema
    await db.query("DELETE FROM users WHERE id = ?", [userId]);

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Account deleted permanently" });
    });
  } catch (e) {
    console.error("Delete account error:", e);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

/* ---------------- SAVE COACH DETAILS ---------------- */
/* ---------------- SAVE COACH DETAILS ---------------- */
app.post("/api/coach-details", async (req, res) => {
  console.log(`[POST /api/coach-details] Received request at ${new Date().toISOString()}`);
  try {
    let userId = req.session?.userId || null;
    let coachId = req.session?.coachId || null; // Use coachId if available

    // If neither, try finding user/coach by email? No that's unsafe.
    // Assuming user/coach is logged in.

    // Priority: if coachId is set, use that to update status.
    // If only userId is set (user becoming coach?), we might need logic.
    // Given the current flow seems to be "Coach Login -> Onboarding", we prioritize coachId.

    const {
      name, email, dob, coachType,
      location, bio, yearsExperience, hoursCoached,
      specialties, certifications, socialLinks,
      profilePhoto, certificateFiles: certFilesRaw,
      hourlyRate
    } = req.body || {};

    const targetId = coachId || userId || null;

    let existingId = null;
    if (targetId) {
      const [rows] = await db.query("SELECT id FROM coach_details WHERE user_id = ?", [targetId]);
      if (rows.length > 0) existingId = rows[0].id;
    }

    if (!existingId && email) {
      const [rows] = await db.query("SELECT id FROM coach_details WHERE email = ?", [email]);
      if (rows.length > 0) existingId = rows[0].id;
    }

    // Dynamic update logic
    const updateFields = [];
    const params = [];

    const fieldMap = {
      name: 'name', email: 'email', dob: 'dob', coachType: 'coach_type',
      location: 'location', bio: 'bio', yearsExperience: 'years_experience',
      hoursCoached: 'hours_coached', hourlyRate: 'hourly_rate', profilePhoto: 'profile_photo'
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (req.body[key] !== undefined) {
        updateFields.push(`${col} = ?`);
        params.push(req.body[key]);
      }
    }

    if (specialties !== undefined) {
      updateFields.push(`specialties = ?`);
      params.push(JSON.stringify(specialties || []));
    }
    if (certifications !== undefined) {
      updateFields.push(`certifications = ?`);
      params.push(JSON.stringify(certifications || []));
    }
    if (socialLinks !== undefined) {
      updateFields.push(`social_links = ?`);
      params.push(JSON.stringify(socialLinks || {}));
    }
    if (certFilesRaw !== undefined) {
      updateFields.push(`certificate_files = ?`);
      params.push(JSON.stringify(certFilesRaw || []));
    }

    // Always reset status to pending on edit? 
    // Usually yes for verification, but if it's just a pricing change...
    // Let's keep it as is: updates reset to pending.
    if (updateFields.length > 0) {
      updateFields.push("status = ?");
      params.push('pending');
      updateFields.push("updated_at = NOW()");
    }

    if (existingId) {
      // Update
      const q = `UPDATE coach_details SET ${updateFields.join(', ')} WHERE id = ?`;
      params.push(existingId);
      await db.query(q, params);

      // If they were pending_onboarding, they are now pending. 
      // User says: "sends a onboarding request... user can log in... on admin pressing verified"
      // So we should LOG THEM OUT after submission to await approval.
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true, message: "Onboarding submitted. Please await admin approval." });
      });
      return;
    } else {
      // Create
      // Check if they have a userId in session
      const sessCoachId = req.session?.coachId || null;

      const cols = ['name', 'email', 'dob', 'coach_type', 'location', 'bio', 'years_experience', 'hours_coached', 'hourly_rate', 'profile_photo', 'status', 'user_id', 'specialties', 'certifications', 'social_links', 'certificate_files'];
      const q = `INSERT INTO coach_details (${cols.join(', ')}) 
                 VALUES (${cols.map(() => '?').join(', ')})`;

      const insertParams = [
        name, email, dob, coachType, location, bio, yearsExperience, hoursCoached, hourlyRate, profilePhoto,
        'pending', sessCoachId, JSON.stringify(specialties || []), JSON.stringify(certifications || []),
        JSON.stringify(socialLinks || {}), JSON.stringify(certFilesRaw || [])
      ];

      await db.query(q, insertParams);

      // Logout after first submission
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true, message: "Application submitted. Please wait for admin approval." });
      });
      return;
    }
  } catch (e) {
    console.error(`[POST /api/coach-details] Error:`, e);
    return res.status(500).json({ error: "Failed to save coach details: " + e.message });
  }
});

/* ---------------- ADMIN: COACH VERIFICATION ---------------- */
app.get("/api/admin/verifications/coaches", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });

    let isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const [u] = await db.query("SELECT user_type FROM users WHERE id = ?", [req.session.userId]);
      if (u.length > 0 && u[0].user_type === 'admin') isAdmin = true;
    }
    if (!isAdmin) return res.status(403).json({ error: "Unauthorized" });

    const [coaches] = await db.query(`
            SELECT 
              c.id as id,
              cd.id as details_id,
              cd.user_id,
              cd.name,
              cd.email,
              cd.dob,
              cd.coach_type,
              cd.location,
              cd.bio,
              cd.years_experience,
              cd.hours_coached,
              cd.specialties,
              cd.certifications,
              cd.social_links,
              cd.status,
              cd.created_at,
              cd.updated_at,
              cd.hourly_rate
            FROM coach_details cd
            LEFT JOIN coaches c ON (c.id = cd.user_id OR c.email = cd.email)
            WHERE cd.status = 'pending'
            ORDER BY cd.created_at DESC
        `);
    res.json(coaches);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch pending coaches" });
  }
});


/* ---------------- PUBLIC: GET APPROVED COACHES ---------------- */
app.get("/api/public/coaches", async (req, res) => {
  try {
    const [coaches] = await db.query(`
      SELECT user_id as id, name, coach_type, bio, years_experience, 
             profile_photo, specialties, status, hourly_rate
      FROM coach_details 
      WHERE status = 'approved' AND user_id IS NOT NULL
      ORDER BY created_at DESC
    `);
    res.json(coaches);
  } catch (e) {
    console.error("Public coaches fetch error:", e);
    res.status(500).json({ error: "Failed to fetch coaches" });
  }
});

app.get("/api/public/coaches/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [coaches] = await db.query(`
      SELECT user_id as id, name, email, dob, coach_type, location, bio, 
             years_experience, hours_coached, specialties, certifications, 
             social_links, profile_photo, certificate_files, status, hourly_rate
      FROM coach_details 
      WHERE user_id = ? AND status = 'approved'
    `, [id]);

    if (coaches.length === 0) {
      return res.status(404).json({ error: "Coach not found" });
    }
    res.json(coaches[0]);
  } catch (e) {
    console.error("Public coach detail fetch error:", e);
    res.status(500).json({ error: "Failed to fetch coach details" });
  }
});
/* ---------------- TIME SYNC ENDPOINT ---------------- */
// Returns current server UTC time for frontend synchronization
app.get('/api/system/time', (req, res) => {
  res.json({ utcTime: new Date().toISOString() });
});

/* ---------------- PUSH NOTIFICATION ENDPOINTS ---------------- */

// Subscribe to push notifications (supports both JWT and session auth)
app.post("/api/push/subscribe", async (req, res) => {
  try {
    // Try to get user ID from session first, then from JWT
    let userId = req.session?.userId;

    if (!userId && req.headers.authorization) {
      // Try JWT if session doesn't have userId
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (e) {
        // JWT invalid, ignore
      }
    }

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const subscription = JSON.stringify(req.body);

    // Check if subscription already exists
    const [existing] = await db.query(
      "SELECT id FROM push_subscriptions WHERE user_id = ?",
      [userId]
    );

    if (existing.length === 0) {
      // Insert new subscription
      await db.query(
        "INSERT INTO push_subscriptions (user_id, subscription_json) VALUES (?, ?)",
        [userId, subscription]
      );
    } else {
      // Update existing subscription
      await db.query(
        "UPDATE push_subscriptions SET subscription_json = ? WHERE user_id = ?",
        [subscription, userId]
      );
    }

    console.log(`✓ Push subscription registered for user ${userId}`);
    res.json({ success: true, message: "Subscribed to push notifications" });
  } catch (e) {
    console.error("Push subscribe error:", e);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// Test Push Notification Endpoint
app.post("/api/push/test", async (req, res) => {
  try {
    let userId = req.session?.userId;
    if (!userId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (e) { }
    }

    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const [subscriptions] = await db.query(
      "SELECT subscription_json FROM push_subscriptions WHERE user_id = ?",
      [userId]
    );

    if (subscriptions.length === 0) {
      return res.status(404).json({ error: "No subscription found" });
    }

    const subscription = JSON.parse(subscriptions[0].subscription_json);
    const payload = JSON.stringify({
      title: "Test Notification",
      body: "If you see this, push notifications are working!",
      url: "/app.html"
    });

    await webpush.sendNotification(subscription, payload);
    res.json({ success: true, message: "Notification sent" });
  } catch (error) {
    console.error("Test notification error:", error);
    res.status(500).json({ error: "Failed to send test notification", details: error.message });
  }
});

// Unsubscribe from push notifications
app.post("/api/push/unsubscribe", async (req, res) => {
  try {
    let userId = req.session?.userId;
    if (!userId && req.user) userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    await db.query("DELETE FROM push_subscriptions WHERE user_id = ?", [userId]);
    res.json({ success: true, message: "Unsubscribed from push notifications" });
  } catch (e) {
    console.error("Push unsubscribe error:", e);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

// Get user's notifications
app.get("/api/notifications", async (req, res) => {
  try {
    let userId = req.session?.userId;
    if (!userId && req.user) userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [notifications] = await db.query(
      `SELECT id, title, body, reminder_id, is_read, created_at 
       FROM notifications 
       WHERE user_id = ? AND is_deleted = 0
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );
    res.json(notifications);
  } catch (e) {
    console.error("Get notifications error:", e);
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

// Mark notification as read
app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    let userId = req.session?.userId;
    if (!userId && req.user) userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const notificationId = req.params.id;

    await db.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [notificationId, userId]
    );

    res.json({ success: true });
  } catch (e) {
    console.error("Mark notification read error:", e);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// Delete notification
app.delete("/api/notifications/:id", async (req, res) => {
  try {
    let userId = req.session?.userId;
    if (!userId && req.user) userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const notificationId = req.params.id;

    await db.query(
      "UPDATE notifications SET is_deleted = 1 WHERE id = ? AND user_id = ?",
      [notificationId, userId]
    );

    res.json({ success: true });
  } catch (e) {
    console.error("Delete notification error:", e);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

/* ---------------- LOGOUT ---------------- */
/* ---------------- LOGOUT ---------------- */
app.post("/api/logout", async (req, res) => {
  const userId = req.session.userId;
  if (userId) {
    try {
      const [rows] = await db.query("SELECT email, user_type FROM users WHERE id = ?", [userId]);
      if (rows.length > 0) {
        const { email, user_type } = rows[0];
        // Admin Audit Logging for Logout - ONLY for the configured admin email
        if (email === process.env.ADMIN_EMAIL) {
          // Update the latest login record that has no logout time
          await db.query(
            `UPDATE admin_audit 
             SET logout_time = NOW() 
             WHERE admin_email = ? AND logout_time IS NULL 
             ORDER BY login_time DESC LIMIT 1`,
            [email]
          );
        }
      }
    } catch (err) {
      console.error("Error logging logout activity:", err);
    }
  }

  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

/* ---------------- ADMIN: GET USER LOGIN ACTIVITY ---------------- */
app.get("/api/admin/user-activity", async (req, res) => {
  try {
    // Check if admin is logged in
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Verify admin user
    const [adminCheck] = await db.query("SELECT email FROM users WHERE id = ?", [userId]);
    if (adminCheck.length === 0 || adminCheck[0].email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: "Unauthorized - Admin access only" });
    }

    // Fetch user login activity with username
    const [activity] = await db.query(`
      SELECT 
        la.id,
        la.user_id,
        u.username,
        la.email,
        la.ip_address,
        la.success,
        la.created_at as login_time
      FROM login_activity la
      LEFT JOIN users u ON la.user_id = u.id
      ORDER BY la.created_at DESC
      LIMIT 100
    `);

    res.json({ success: true, activity });
  } catch (error) {
    console.error("Error fetching user activity:", error);
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
});


/* ---------------- SEND TEST NOTIFICATION ---------------- */
app.get("/send-test", async (req, res) => {
  const [subs] = await db.query("SELECT subscription_json FROM push_subscriptions");
  subs.forEach((s) => {
    webpush
      .sendNotification(JSON.parse(s.subscription_json), JSON.stringify({ title: "Reminder", body: "Push notifications working!" }))
      .catch((err) => console.error(err));
  });
  res.send("Sent test notifications");
});

/* ---------------- LOGIN ACTIVITY TABLE ---------------- */
db.query(
  `CREATE TABLE IF NOT EXISTS login_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(100),
    success TINYINT(1) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id),
    INDEX (email),
    INDEX (created_at)
  ) ENGINE=InnoDB`
).catch(() => { });

// Create coach_details table if not exists
db.query(
  `CREATE TABLE IF NOT EXISTS coach_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    dob DATE NOT NULL,
    coach_type VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    bio TEXT,
    years_experience INT,
    hours_coached INT,
    specialties TEXT,
    certifications TEXT,
    social_links TEXT,
    profile_photo LONGTEXT,
    certificate_files LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    hourly_rate DECIMAL(10,2) DEFAULT NULL,
    UNIQUE KEY unique_user (user_id),
    INDEX (email)
  ) ENGINE=InnoDB`
).catch(() => { });

// Migration: Remove incorrect foreign key constraint if it exists
db.query(`ALTER TABLE coach_details DROP FOREIGN KEY fk_coach_details_user`).catch(() => { });

// Ensure existing table allows NULL user_id and has hourly_rate
db.query(`ALTER TABLE coach_details MODIFY COLUMN user_id INT NULL`).catch(() => { });
db.query(`ALTER TABLE coach_details ADD COLUMN hourly_rate DECIMAL(10,2) DEFAULT NULL AFTER status`).catch(() => { });

// Create coaches table if not exists
db.query(
  `CREATE TABLE IF NOT EXISTS coaches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (email)
  ) ENGINE=InnoDB`
).catch(() => { });

// Ensure name column exists in coaches (migration)
db.query(`ALTER TABLE coaches ADD COLUMN name VARCHAR(255) NOT NULL AFTER id`).catch(() => { });

/* ---------------- EMAIL VALIDATION ---------------- */
function validateEmailFormat(email) {
  const errors = [];

  // 1. Basic checks
  if (!email || typeof email !== 'string') {
    errors.push("Email is required");
    return { isValid: false, errors };
  }

  // 2. No spaces allowed
  if (/\s/.test(email)) {
    errors.push("Email must not contain spaces");
  }

  // 3. Length checks (5-254)
  if (email.length < 5) {
    errors.push("Email is too short (minimum 5 characters)");
  }
  if (email.length > 254) {
    errors.push("Email is too long (maximum 254 characters)");
  }

  // 4. One and only one @ symbol
  const parts = email.split('@');
  if (parts.length !== 2) {
    errors.push("Email must contain exactly one '@' symbol");
  } else {
    const [username, domain] = parts;

    // 5. Username (local part) rules
    if (!username) {
      errors.push("Email must have a username before the '@'");
    } else {
      // Allowed characters: letters, numbers, dot, underscore, hyphen
      // Using regex for character validation
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        errors.push("Username can only contain letters, numbers, dots, underscores, and hyphens");
      }
      // Cannot start or end with a dot
      if (username.startsWith('.')) {
        errors.push("Username cannot start with a dot");
      }
      if (username.endsWith('.')) {
        errors.push("Username cannot end with a dot");
      }
      // Cannot have two dots in a row
      if (username.includes('..')) {
        errors.push("Username cannot contain consecutive dots (..)");
      }
    }

    // 6. Domain rules
    if (!domain) {
      errors.push("Email must have a domain name after the '@'");
    } else {
      if (!domain.includes('.')) {
        errors.push("Domain must contain at least one dot (.)");
      }
      // Basic check for content after the last dot
      const domainParts = domain.split('.');
      if (domainParts[domainParts.length - 1].length < 2) {
        errors.push("Domain extension is too short");
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/* ---------------- PASSWORD VALIDATION ---------------- */
function validatePassword(password) {
  const errors = [];

  // 1. Length check (8-20 characters)
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (password.length > 20) {
    errors.push("Password must be at most 20 characters long");
  }

  // 2. Uppercase letter check
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least 1 uppercase letter (A-Z)");
  }

  // 3. Lowercase letter check
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least 1 lowercase letter (a-z)");
  }

  // 4. Special character check
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least 1 special character (!@#$%^&*...)");
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/* ---------------- REGISTER ---------------- */
app.post("/api/register", async (req, res) => {
  // Ensure no existing session persists after registration starts
  if (req.session) {
    req.session.destroy((err) => {
      if (err) console.error("Error destroying session during registration:", err);
    });
  }

  const { username, email, password, userType } = req.body;
  const type = userType || "user";

  if (!username || !email || !password) return res.status(400).json({ error: "All fields required" });

  // Validate Email Format (New accounts only)
  const emailValidation = validateEmailFormat(email);
  if (!emailValidation.isValid) {
    return res.status(400).json({
      error: "Invalid email format",
      details: emailValidation.errors
    });
  }

  // Validate Password (New accounts only)
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      error: "Password does not meet requirements",
      details: passwordValidation.errors
    });
  }

  try {
    // Check if username is already taken
    const [existingUser] = await db.query(
      "SELECT id FROM users WHERE username = ? UNION SELECT id FROM coaches WHERE name = ?",
      [username, username]
    );
    if (existingUser.length > 0) {
      // Generate 4 unique suggestions
      const suggestions = [];
      const bases = [
        username + Math.floor(Math.random() * 900 + 100),
        username + '_' + Math.floor(Math.random() * 99 + 1),
        username + new Date().getFullYear(),
        username + Math.floor(Math.random() * 9000 + 1000),
      ];
      for (const suggestion of bases) {
        const [check] = await db.query(
          "SELECT id FROM users WHERE username = ? UNION SELECT id FROM coaches WHERE name = ?",
          [suggestion, suggestion]
        );
        if (check.length === 0) suggestions.push(suggestion);
      }
      // Fill remaining slots if any collided
      while (suggestions.length < 4) {
        const fallback = username + Math.floor(Math.random() * 90000 + 10000);
        const [check] = await db.query(
          "SELECT id FROM users WHERE username = ? UNION SELECT id FROM coaches WHERE name = ?",
          [fallback, fallback]
        );
        if (check.length === 0 && !suggestions.includes(fallback)) suggestions.push(fallback);
      }
      return res.status(409).json({
        error: "Username is already taken",
        suggestions: suggestions.slice(0, 4)
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // COACH REGISTRATION
    if (type === 'coach') {
      const [result] = await db.query(
        "INSERT INTO coaches (name, email, hashed_password) VALUES (?, ?, ?)",
        [username, email, hashedPassword]
      );
      return res.json({ success: true, message: "Account created successfully! Please log in." });
    }

    // USER REGISTRATION
    const [result] = await db.query(
      "INSERT INTO users (username, email, password_hash, user_type) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, type]
    );

    res.json({ success: true, message: "Account created successfully! Please log in." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(400).json({ error: "Email already registered" });
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Ensure admin_audit table has correct schema
async function ensureAdminAuditTable() {
  try {
    // Check if table exists
    const [tables] = await db.query("SHOW TABLES LIKE 'admin_audit'");
    if (tables.length === 0) {
      // Create new table
      await db.query(`
        CREATE TABLE admin_audit (
          id INT AUTO_INCREMENT PRIMARY KEY,
          admin_email VARCHAR(255) NOT NULL,
          login_time DATETIME,
          logout_time DATETIME
        )
      `);
    } else {
      // Check columns and alter if necessary
      const [columns] = await db.query("SHOW COLUMNS FROM admin_audit");
      const columnNames = columns.map(c => c.Field);

      if (!columnNames.includes('login_time')) {
        await db.query("ALTER TABLE admin_audit ADD COLUMN login_time DATETIME");
      }
      if (!columnNames.includes('logout_time')) {
        await db.query("ALTER TABLE admin_audit ADD COLUMN logout_time DATETIME");
      }
      // Optional: drop old columns if they exist and you want to clean up
      if (columnNames.includes('action')) {
        await db.query("ALTER TABLE admin_audit DROP COLUMN action");
      }
      if (columnNames.includes('timestamp')) {
        await db.query("ALTER TABLE admin_audit DROP COLUMN timestamp");
      }
    }
  } catch (e) {
    console.error("Error ensuring admin_audit table:", e);
  }
}
ensureAdminAuditTable();

/* ---------------- ENSURE USER DATA TABLES ---------------- */
async function ensureUserTables() {
  try {
    // Todos
    await db.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        text VARCHAR(255) NOT NULL,
        priority VARCHAR(50) DEFAULT 'important',
        urgent VARCHAR(50) DEFAULT 'urgent',
        done TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Migration: ensure completed_at exists
    try {
      await db.query("ALTER TABLE todos ADD COLUMN completed_at TIMESTAMP NULL");
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log("Todos migration notice:", e.message);
    }

    // Shopping
    await db.query(`
      CREATE TABLE IF NOT EXISTS shopping_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        text VARCHAR(255) NOT NULL,
        urgent VARCHAR(50) DEFAULT 'urgent',
        bought TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // 4. Coach Articles
    await db.query(`
      CREATE TABLE IF NOT EXISTS coach_articles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coach_id INT NULL,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        content LONGTEXT,
        category VARCHAR(100),
        image_url TEXT,
        status ENUM('draft', 'published') DEFAULT 'draft',
        keywords TEXT,
        index_page TINYINT(1) DEFAULT 1,
        follow_links TINYINT(1) DEFAULT 1,
        tags TEXT,
        featured TINYINT(1) DEFAULT 0,
        published_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    // Ensure coach_id can be NULL (for existing tables)
    try {
      await db.query("ALTER TABLE coach_articles MODIFY coach_id INT NULL");
      // Add new columns if they don't exist
      const columns = [
        "ALTER TABLE coach_articles ADD COLUMN keywords TEXT",
        "ALTER TABLE coach_articles ADD COLUMN index_page TINYINT(1) DEFAULT 1",
        "ALTER TABLE coach_articles ADD COLUMN follow_links TINYINT(1) DEFAULT 1",
        "ALTER TABLE coach_articles ADD COLUMN tags TEXT",
        "ALTER TABLE coach_articles ADD COLUMN featured TINYINT(1) DEFAULT 0"
      ];
      for (const sql of columns) {
        try { await db.query(sql); } catch (e) { /* ignore duplicate column */ }
      }
    } catch (e) {
      console.log("coach_articles migration notice:", e.message);
    }

    // Reminders
    await db.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        when_time DATETIME NULL,
        done TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Goals
    await db.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        text VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        total FLOAT DEFAULT 0,
        spent FLOAT DEFAULT 0,
        done TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Messages Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        sender_type ENUM('user', 'coach') NOT NULL,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Coach Categories Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS coach_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        slug VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default categories if none exist
    const [existingCats] = await db.query("SELECT COUNT(*) as count FROM coach_categories");
    const countVal = existingCats[0].count;
    if (countVal === 0) {
      const defaults = [
        ['Business Coaching', 'business'],
        ['Life Coaching', 'life'],
        ['Career Coaching', 'career'],
        ['Executive Coaching', 'executive'],
        ['Health & Wellness Coaching', 'health'],
        ['Relationship Coaching', 'relationship'],
        ['Spiritual Coaching', 'spiritual']
      ];
      await db.query("INSERT INTO coach_categories (name, slug) VALUES ?", [defaults]);
    }

    console.log("✅ User data tables ensured");
  } catch (err) {
    console.error("Error creating user tables:", err);
  }
}
ensureUserTables();

// --- SCHEMA MIGRATION ---
async function migrateCoachSchema() {
  const columns = [
    "ADD COLUMN location VARCHAR(255)",
    "ADD COLUMN bio TEXT",
    "ADD COLUMN years_experience INT",
    "ADD COLUMN hours_coached INT",
    "ADD COLUMN specialties TEXT",
    "ADD COLUMN certifications TEXT",
    "ADD COLUMN social_links TEXT",
    "ADD COLUMN profile_photo LONGTEXT",
    "ADD COLUMN certificate_files LONGTEXT",
    "ADD COLUMN status VARCHAR(50) DEFAULT 'pending'"
  ];

  for (const col of columns) {
    try {
      await db.query(`ALTER TABLE coach_details ${col}`);
    } catch (e) {
      // Ignore "Duplicate column name" error code 1060
      if (e.errno !== 1060) console.log("Migration notice:", e.message);
    }
  }
}
migrateCoachSchema();
async function migrateCalendarSchema() {
  try {
    await db.query("ALTER TABLE users ADD COLUMN calendar_token VARCHAR(255) UNIQUE");
    console.log("✓ Added calendar_token column to users table");
  } catch (e) {
    if (e.errno !== 1060) console.log("Calendar migration notice:", e.message);
  }
}
migrateCalendarSchema();
async function migrateEventsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        event_date DATE NOT NULL,
        event_time TIME DEFAULT '12:00:00',
        description TEXT,
        event_type VARCHAR(50) DEFAULT 'personal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log("✓ Events table migration ensured");
  } catch (e) {
    console.log("Events migration notice:", e.message);
  }
}
migrateEventsTable();

/* ---------------- DATA API ROUTES ---------------- */

// Helper to get userId from session or token
const getUserId = (req) => {
  if (req.session && req.session.userId) return req.session.userId;
  return null;
};

// Middleware to ensure authentication (User only)
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
};

// Middleware to ensure authentication (Any role)
const requireAnyAuth = (req, res, next) => {
  if (req.session && (req.session.userId || req.session.coachId)) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
};

// --- USER THEME API ---
app.put("/api/user/theme", requireAuth, async (req, res) => {
  const { themeId, themeColors } = req.body;
  try {
    await db.query(
      "UPDATE users SET theme_id = ?, theme_colors = ? WHERE id = ?",
      [themeId, JSON.stringify(themeColors), req.userId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --- TODOS --- */
app.get("/api/todos", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/todos", requireAuth, async (req, res) => {
  const { text, priority, urgent } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO todos (user_id, text, priority, urgent) VALUES (?, ?, ?, ?)",
      [req.userId, text, priority, urgent]
    );
    notifyStudentUpdate(req.userId, 'todo'); // Notify Coach
    res.json({ id: result.insertId, text, priority, urgent, done: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/todos/:id", requireAuth, async (req, res) => {
  const { done } = req.body;
  try {
    const completedAt = done ? new Date() : null;
    await db.query(
      "UPDATE todos SET done = ?, completed_at = ? WHERE id = ? AND user_id = ?",
      [done ? 1 : 0, completedAt, req.params.id, req.userId]
    );
    notifyStudentUpdate(req.userId, 'todo'); // Notify Coach
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/user/analytics", requireAuth, analyticsController.getUserAnalytics);

app.delete("/api/todos/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM todos WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    notifyStudentUpdate(req.userId, 'todo'); // Notify Coach
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --- SHOPPING --- */
app.get("/api/shopping", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM shopping_items WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/shopping", requireAuth, async (req, res) => {
  const { text } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO shopping_items (user_id, text) VALUES (?, ?)",
      [req.userId, text]
    );
    res.json({ id: result.insertId, text, bought: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/shopping/:id", requireAuth, async (req, res) => {
  const { bought } = req.body;
  try {
    await db.query("UPDATE shopping_items SET bought = ? WHERE id = ? AND user_id = ?", [bought ? 1 : 0, req.params.id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/shopping/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM shopping_items WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --- REMINDERS --- */
app.get("/api/reminders", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM reminders WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/reminders", requireAuth, async (req, res) => {
  const { title, when } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO reminders (user_id, title, when_time) VALUES (?, ?, ?)",
      [req.userId, title, when || null]
    );
    res.json({ id: result.insertId, title, when_time: when, done: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/reminders/:id", requireAuth, async (req, res) => {
  const { done } = req.body;
  try {
    await db.query("UPDATE reminders SET done = ? WHERE id = ? AND user_id = ?", [done ? 1 : 0, req.params.id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/reminders/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM reminders WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --- GOALS --- */
app.get("/api/goals", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/goals", requireAuth, async (req, res) => {
  const { text, category, total, spent } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO goals (user_id, text, category, total, spent) VALUES (?, ?, ?, ?, ?)",
      [req.userId, text, category, total, spent]
    );
    notifyStudentUpdate(req.userId, 'goal'); // Notify Coach
    res.json({ id: result.insertId, text, category, total, spent, done: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/goals/:id", requireAuth, async (req, res) => {
  const { spent } = req.body;
  try {
    await db.query(
      "UPDATE goals SET spent = ? WHERE id = ? AND user_id = ?",
      [spent, req.params.id, req.userId]
    );
    notifyStudentUpdate(req.userId, 'goal'); // Notify Coach
    res.json({ success: true, spent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/goals/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM goals WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    notifyStudentUpdate(req.userId, 'goal'); // Notify Coach
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --- CALENDAR EVENTS --- */
app.get("/api/calendar/events", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM events WHERE user_id = ? ORDER BY event_date ASC, event_time ASC", [req.userId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/calendar/events", requireAuth, async (req, res) => {
  const { title, date, time, description, type } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO events (user_id, title, event_date, event_time, description, event_type) VALUES (?, ?, ?, ?, ?, ?)",
      [req.userId, title, date, time || '12:00:00', description, type || 'personal']
    );
    res.json({ id: result.insertId, title, event_date: date, event_time: time, description, event_type: type });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/calendar/events/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM events WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



/* --- CALENDAR EVENTS API --- */
app.get("/api/calendar/events", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM events WHERE user_id = ? ORDER BY event_date ASC",
      [req.userId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/calendar/events", requireAuth, async (req, res) => {
  const { title, date, time, description, type } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO events (user_id, title, event_date, event_time, description, event_type) VALUES (?, ?, ?, ?, ?, ?)",
      [req.userId, title, date, time || '12:00:00', description || null, type || 'personal']
    );
    res.json({ id: result.insertId, title, date, time, description, type });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/calendar/events/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM events WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/* ---------------- SIGN OUT ---------------- */
app.post('/api/signout', async (req, res) => {
  try {
    if (req.session.userId) {
      // Get user email before destroying session
      const [users] = await db.query('SELECT email FROM users WHERE id = ?', [req.session.userId]);
      const userEmail = users[0]?.email;

      // Log the sign-out in admin_audit
      if (userEmail) {
        await db.query(
          'INSERT INTO admin_audit (admin_email, login_time, logout_time) VALUES (?, NOW(), NOW())',
          [userEmail]
        );
      }

      // Destroy the session
      req.session.destroy(err => {
        if (err) {
          console.error('Error destroying session:', err);
          return res.status(500).json({ error: 'Error signing out' });
        }

        // Clear the session cookie
        res.clearCookie('connect.sid', {
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'lax'
        });

        res.status(200).json({ message: 'Signed out successfully' });
      });
    } else {
      res.status(200).json({ message: 'No active session' });
    }
  } catch (error) {
    console.error('Sign out error:', error);
    res.status(500).json({ error: 'Error signing out' });
  }
});

/* ---------------- CHANGE USERNAME ---------------- */
app.put("/api/me/username", async (req, res) => {
  try {
    let userId = req.session?.userId;
    // Allow JWT auth check
    if (!userId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (e) { }
    }

    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { username } = req.body;
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    // Check for duplicates
    const [existing] = await db.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length > 0 && existing[0].id != userId) {
      // Generate 4 suggestions
      const suggestions = [];
      let attempt = 0;
      while (suggestions.length < 4 && attempt < 20) {
        attempt++;
        const suffix = Math.floor(100 + Math.random() * 9000);
        const suggestedName = `${username}${suffix}`;

        const [check] = await db.query("SELECT id FROM users WHERE username = ?", [suggestedName]);
        if (check.length === 0) {
          suggestions.push(suggestedName);
        }
      }
      return res.status(400).json({
        error: "Username is already taken",
        suggestions: suggestions
      });
    }

    // Update
    await db.query("UPDATE users SET username = ? WHERE id = ?", [username, userId]);

    res.json({ success: true, username: username });
  } catch (e) {
    console.error("Change username error:", e);
    res.status(500).json({ error: "Failed to update username" });
  }
});

/* ---------------- NOTIFICATION SCHEDULER ---------------- */
// Check for due reminders every 10 seconds for high precision
setInterval(async () => {
  try {
    // Check for due reminders that haven't been notified yet
    // efficient anti-duplicate check: `reminder_id` in notifications table
    const [reminders] = await db.query(
      `SELECT r.id, r.user_id, r.title, r.when_time 
       FROM reminders r
       LEFT JOIN notifications n ON r.id = n.reminder_id
       WHERE r.done = 0 
       AND r.when_time <= UTC_TIMESTAMP()
       AND r.when_time > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
       AND n.id IS NULL`
    );

    if (reminders.length > 0) {
      console.log(`[Scheduler] Found ${reminders.length} due reminders.`);
    }

    for (const reminder of reminders) {
      try {
        // Get user's push subscription
        const [subscriptions] = await db.query(
          "SELECT subscription_json FROM push_subscriptions WHERE user_id = ?",
          [reminder.user_id]
        );

        if (subscriptions.length > 0) {
          const subscription = JSON.parse(subscriptions[0].subscription_json);
          const payload = JSON.stringify({
            title: "Reminder",
            body: reminder.title,
            url: "/app.html"
          });

          // Store notification FIRST to prevent race conditions/duplicates in next tick
          await db.query(
            `INSERT INTO notifications (user_id, title, body, reminder_id) 
             VALUES (?, ?, ?, ?)`,
            [reminder.user_id, "Reminder", reminder.title, reminder.id]
          );

          // Send push notification
          await webpush.sendNotification(subscription, payload);

          console.log(`✓ Sent notification for reminder: ${reminder.title}`);
        }
      } catch (error) {
        console.error(`Error sending notification for reminder ${reminder.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Notification scheduler error:", error);
  }
}, 5000); // Check every 5 seconds for higher precision

console.log("📢 Notification scheduler started");

/* ---------------- START SERVER ---------------- */

// Create complaints table
db.query(
  `CREATE TABLE IF NOT EXISTS complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`
).catch(() => { });

/* ---------------- EMAIL SERVICE ---------------- */
const emailTransport = nodemailer.createTransport({
  // For development without real credentials, we'll log to console.
  // In production, replace with:
  // host: 'smtp.gmail.com', port: 587, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  jsonTransport: true
});


// Function to send contact form email
async function sendContactEmail(senderName, senderEmail, subject, message) {
  const targetEmail = process.env.CONTACT_TARGET_EMAIL;

  console.log(`\n================================`);
  console.log(`📧 Contact Message from ${senderName} (${senderEmail})`);
  console.log(`Subject: ${subject}`);
  console.log(`Message: ${message}`);
  console.log(`================================\n`);

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"${senderName}" <${process.env.EMAIL_USER}>`, // Send from our account but show sender's name
        to: targetEmail,
        replyTo: senderEmail,
        subject: `Contact Form: ${subject}`,
        text: `You have received a new message from your contact form.\n\nName: ${senderName}\nEmail: ${senderEmail}\nSubject: ${subject}\n\nMessage:\n${message}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">New Contact Form Message</h2>
            <p><strong>Name:</strong> ${senderName}</p>
            <p><strong>Email:</strong> ${senderEmail}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
        `
      });
      return true;
    } catch (e) {
      console.error("Contact email send failed:", e);
      return false;
    }
  }
  return false;
}

/* ---------------- CONTACT ENDPOINT ---------------- */
app.post("/api/contact", async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Save to database
    await db.query(
      "INSERT INTO complaints (name, email, subject, message) VALUES (?, ?, ?, ?)",
      [name, email, subject, message]
    );

    // Log locally for visibility
    console.log(`\n================================`);
    console.log(`📥 New Complaint Saved to Dashboard`);
    console.log(`From: ${name} (${email})`);
    console.log(`Subject: ${subject}`);
    console.log(`================================\n`);

    res.json({ success: true, message: "Thank you for your message! Our team will review it in the admin dashboard." });
  } catch (error) {
    console.error("Error saving complaint:", error);
    res.status(500).json({ error: "Failed to submit message. Please try again." });
  }
});

/* ---------------- ADMIN COMPLAINTS ENDPOINTS ---------------- */
app.get("/api/admin/complaints", async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Admin Authorization Check (Session or DB)
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email, user_type FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Admin access only" });

    const [rows] = await db.query("SELECT * FROM complaints ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

app.post("/api/admin/complaints/:id/status", async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Admin access only" });

    const { id } = req.params;
    const { status } = req.body;

    await db.query("UPDATE complaints SET status = ? WHERE id = ?", [status, id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating complaint status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

app.delete("/api/admin/complaints/:id", async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Admin access only" });

    const { id } = req.params;

    await db.query("DELETE FROM complaints WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting complaint:", error);
    res.status(500).json({ error: "Failed to delete complaint" });
  }
});

/* ---------------- OTP ENDPOINTS ---------------- */

// 1. Request OTP
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    // Check if user exists
    const [users] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (users.length === 0) {
      // Don't reveal user existence, just fake success
      return res.json({ success: true, message: "If account exists, OTP sent." });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // Store in DB
    await db.query(
      "INSERT INTO otp_verifications (email, otp_code, expires_at) VALUES (?, ?, ?)",
      [email, otp, expiresAt]
    );

    // Send Email (Mocked or Real)
    await sendOtpEmail(email, otp);

    res.json({ success: true, message: "OTP sent to email" });
  } catch (e) {
    console.error("Forgot PW Error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Verify OTP and Reset Password
app.post("/api/auth/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: "Email, OTP, and new password required" });
  }

  try {
    // Verify OTP
    const [records] = await db.query(
      `SELECT * FROM otp_verifications 
       WHERE email = ? AND otp_code = ? AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp]
    );

    if (records.length === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // Update user password
    await db.query("UPDATE users SET password_hash = ? WHERE email = ?", [hash, email]);

    // Clean up OTPs
    await db.query("DELETE FROM otp_verifications WHERE email = ?", [email]);

    res.json({ success: true, message: "Password updated successfully" });
  } catch (e) {
    console.error("Reset PW Error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------- BLOG API ---------------- */
async function ensureCoachArticlesTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS coach_articles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coach_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        description VARCHAR(255),
        content LONGTEXT,
        category VARCHAR(100),
        image_url VARCHAR(255),
        status ENUM('published', 'draft', 'pending') DEFAULT 'draft',
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (coach_id) REFERENCES coaches(id)
      ) ENGINE=InnoDB
    `);
    console.log("Coach articles table ensured");
  } catch (e) {
    console.error("Error ensuring coach articles table:", e);
  }
}
// 1. Relationship Table & Migration
async function ensureCoachRelationshipTables() {
  try {
    // 1. Connection Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_coach_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coach_id INT NOT NULL,
        status ENUM('active', 'inactive', 'pending', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_conn (user_id, coach_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Migration: Update content of enum if it already exists but is old
    try {
      await db.query("ALTER TABLE user_coach_connections MODIFY COLUMN status ENUM('active', 'inactive', 'pending', 'rejected') DEFAULT 'pending'");
    } catch (e) { }

    // 2. Coach Reviews Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS coach_reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coach_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    console.log("Coach relationship and review tables ensured");
  } catch (e) {
    console.error("Error ensuring coach relationship tables:", e);
  }
}
ensureCoachRelationshipTables();

// Migration: Ensure coach_articles status has 'pending'
async function migrateArticleStatus() {
  try {
    await db.query("ALTER TABLE coach_articles MODIFY COLUMN status ENUM('published', 'draft', 'pending') DEFAULT 'draft'");
  } catch (e) { }
}
migrateArticleStatus();

async function upgradeBookingSchema() {
  try {
    // 1. Update status ENUM to include pending/rejected
    await db.query("ALTER TABLE user_coach_connections MODIFY COLUMN status ENUM('active', 'inactive', 'pending', 'rejected') DEFAULT 'pending'");
  } catch (e) { }

  // 2. Add new booking columns
  const cols = [
    "booking_goal TEXT",
    "booking_category VARCHAR(100)",
    "session_type VARCHAR(50)",
    "requested_time VARCHAR(100)", // Keeping as string for flexibility (ISO format)
    "user_timezone VARCHAR(50)",
    "user_photo LONGTEXT",  // In case they upload a base64 image
    "user_name_input VARCHAR(255)"
  ];

  for (const col of cols) {
    try {
      await db.query(`ALTER TABLE user_coach_connections ADD COLUMN ${col}`);
    } catch (e) { }
  }
}
upgradeBookingSchema();

// 2. Book Coach Endpoint (Creates Pending Request with Details)
app.post("/api/book-coach", requireAuth, async (req, res) => {
  const { coachId, goal, category, sessionType, requestedTime, timezone, userPhoto, userName } = req.body;

  if (!coachId) return res.status(400).json({ error: "Coach ID required" });

  try {
    // Check if connection exists
    const [existing] = await db.query(
      "SELECT status FROM user_coach_connections WHERE user_id = ? AND coach_id = ?",
      [req.userId, coachId]
    );

    if (existing.length > 0) {
      if (existing[0].status === 'active') {
        // ALLOW RE-BOOKING for testing: Move status back to pending and update details
        await db.query(`
          UPDATE user_coach_connections 
          SET status = 'pending', booking_goal = ?, booking_category = ?, session_type = ?, requested_time = ?, user_timezone = ?, user_photo = ?, user_name_input = ?
          WHERE user_id = ? AND coach_id = ?
        `, [goal, category, sessionType, requestedTime, timezone, userPhoto, userName, req.userId, coachId]);

        return res.json({ success: true, message: "Booking request sent (re-booked for testing)", status: 'pending' });
      }
      if (existing[0].status === 'pending') {
        // Update details even if pending
        await db.query(`
          UPDATE user_coach_connections 
          SET booking_goal = ?, booking_category = ?, session_type = ?, requested_time = ?, user_timezone = ?, user_photo = ?, user_name_input = ?
          WHERE user_id = ? AND coach_id = ?
        `, [goal, category, sessionType, requestedTime, timezone, userPhoto, userName, req.userId, coachId]);

        return res.status(200).json({ success: true, message: "Request updated", status: 'pending' });
      }

      // If inactive/rejected, re-open as pending with new details
      await db.query(`
        UPDATE user_coach_connections 
        SET status = 'pending', booking_goal = ?, booking_category = ?, session_type = ?, requested_time = ?, user_timezone = ?, user_photo = ?, user_name_input = ?
        WHERE user_id = ? AND coach_id = ?
      `, [goal, category, sessionType, requestedTime, timezone, userPhoto, userName, req.userId, coachId]);

      return res.json({ success: true, message: "Booking request sent", status: 'pending' });
    }

    // Insert new pending connection
    await db.query(`
      INSERT INTO user_coach_connections (user_id, coach_id, status, booking_goal, booking_category, session_type, requested_time, user_timezone, user_photo, user_name_input)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `, [req.userId, coachId, goal, category, sessionType, requestedTime, timezone, userPhoto, userName]);

    res.json({ success: true, message: "Booking request sent", status: 'pending' });
  } catch (e) {
    console.error("Book coach error:", e);
    res.status(500).json({ error: "Failed to book coach" });
  }
});

// 3. Get Coach's Students (Active Only)
app.get("/api/coach/students", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  try {
    // Check coach status first
    const [coach] = await db.query("SELECT status FROM coach_details WHERE user_id = ?", [coachId]);
    if (coach.length === 0 || (coach[0].status !== 'approved' && coach[0].status !== 'deactivated')) {
      return res.status(403).json({ error: "Coach account is not active" });
    }

    const [students] = await db.query(`
      SELECT u.id, u.username, u.email, 
             ucc.status,
             (SELECT COUNT(*) FROM todos t WHERE t.user_id = u.id AND t.done = 1) as tasksDone,
             (SELECT COUNT(*) FROM todos t WHERE t.user_id = u.id) as totalTasks,
             (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) as totalGoals,
             (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.sender_type = 'user' AND m.is_read = 0) as unreadCount
      FROM user_coach_connections ucc
      JOIN users u ON ucc.user_id = u.id
      WHERE ucc.coach_id = ? AND ucc.status = 'active'
    `, [coachId, coachId]);
    res.json(students);
  } catch (e) {
    console.error("Get students error:", e);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

// 4. Get Coach's Pending Requests
app.get("/api/coach/pending-requests", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  try {
    const [requests] = await db.query(`
      SELECT 
        u.id as user_id, 
        u.username, 
        u.email, 
        ucc.created_at,
        ucc.booking_goal,
        ucc.booking_category,
        ucc.session_type,
        ucc.requested_time,
        ucc.user_timezone,
        ucc.user_photo,
        ucc.user_name_input
      FROM user_coach_connections ucc
      JOIN users u ON ucc.user_id = u.id
      WHERE ucc.coach_id = ? AND ucc.status = 'pending'
      ORDER BY ucc.created_at DESC
    `, [coachId]);
    res.json(requests);
  } catch (e) {
    console.error("Get pending requests error:", e);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// 5. Respond to Request (Approve/Reject)
app.post("/api/coach/respond-request", async (req, res) => {
  const coachId = req.session?.coachId;
  const { userId, action } = req.body; // action: 'approve' or 'reject'

  if (!coachId) return res.status(401).json({ error: "Not authenticated" });
  if (!userId || !action) return res.status(400).json({ error: "Missing fields" });

  const newStatus = action === 'approve' ? 'active' : 'rejected';

  try {
    await db.query(
      "UPDATE user_coach_connections SET status = ? WHERE coach_id = ? AND user_id = ?",
      [newStatus, coachId, userId]
    );

    // If approved, maybe send a notification? (Future task)
    res.json({ success: true, message: `Request ${newStatus}` });
  } catch (e) {
    console.error("Respond request error:", e);
    res.status(500).json({ error: "Failed to update request" });
  }
});

// 6. Coach: Assign a To-Do to a Student
app.post("/api/coach/assign-todo", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  const { studentId, text, priority, urgent } = req.body;
  if (!studentId || !text) return res.status(400).json({ error: "Missing fields" });

  try {
    // Verify coach-student connection
    const [conn] = await db.query(
      "SELECT id FROM user_coach_connections WHERE coach_id = ? AND user_id = ? AND status = 'active'",
      [coachId, studentId]
    );
    if (conn.length === 0) return res.status(403).json({ error: "No active connection with this student" });

    const [result] = await db.query(
      "INSERT INTO todos (user_id, text, priority, urgent) VALUES (?, ?, ?, ?)",
      [studentId, text, priority || 'important', urgent || 'urgent']
    );

    // Notification
    const [coachInfo] = await db.query("SELECT name FROM coaches WHERE id = ?", [coachId]);
    const coachName = coachInfo[0]?.name || 'Your Coach';
    await db.query(
      "INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)",
      [studentId, "New Task Assigned", `${coachName} assigned a new task: ${text}`]
    );

    res.json({ success: true, id: result.insertId, message: "Task assigned to student" });
  } catch (e) {
    console.error("Assign todo error:", e);
    res.status(500).json({ error: "Failed to assign task" });
  }
});

// 7. Coach: Assign a Goal to a Student
app.post("/api/coach/assign-goal", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  const { studentId, text, category, total } = req.body;
  if (!studentId || !text) return res.status(400).json({ error: "Missing fields" });

  try {
    const [conn] = await db.query(
      "SELECT id FROM user_coach_connections WHERE coach_id = ? AND user_id = ? AND status = 'active'",
      [coachId, studentId]
    );
    if (conn.length === 0) return res.status(403).json({ error: "No active connection with this student" });

    const [result] = await db.query(
      "INSERT INTO goals (user_id, text, category, total, spent) VALUES (?, ?, ?, ?, 0)",
      [studentId, text, category || 'Personal', total || 0]
    );

    // Notification
    const [coachInfo] = await db.query("SELECT name FROM coaches WHERE id = ?", [coachId]);
    const coachName = coachInfo[0]?.name || 'Your Coach';
    await db.query(
      "INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)",
      [studentId, "New Goal Assigned", `${coachName} assigned a new goal: ${text}`]
    );

    res.json({ success: true, id: result.insertId, message: "Goal assigned to student" });
  } catch (e) {
    console.error("Assign goal error:", e);
    res.status(500).json({ error: "Failed to assign goal" });
  }
});

// 8. Coach: Assign a Reminder to a Student
app.post("/api/coach/assign-reminder", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  const { studentId, title, when } = req.body;
  if (!studentId || !title) return res.status(400).json({ error: "Missing fields" });

  try {
    const [conn] = await db.query(
      "SELECT id FROM user_coach_connections WHERE coach_id = ? AND user_id = ? AND status = 'active'",
      [coachId, studentId]
    );
    if (conn.length === 0) return res.status(403).json({ error: "No active connection with this student" });

    const [result] = await db.query(
      "INSERT INTO reminders (user_id, title, when_time) VALUES (?, ?, ?)",
      [studentId, title, when || null]
    );

    // Notification
    const [coachInfo] = await db.query("SELECT name FROM coaches WHERE id = ?", [coachId]);
    const coachName = coachInfo[0]?.name || 'Your Coach';
    await db.query(
      "INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)",
      [studentId, "New Reminder Assigned", `${coachName} assigned a new reminder: ${title}`]
    );

    res.json({ success: true, id: result.insertId, message: "Reminder assigned to student" });
  } catch (e) {
    console.error("Assign reminder error:", e);
    res.status(500).json({ error: "Failed to assign reminder" });
  }
});

// 9. Get User Profile for Coach Review
app.get("/api/coach/user-profile/:userId", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated" });

  const { userId } = req.params;

  try {
    // Get user info
    const [users] = await db.query(
      "SELECT id, username, email, created_at FROM users WHERE id = ?",
      [userId]
    );
    if (users.length === 0) return res.status(404).json({ error: "User not found" });

    const user = users[0];

    // Get booking details
    const [booking] = await db.query(
      `SELECT booking_goal, booking_category, session_type, requested_time, user_timezone, user_photo, user_name_input 
       FROM user_coach_connections WHERE user_id = ? AND coach_id = ?`,
      [userId, coachId]
    );

    // Get task stats
    const [taskStats] = await db.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as completed FROM todos WHERE user_id = ?`,
      [userId]
    );

    // Get goals
    const [goals] = await db.query(
      "SELECT text, category, done, created_at FROM goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
      [userId]
    );

    // Get recent activity (tasks created recently)
    const [recentTasks] = await db.query(
      "SELECT text, priority, done, created_at FROM todos WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
      [userId]
    );

    res.json({
      user,
      booking: booking[0] || {},
      stats: {
        totalTasks: taskStats[0]?.total || 0,
        completedTasks: taskStats[0]?.completed || 0,
        totalGoals: goals.length
      },
      goals,
      recentTasks
    });
  } catch (e) {
    console.error("User profile fetch error:", e);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Coach Deactivation Endpoint
app.post("/api/coach/deactivate", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated" });

  try {
    await db.query("UPDATE coach_details SET status = 'deactivated' WHERE user_id = ?", [coachId]);
    res.json({ success: true, message: "Account deactivated successfully" });
  } catch (e) {
    console.error("Deactivate error:", e);
    res.status(500).json({ error: "Failed to deactivate account" });
  }
});

// Coach Delete (Soft Delete) Endpoint
app.post("/api/coach/delete", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated" });

  try {
    // Check if coach has students before "marking" it? 
    // Requirement says just make sure they can't log back in.
    await db.query("UPDATE coach_details SET status = 'deleted' WHERE user_id = ?", [coachId]);

    // Log them out
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Account deleted successfully" });
    });
  } catch (e) {
    console.error("Delete account error:", e);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

app.get("/api/user/my-coach", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const [rows] = await db.query(
      `SELECT c.id, c.name, cd.coach_type, cd.profile_photo,
              (SELECT COUNT(*) FROM messages m WHERE m.sender_id = c.id AND m.receiver_id = ? AND m.sender_type = 'coach' AND m.is_read = 0) as unreadCount
       FROM coaches c 
       JOIN user_coach_connections ucc ON c.id = ucc.coach_id 
       LEFT JOIN coach_details cd ON c.id = cd.user_id
       WHERE ucc.user_id = ? AND ucc.status = 'active'
       LIMIT 1`,
      [userId, userId]
    );
    if (rows.length === 0) return res.json(null);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3.1 Get Coach's Pending Requests
app.get("/api/coach/requests", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  try {
    const [requests] = await db.query(`
      SELECT u.id, u.username, u.email, ucc.created_at, ucc.status
      FROM user_coach_connections ucc
      JOIN users u ON ucc.user_id = u.id
      WHERE ucc.coach_id = ? AND ucc.status = 'pending'
      ORDER BY ucc.created_at DESC
    `, [coachId]);
    res.json(requests);
  } catch (e) {
    console.error("Get requests error:", e);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// 3.2 Approve/Reject Request
app.post("/api/coach/requests/:userId/status", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  const { status } = req.body;
  const targetUserId = req.params.userId;

  if (!['active', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    await db.query(
      "UPDATE user_coach_connections SET status = ? WHERE coach_id = ? AND user_id = ?",
      [status, coachId, targetUserId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("Update request status error:", e);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// 4. Get specific student analytics (Enhanced for charts)
app.get("/api/coach/student/:id/analytics", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  const studentId = req.params.id;

  try {
    // Verify connection first
    const [conn] = await db.query(
      "SELECT id FROM user_coach_connections WHERE user_id = ? AND coach_id = ?",
      [studentId, coachId]
    );
    if (conn.length === 0) return res.status(403).json({ error: "Access denied" });

    // 1. Basic Stats
    const [tasksCompleted] = await db.query("SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND done = 1", [studentId]);
    const [allTodos] = await db.query("SELECT COUNT(*) as count FROM todos WHERE user_id = ?", [studentId]);
    const [goals] = await db.query("SELECT category, total, spent, text, done, created_at FROM goals WHERE user_id = ?", [studentId]);

    // 2. Historical Task Data (Last 7 Days)
    const [taskHistory] = await db.query(`
      SELECT DATE(COALESCE(completed_at, created_at)) as date, COUNT(*) as count
      FROM todos
      WHERE user_id = ? 
        AND done = 1
        AND COALESCE(completed_at, created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(COALESCE(completed_at, created_at))
      ORDER BY DATE(COALESCE(completed_at, created_at)) ASC
    `, [studentId]);

    // 3. Weekly Goals (Completed this week vs Total active this week)
    const [weeklyGoals] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN done = 1 AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as completed_this_week,
        SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as total_completed
      FROM goals 
      WHERE user_id = ? AND (done = 0 OR created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY))
    `, [studentId]);

    // 4. Most Active Day Calculation
    const [activeDayRows] = await db.query(`
      SELECT DAYNAME(COALESCE(completed_at, created_at)) as day_name, COUNT(*) as count
      FROM todos
      WHERE user_id = ? AND done = 1
      GROUP BY day_name
      ORDER BY count DESC
      LIMIT 1
    `, [studentId]);

    const mostActiveDay = activeDayRows.length > 0 ? activeDayRows[0].day_name : 'No activity';

    // 5. Completion Percentages
    const totalTasks = allTodos[0].count;
    const completedTasksNum = tasksCompleted[0].count;
    const tasksPercLeft = totalTasks > 0 ? Math.round(((totalTasks - completedTasksNum) / totalTasks) * 100) : 0;

    const totalGoalsCount = goals.length;
    const completedGoalsCount = goals.filter(g => g.done === 1).length;
    const goalsPercLeft = totalGoalsCount > 0 ? Math.round(((totalGoalsCount - completedGoalsCount) / totalGoalsCount) * 100) : 0;

    res.json({
      tasksCompleted: completedTasksNum,
      totalTasks: totalTasks,
      tasksPercLeft,
      goalsPercLeft,
      goals: goals,
      taskHistory: taskHistory,
      weeklyGoals: {
        total: weeklyGoals[0].total || 0,
        completed: weeklyGoals[0].completed_this_week || 0
      },
      mostActiveDay
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Get Overall Coach Analytics
app.get("/api/coach/analytics", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  try {
    // Total Clients (Active only)
    const [clients] = await db.query("SELECT COUNT(*) as count FROM user_coach_connections WHERE coach_id = ? AND status = 'active'", [coachId]);

    // Growth over time (Active connections by created_at)
    // We use created_at of connection, assuming that's when they applied? Or maybe when approved?
    // If we want "New Active Clients", maybe we should track `updated_at` when status changed?
    // For simplicity, let's just use `created_at` but only for those currently active.
    const [growth] = await db.query(`
      SELECT DATE_FORMAT(MIN(created_at), '%b') as month, COUNT(*) as count
      FROM user_coach_connections
      WHERE coach_id = ? AND status = 'active'
      GROUP BY YEAR(created_at), MONTH(created_at)
      ORDER BY YEAR(created_at) ASC, MONTH(created_at) ASC
    `, [coachId]);

    // Aggregate Student Performance (Active students only)
    const [performance] = await db.query(`
      SELECT DATE_FORMAT(MIN(t.created_at), '%b') as month, COUNT(*) as count
      FROM todos t
      JOIN user_coach_connections ucc ON t.user_id = ucc.user_id
      WHERE ucc.coach_id = ? AND t.done = 1 AND ucc.status = 'active'
      GROUP BY YEAR(t.created_at), MONTH(t.created_at)
      ORDER BY YEAR(t.created_at) ASC, MONTH(t.created_at) ASC
    `, [coachId]);

    // Aggregate Student Goals (Active students only)
    const [goalPerformance] = await db.query(`
      SELECT DATE_FORMAT(MIN(g.created_at), '%b') as month, COUNT(*) as count
      FROM goals g
      JOIN user_coach_connections ucc ON g.user_id = ucc.user_id
      WHERE ucc.coach_id = ? AND ucc.status = 'active'
      GROUP BY YEAR(g.created_at), MONTH(g.created_at)
      ORDER BY YEAR(g.created_at) ASC, MONTH(g.created_at) ASC
    `, [coachId]);

    res.json({
      totalClients: clients[0].count,
      growth: growth,
      performance: performance,
      goalPerformance: goalPerformance
    });
  } catch (e) {
    console.error("Coach Analytics Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// 6. Get Client-Specific Analytics (For individual graphs)
app.get("/api/coach/analytics/clients", async (req, res) => {
  const coachId = req.session?.coachId;
  if (!coachId) return res.status(401).json({ error: "Not authenticated as coach" });

  try {
    // Get all active students
    const [students] = await db.query(`
      SELECT u.id, u.username, u.name 
      FROM user_coach_connections ucc
      JOIN users u ON ucc.user_id = u.id
      WHERE ucc.coach_id = ? AND ucc.status = 'active'
    `, [coachId]);

    const analyticsData = await Promise.all(students.map(async (student) => {
      // Task Stats
      const [todos] = await db.query(`
        SELECT 
          COUNT(*) as total, 
          SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as completed 
        FROM todos WHERE user_id = ?
      `, [student.id]);

      // Weekly Activity (Last 7 Days)
      const [weekly] = await db.query(`
        SELECT DATE(completed_at) as date, COUNT(*) as count
        FROM todos
        WHERE user_id = ? AND done = 1 AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(completed_at)
      `, [student.id]);

      // Active Goals
      const [goals] = await db.query(`
        SELECT text, total, spent FROM goals WHERE user_id = ? AND done = 0
      `, [student.id]);

      return {
        userId: student.id,
        name: student.name || student.username,
        todos: {
          total: todos[0].total || 0,
          completed: todos[0].completed || 0,
          weekly: weekly // [{ date: '2023-01-01', count: 5 }]
        },
        goals: {
          active: goals
        }
      };
    }));

    res.json(analyticsData);
  } catch (e) {
    console.error("Client analytics error:", e);
    res.status(500).json({ error: "Failed to fetch client analytics" });
  }
});

// 1. Create Article
app.post("/api/articles", async (req, res) => {
  try {
    const coachId = req.session.coachId || null;
    let isAdmin = false;

    // Admin check
    if (req.session.userId) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length > 0 && user[0].email === process.env.ADMIN_EMAIL) {
        isAdmin = true;
      }
    }

    if (!coachId && !isAdmin) {
      return res.status(403).json({ error: "Unauthorized. Must be a coach or admin." });
    }

    const { title, slug, description, content, category, imageUrl, status, keywords, indexPage, followLinks, tags, featured } = req.body;

    // Simple validation
    if (!title || !slug) return res.status(400).json({ error: "Title and Slug are required" });

    // Force pending for non-admins if they try to publish
    let finalStatus = status || 'draft';
    if (!isAdmin && finalStatus === 'published') {
      finalStatus = 'pending';
    }

    const publishedAt = finalStatus === 'published' ? new Date() : null;

    const [result] = await db.query(`
      INSERT INTO coach_articles (coach_id, title, slug, description, content, category, image_url, status, published_at, keywords, index_page, follow_links, tags, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      coachId, title, slug, description, content, category, imageUrl, finalStatus, publishedAt,
      keywords, indexPage ? 1 : 0, followLinks ? 1 : 0, tags, featured ? 1 : 0
    ]);

    res.json({ success: true, articleId: result.insertId, status: finalStatus });
  } catch (e) {
    console.error("Create article error:", e);
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Slug already exists" });
    res.status(500).json({ error: "Failed to create article" });
  }
});


/* ---------------- ONBOARDING COMPLETION ---------------- */
app.post("/api/user/complete-onboarding", async (req, res) => {
  if (!req.session || (!req.session.userId && !req.session.coachId)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userId = req.session.userId;
    const coachId = req.session.coachId;
    if (userId) {
      await db.query("UPDATE users SET onboarding_completed = 1 WHERE id = ?", [userId]);
    } else if (coachId) {
      await db.query("UPDATE coaches SET onboarding_completed = 1 WHERE id = ?", [coachId]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error completing onboarding:", err);
    res.status(500).json({ error: "Failed to update onboarding status" });
  }
});

// 2. Get Articles (Public)

// Admin: Get Pending Articles
app.get("/api/admin/articles/pending", async (req, res) => {
  try {
    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

    const [rows] = await db.query(`
       SELECT a.*, c.name as coach_name, c.email as coach_email
       FROM coach_articles a
       LEFT JOIN coaches c ON a.coach_id = c.id
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC
     `);
    res.json(rows);
  } catch (e) {
    console.error("Fetch pending articles error:", e);
    res.status(500).json({ error: "Failed to fetch pending articles" });
  }
});

// Admin: Update Article Status (Approve/Reject)
app.post("/api/admin/articles/:id/status", async (req, res) => {
  try {
    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

    const { id } = req.params;
    const { status } = req.body; // 'published' or 'draft' (rejected)

    if (!['published', 'draft', 'pending'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Set published_at if publishing
    const publishedAt = status === 'published' ? new Date() : null;

    // We only update published_at if it's being published. 
    // If it was already published, we might want to keep original date? 
    // For now, let's assume approval sets the publish date.

    let query = "UPDATE coach_articles SET status = ?";
    const params = [status];

    if (status === 'published') {
      query += ", published_at = NOW()";
    }

    query += " WHERE id = ?";
    params.push(id);

    await db.query(query, params);

    res.json({ success: true, message: `Article ${status}` });
  } catch (e) {
    console.error("Update article status error:", e);
    res.status(500).json({ error: "Failed to update article status" });
  }
});

// Admin: Get all articles
app.get("/api/admin/articles", async (req, res) => {
  try {
    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

    const [rows] = await db.query(`
      SELECT a.*, c.name as coach_name, c.email as coach_email, u.username as admin_name 
      FROM coach_articles a
      LEFT JOIN coaches c ON a.coach_id = c.id
      LEFT JOIN users u ON a.coach_id IS NULL AND u.email = ?
      ORDER BY a.created_at DESC
    `, [process.env.ADMIN_EMAIL]);
    res.json(rows);
  } catch (e) {
    console.error("Admin fetch articles error:", e);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

// Admin: Delete article
app.delete("/api/admin/articles/:id", async (req, res) => {
  try {
    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

    const { id } = req.params;
    await db.query("DELETE FROM coach_articles WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (e) {
    console.error("Admin delete article error:", e);
    res.status(500).json({ error: "Failed to delete article" });
  }
});
app.get("/api/articles", async (req, res) => {
  try {
    const { category, limit } = req.query;
    let query = `
      SELECT a.*, c.name as author_name, cd.profile_photo as author_photo 
      FROM coach_articles a
      LEFT JOIN coaches c ON a.coach_id = c.id
      LEFT JOIN coach_details cd ON c.id = cd.user_id
      WHERE a.status = 'published' AND (cd.status = 'approved' OR a.coach_id IS NULL)
    `;
    const params = [];

    if (category) {
      query += ` AND a.category = ?`;
      params.push(category);
    }

    query += ` ORDER BY a.published_at DESC`;

    if (limit) {
      query += ` LIMIT ?`;
      params.push(Number(limit));
    }

    const [articles] = await db.query(query, params);
    res.json(articles);
  } catch (e) {
    console.error("Get articles error:", e);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

/* ---------------- COACH REVIEWS API ---------------- */

// 1. Submit Review
app.post("/api/reviews", requireAuth, async (req, res) => {
  const { coachId, rating, comment } = req.body;
  if (!coachId || !rating) return res.status(400).json({ error: "Coach and Rating are required" });

  try {
    // Verify active connection
    const [conn] = await db.query(
      "SELECT id FROM user_coach_connections WHERE user_id = ? AND coach_id = ? AND status = 'active'",
      [req.userId, coachId]
    );
    if (conn.length === 0) return res.status(403).json({ error: "You can only review active coach connections" });

    // Check if user already reviewed this coach
    const [existing] = await db.query(
      "SELECT id FROM coach_reviews WHERE user_id = ? AND coach_id = ?",
      [req.userId, coachId]
    );

    if (existing.length > 0) {
      await db.query(
        "UPDATE coach_reviews SET rating = ?, comment = ? WHERE id = ?",
        [rating, comment, existing[0].id]
      );
    } else {
      await db.query(
        "INSERT INTO coach_reviews (user_id, coach_id, rating, comment) VALUES (?, ?, ?, ?)",
        [req.userId, coachId, rating, comment]
      );
    }

    res.json({ success: true, message: "Review submitted successfully" });
  } catch (e) {
    console.error("Submit review error:", e);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// 2. Get Public Reviews (for landing page)
app.get("/api/public/reviews", async (req, res) => {
  try {
    const [reviews] = await db.query(`
      SELECT r.rating, r.comment, r.created_at, u.username, c.name as coach_name, cd.coach_type
      FROM coach_reviews r
      JOIN users u ON r.user_id = u.id
      JOIN coaches c ON r.coach_id = c.id
      LEFT JOIN coach_details cd ON c.id = cd.user_id
      WHERE cd.status = 'approved'
      ORDER BY r.created_at DESC
      LIMIT 6
    `);
    res.json(reviews);
  } catch (e) {
    console.error("Get public reviews error:", e);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/* ---------------- MESSAGING API ---------------- */
app.get("/api/messages/:otherId", requireAnyAuth, async (req, res) => {
  try {
    const myId = req.session.userId || req.session.coachId;
    const myType = req.session.userType || (req.session.coachId ? 'coach' : 'user');
    const otherId = req.params.otherId;

    console.log(`[Messages] Fetching for ${myType} (id: ${myId}) with other: ${otherId}`);

    // Fetch messages where (sender=me AND receiver=other) OR (sender=other AND receiver=me)
    // We need to be careful with sender_type here if IDs can overlap between users and coaches.
    // In our DB, users and coaches are separate tables with potentially overlapping IDs.

    let query, params;
    if (myType === 'coach') {
      // I am coach, other is user
      query = `
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ? AND sender_type = 'coach')
           OR (sender_id = ? AND receiver_id = ? AND sender_type = 'user')
        ORDER BY created_at ASC
      `;
      params = [myId, otherId, otherId, myId];
    } else {
      // I am user, other is coach
      query = `
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ? AND sender_type = 'user')
           OR (sender_id = ? AND receiver_id = ? AND sender_type = 'coach')
        ORDER BY created_at ASC
      `;
      params = [myId, otherId, otherId, myId];
    }

    const [rows] = await db.query(query, params);

    // Mark received messages as read
    const receivedType = myType === 'coach' ? 'user' : 'coach';
    await db.query(
      "UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND sender_type = ? AND is_read = 0",
      [myId, otherId, receivedType]
    );

    // Add direction field to each message (server-authoritative)
    const messagesWithDirection = rows.map(msg => ({
      ...msg,
      direction: (msg.sender_id === myId && msg.sender_id && msg.sender_type === myType) ? 'sent' : 'received'
    }));

    console.log(`[Messages] Retrieved ${messagesWithDirection.length} messages for ${myType} ${myId}`);
    res.json(messagesWithDirection);
  } catch (e) {
    console.error("Fetch messages error:", e);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

/* ---------------- SOCKET.IO LOGIC ---------------- */
const socketToUser = new Map();

io.on("connection", (socket) => {
  console.log("New socket connection:", socket.id);

  socket.on("identify", async (data) => {
    const { userId, coachId, userType } = data;
    const rawId = userType === 'coach' ? coachId : userId;
    const id = Number(rawId);

    if (!id || isNaN(id)) {
      console.warn(`[Socket] Identification failed: Invalid ID "${rawId}" for type ${userType}`);
      return;
    }

    const room = `${userType}_${id}`;
    socket.join(room);
    socketToUser.set(socket.id, { id, userType, room });
    console.log(`[Socket] ${socket.id} identified as ${room}`);
    socket.emit("identified", { success: true, room });
  });

  socket.on("send_message", async (data) => {
    const sender = socketToUser.get(socket.id);
    if (!sender) {
      console.warn(`[Socket] Message from unidentified socket: ${socket.id}`);
      return;
    }

    const { receiverId, content } = data;
    const rId = Number(receiverId);
    const receiverType = sender.userType === 'coach' ? 'user' : 'coach';

    if (isNaN(rId)) {
      console.warn(`[Socket] Invalid receiverId: ${receiverId}`);
      return;
    }

    try {
      // 1. Validate connection
      const uId = sender.userType === 'user' ? sender.id : rId;
      const cId = sender.userType === 'coach' ? sender.id : rId;

      const [conn] = await db.query(
        "SELECT status FROM user_coach_connections WHERE user_id = ? AND coach_id = ? AND status = 'active'",
        [uId, cId]
      );

      if (conn.length === 0) {
        socket.emit("error", { message: "Messaging only allowed with active coaching connections." });
        return;
      }

      // 2. Save to DB
      const [result] = await db.query(
        "INSERT INTO messages (sender_id, receiver_id, sender_type, content) VALUES (?, ?, ?, ?)",
        [sender.id, rId, sender.userType, content]
      );

      const msg = {
        id: result.insertId,
        sender_id: sender.id,
        receiver_id: rId,
        sender_type: sender.userType,
        content,
        created_at: new Date()
      };

      // 3. Emit to receiver room
      const receiverRoom = `${receiverType}_${rId}`;
      const roomClients = io.sockets.adapter.rooms.get(receiverRoom);

      console.log(`[Socket] Message: ${sender.room} -> ${receiverRoom}. Clients in target: ${roomClients ? roomClients.size : 0}`);

      io.to(receiverRoom).emit("new_message", msg);
      socket.emit("message_sent", msg);

    } catch (e) {
      console.error("[Socket] Message logic error:", e);
      socket.emit("error", { message: "Internal messaging error." });
    }
  });

  socket.on("disconnect", () => {
    socketToUser.delete(socket.id);
  });
});

// Migration: Add is_deleted to notifications
async function migrateNotificationSchema() {
  try {
    const columns = [
      "ADD COLUMN is_deleted BOOLEAN DEFAULT 0"
    ];
    for (const col of columns) {
      try {
        await db.query(`ALTER TABLE notifications ${col}`);
      } catch (e) {
        if (e.errno !== 1060 && e.code !== 'ER_DUP_FIELDNAME') console.log("Notification migration notice:", e.message);
      }
    }
  } catch (e) {
    console.error("Migration error:", e);
  }
}
migrateNotificationSchema();

async function notifyStudentUpdate(studentId, type) {
  try {
    const [coaches] = await db.query(
      "SELECT coach_id FROM user_coach_connections WHERE user_id = ? AND status = 'active'",
      [studentId]
    );
    coaches.forEach(c => {
      io.to(`coach_${c.coach_id}`).emit('student_update', { studentId, type });
    });
  } catch (e) {
    console.error("Socket notification error:", e);
  }
}
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));

// Coach: Get specific student analytics
app.get("/api/coach/student-analytics/:studentId", requireAnyAuth, async (req, res) => {
  try {
    const coachId = req.session.coachId || req.session.userId;
    const studentId = req.params.studentId;

    if (!coachId) return res.status(401).json({ error: "Unauthorized" });

    // Verify connection exists
    const [conn] = await db.query(
      "SELECT status FROM user_coach_connections WHERE user_id = ? AND coach_id = ? AND status = 'active'",
      [studentId, coachId]
    );

    if (conn.length === 0) {
      return res.status(403).json({ error: "No active coaching connection with this student" });
    }

    // 1. Fetch Student Goals
    const [goals] = await db.query(
      "SELECT text, category, total, spent, done, created_at FROM goals WHERE user_id = ? ORDER BY created_at DESC",
      [studentId]
    );

    // 2. Fetch Recent Tasks (Last 5)
    const [recentTasks] = await db.query(
      "SELECT text, priority, done, completed_at, created_at FROM todos WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
      [studentId]
    );

    // 3. Simple Stats
    const [todoStats] = await db.query(
      "SELECT COUNT(*) as total, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as completed FROM todos WHERE user_id = ?",
      [studentId]
    );

    res.json({
      goals: goals,
      recentTasks: recentTasks,
      stats: {
        totalTasks: todoStats[0].total,
        completedTasks: todoStats[0].completed
      }
    });

  } catch (e) {
    console.error("Coach analytics error:", e);
    res.status(500).json({ error: "Failed to fetch student analytics" });
  }
});

/* ---------------- ADMIN COACH MANAGEMENT ---------------- */

// Admin: Get all coaches
app.get("/api/admin/coaches", async (req, res) => {
  try {
    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

    const [rows] = await db.query(`
      SELECT c.*, cd.status, cd.coach_type, cd.hours_coached, cd.profile_photo
      FROM coaches c
      LEFT JOIN coach_details cd ON c.id = cd.user_id
      WHERE (cd.status IS NULL OR cd.status NOT IN ('blocked', 'banned'))
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error("Fetch coaches error:", e);
    res.status(500).json({ error: "Failed to fetch coaches" });
  }
});

// Admin: Update Coach Status
app.post("/api/admin/coaches/:id/status", async (req, res) => {
  try {
    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'approved', 'rejected', 'blocked', 'banned'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // 1. Get coach email to sync with users table
    const [coachRows] = await db.query("SELECT name, email FROM coaches WHERE id = ?", [id]);
    if (coachRows.length > 0) {
      const { email, name } = coachRows[0];

      // 2. Update/Insert coach_details
      const [details] = await db.query("SELECT id FROM coach_details WHERE user_id = ?", [id]);
      if (details.length > 0) {
        await db.query("UPDATE coach_details SET status = ? WHERE user_id = ?", [status, id]);
      } else {
        // Create record if doesn't exist (e.g. blocking before onboarding)
        await db.query(
          "INSERT INTO coach_details (user_id, name, email, status, dob, coach_type) VALUES (?, ?, ?, ?, CURDATE(), 'Expert')",
          [id, name, email, status]
        );
      }

      // 3. Sync with users table if they exist there too (multi-role or legacy)
      const userStatus = status === 'blocked' || status === 'banned' ? 'banned' : 'active';
      await db.query("UPDATE users SET status = ? WHERE email = ?", [userStatus, email]);
    }

    res.json({ success: true, message: `Coach ${status}` });
  } catch (e) {
    console.error("Update coach status error:", e);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Restore the verification route to avoid 404s in the dashboard
app.post("/api/admin/verifications/coaches/:id/status", async (req, res) => {
  try {
    // Admin Authorization Check
    let isAdmin = req.session.userId === 'admin';
    if (!isAdmin) {
      const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
      if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'blocked', 'banned'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Reuse the same logic
    const [coachRows] = await db.query("SELECT name, email FROM coaches WHERE id = ?", [id]);
    if (coachRows.length > 0) {
      const { email, name } = coachRows[0];
      const [details] = await db.query("SELECT id FROM coach_details WHERE user_id = ?", [id]);
      if (details.length > 0) {
        await db.query("UPDATE coach_details SET status = ? WHERE user_id = ?", [status, id]);
      } else {
        await db.query(
          "INSERT INTO coach_details (user_id, name, email, status, dob, coach_type) VALUES (?, ?, ?, ?, CURDATE(), 'Expert')",
          [id, name, email, status]
        );
      }
      const userStatus = status === 'blocked' || status === 'banned' ? 'banned' : 'active';
      await db.query("UPDATE users SET status = ? WHERE email = ?", [userStatus, email]);
    }

    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (e) {
    console.error("Verification status error:", e);
    res.status(500).json({ error: "Failed to update status" });
  }
});

/* ---------------- COACH CATEGORIES ---------------- */
app.get("/api/admin/coach-categories", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM coach_categories ORDER BY name ASC");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/coach-categories", async (req, res) => {
  // Admin Authorization Check
  let isAdmin = req.session.userId === 'admin';
  if (!isAdmin) {
    const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
    if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
  }

  if (!isAdmin) return res.status(403).json({ error: "Admin access only" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  try {
    const [result] = await db.query("INSERT INTO coach_categories (name, slug) VALUES (?, ?)", [name, slug]);
    res.json({ success: true, id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Category already exists" });
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/coach-categories/:id", async (req, res) => {
  // Admin Authorization Check
  let isAdmin = req.session.userId === 'admin';
  if (!isAdmin) {
    const [user] = await db.query("SELECT email FROM users WHERE id = ?", [req.session.userId]);
    if (user.length && user[0].email === process.env.ADMIN_EMAIL) isAdmin = true;
  }

  if (!isAdmin) return res.status(403).json({ error: "Admin access only" });

  try {
    await db.query("DELETE FROM coach_categories WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
