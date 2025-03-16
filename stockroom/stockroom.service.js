const db = require('_helpers/db-handler');

module.exports = {
    getStockroomDetails
};

async function getStockroomDetails() {
    const stockrooms = await db.Stockroom.findAll({
        include: [{
            model: db.Apparel,
            attributes: ['name', 'size', 'color', 'description']
        }]
    });

    // Compute and attach stockStatus based on quantity for each record.
    stockrooms.forEach(stockroom => {
        // If the quantity is below 10, set status to 'low', otherwise 'high'
        stockroom.dataValues.stockStatus = stockroom.quantity < 10 ? 'low' : 'high';
    });

    return stockrooms;
}