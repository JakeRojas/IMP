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

    // Time ranges
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30); monthStart.setHours(0, 0, 0, 0);
    const onlineThreshold = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago

    // Helper for counts
    const count = async (model, from) => model.count({ where: { createdAt: { [Op.gte]: from } } });

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
                timestamp: { [Op.gte]: onlineThreshold }
            }
        })
    };

    // Last Week Counts (Last 7 Days)
    const lastWeek = {
        stockRequests: await count(db.StockRequest, weekStart),
        itemRequests: await count(db.ItemRequest, weekStart),
        transfers: await count(db.Transfer, weekStart),
        borrows: await count(db.Borrow, weekStart)
    };

    // Last Month Counts (Last 30 Days)
    const lastMonth = {
        stockRequests: await count(db.StockRequest, monthStart),
        itemRequests: await count(db.ItemRequest, monthStart),
        transfers: await count(db.Transfer, monthStart),
        borrows: await count(db.Borrow, monthStart)
    };

    // Online Users (Realtime list)
    const onlineUserIds = await db.ActivityLog.findAll({
        attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('accountId')), 'accountId']],
        where: { timestamp: { [Op.gte]: onlineThreshold } },
        raw: true
    });

    let onlineUsersList = [];
    if (onlineUserIds.length > 0) {
        onlineUsersList = await db.Account.findAll({
            where: { accountId: { [Op.in]: onlineUserIds.map(x => x.accountId) } },
            attributes: ['firstName', 'lastName', 'email', 'role', 'title']
        });
    }

    // Breakdowns - "Consider existing requests" -> ALL TIME counts

    // Stock by Department (itemType)
    const stockByDept = await db.StockRequest.findAll({
        attributes: ['itemType', [db.sequelize.literal('COUNT(*)'), 'count']],
        group: ['itemType'],
        raw: true
    });

    // Item Request by Department (itemType)
    const itemByDept = await db.ItemRequest.findAll({
        attributes: ['itemType', [db.sequelize.literal('COUNT(*)'), 'count']],
        group: ['itemType'],
        raw: true
    });

    // Borrow by User - All Time
    const borrowByUser = await db.Borrow.findAll({
        attributes: [
            'requesterId',
            [db.sequelize.literal('COUNT(*)'), 'count']
        ],
        include: [{ model: db.Account, as: 'requester', attributes: ['firstName', 'lastName', 'email'] }],
        group: ['requesterId', 'requester.accountId']
    });

    // Get weekly stats (grouped by day)
    const weeklyData = await getWeeklyAggregates(weekStart);

    return {
        daily: { ...daily, onlineUsers: onlineUsersList.length },
        lastWeek,
        lastMonth,
        online: onlineUsersList,
        breakdowns: {
            stock: stockByDept || [],
            item: itemByDept || [],
            borrow: borrowByUser || []
        },
        weekly: weeklyData
    };
}

async function getWeeklyAggregates(startDate) {
    const results = {
        labels: [],
        stockRequests: [],
        itemRequests: [],
        transfers: [],
        borrows: []
    };

    // Generate 7 days (0 to 6)
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);

        const dStr = d.toISOString().split('T')[0];
        results.labels.push(dStr);

        const dStart = new Date(d);
        dStart.setHours(0, 0, 0, 0);
        const dEnd = new Date(d);
        dEnd.setHours(23, 59, 59, 999);

        // Use try-catch for robustness against missing 'createdAt' columns in old schemas
        try {
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
        } catch (e) {
            console.error('Stats aggregation error (likely missing timestamps):', e.message);
            results.stockRequests.push(0);
            results.itemRequests.push(0);
            results.transfers.push(0);
            results.borrows.push(0);
        }
    }
    return results;
}
