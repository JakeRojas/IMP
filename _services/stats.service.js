const { Op } = require('sequelize');
const db = require('_helpers/db-handler');

module.exports = {
    getDashboardStats
};

async function getDashboardStats() {
    const now = new Date();

    // Start of today
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const endOfToday = new Date(now.setHours(23, 59, 59, 999));

    // Start of 7 days ago
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 6);
    last7Days.setHours(0, 0, 0, 0);

    // Get daily stats for today
    const daily = {
        stockRequests: await db.StockRequest.count({ where: { createdAt: { [Op.between]: [startOfToday, endOfToday] } } }),
        itemRequests: await db.ItemRequest.count({ where: { createdAt: { [Op.between]: [startOfToday, endOfToday] } } }),
        transfers: await db.Transfer.count({ where: { createdAt: { [Op.between]: [startOfToday, endOfToday] } } }),
        borrows: await db.Borrow.count({ where: { createdAt: { [Op.between]: [startOfToday, endOfToday] } } }),
        onlineUsers: await db.ActivityLog.count({
            distinct: true,
            col: 'accountId',
            where: {
                timestamp: { [Op.between]: [startOfToday, endOfToday] }
            }
        })
    };

    // Get weekly stats (grouped by day)
    const weeklyData = await getWeeklyAggregates(last7Days);

    return {
        daily,
        weekly: weeklyData
    };
}

async function getWeeklyAggregates(startDate) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
    }

    const results = {
        labels: days,
        stockRequests: [],
        itemRequests: [],
        transfers: [],
        borrows: []
    };

    for (const day of days) {
        const dStart = new Date(day);
        dStart.setHours(0, 0, 0, 0);
        const dEnd = new Date(day);
        dEnd.setHours(23, 59, 59, 999);

        const counts = await Promise.all([
            db.StockRequest.count({ where: { createdAt: { [Op.between]: [dStart, dEnd] } } }),
            db.ItemRequest.count({ where: { createdAt: { [Op.between]: [dStart, dEnd] } } }),
            db.Transfer.count({ where: { createdAt: { [Op.between]: [dStart, dEnd] } } }),
            db.Borrow.count({ where: { createdAt: { [Op.between]: [dStart, dEnd] } } })
        ]);

        results.stockRequests.push(counts[0]);
        results.itemRequests.push(counts[1]);
        results.transfers.push(counts[2]);
        results.borrows.push(counts[3]);
    }

    return results;
}
