const db = require('../config/db');

exports.getUserAnalytics = async (req, res) => {
    try {
        const userId = req.userId;

        // 1. Tasks Completed Total
        const [tasksCompleted] = await db.query(
            "SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND done = 1",
            [userId]
        );

        // 2. Goal Progress (Average % of spent/total)
        const [goals] = await db.query(
            "SELECT category, total, spent FROM goals WHERE user_id = ?",
            [userId]
        );

        let goalsInProgress = 0;
        let totalProgress = 0;
        goals.forEach(g => {
            if (g.total > 0) {
                let p = (g.spent / g.total) * 100;
                if (p > 100) p = 100;
                totalProgress += p;
                if (p < 100) goalsInProgress++;
            }
        });

        // 3. Login Streak
        const [activity] = await db.query(
            "SELECT DISTINCT DATE(created_at) as login_date FROM login_activity WHERE user_id = ? AND success = 1 ORDER BY login_date DESC",
            [userId]
        );
        let streak = 0;
        if (activity.length > 0) {
            let current = new Date();
            current.setHours(0, 0, 0, 0);

            const lastLogin = new Date(activity[0].login_date);
            lastLogin.setHours(0, 0, 0, 0);

            const diffTime = Math.abs(current - lastLogin);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 1) {
                streak = 1;
                for (let i = 0; i < activity.length - 1; i++) {
                    const d1 = new Date(activity[i].login_date);
                    const d2 = new Date(activity[i + 1].login_date);
                    const diff = (d1 - d2) / (1000 * 60 * 60 * 24);
                    if (Math.round(diff) === 1) {
                        streak++;
                    } else {
                        break;
                    }
                }
            }
        }

        // 4. Productivity Score
        const [allTodos] = await db.query("SELECT COUNT(*) as count FROM todos WHERE user_id = ?", [userId]);
        const totalTodos = allTodos[0].count;
        const completedCount = tasksCompleted[0].count;
        let productivity = 0;
        if (totalTodos > 0) {
            productivity = Math.round((completedCount / totalTodos) * 100);
        }

        // 5. Chart Data
        const [chartRows] = await db.query(`
      SELECT DAYOFWEEK(completed_at) as dayNum, COUNT(*) as count 
      FROM todos 
      WHERE user_id = ? 
      AND done = 1 
      GROUP BY dayNum
    `, [userId]);

        res.json({
            tasksCompleted: completedCount,
            goalsInProgress: goalsInProgress,
            productivityScore: productivity,
            streak: streak,
            goals: goals,
            chartData: chartRows
        });

    } catch (e) {
        console.error("Analytics Error:", e);
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
};
