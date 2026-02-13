const mysql = require('mysql2/promise');
require('dotenv').config();

async function diagnostic() {
    const db = await mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        console.log("--- Diagnostic Start ---");

        const [nowRes] = await db.query("SELECT NOW() as db_now, UTC_TIMESTAMP() as utc_now");
        console.log("DB NOW:", nowRes[0].db_now);
        console.log("DB UTC NOW:", nowRes[0].utc_now);
        console.log("System Time (JS):", new Date().toLocaleString());

        const [reminders] = await db.query("SELECT id, user_id, title, when_time, done FROM reminders WHERE done = 0 LIMIT 10");
        console.log("\n--- Pending Reminders (Next 10) ---");
        console.table(reminders);

        const [subs] = await db.query("SELECT user_id, COUNT(*) as count FROM push_subscriptions GROUP BY user_id");
        console.log("\n--- Push Subscriptions ---");
        console.table(subs);

        const [notifs] = await db.query("SELECT id, user_id, reminder_id, created_at FROM notifications ORDER BY created_at DESC LIMIT 5");
        console.log("\n--- Recent Notifications ---");
        console.table(notifs);

        console.log("\n--- Diagnostic End ---");
    } catch (err) {
        console.error("Diagnostic failed:", err);
    } finally {
        await db.end();
    }
}

diagnostic();
