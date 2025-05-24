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
    stockrooms.forEach(stockroom => {
        stockroom.dataValues.stockStatus = stockroom.quantity < 10 ? 'low' : 'high';
    });

    return stockrooms;
}