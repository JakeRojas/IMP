const db = require('_helpers/db-handler');

module.exports = {
    getApparel,
    getApparelById,
    createApparel,
    updateApparel,
    monitorInventory,
    reorderDecision,

    scanItem,
    markLostInRoom
};

async function getApparel() {
    return await db.Apparel.findAll({
        where: { 
            apparelStatus: 'available' 
        }
    });
}
async function getApparelById(id) {
    const apparel = await db.Apparel.findByPk(id);
    if (!apparel) {
        throw new Error('Invalid apparel ID');
    }
    return apparel;
}
async function createApparel(params) {
    let apparel = await db.Apparel.findOne({ where: { name: params.name, type: params.type, part: params.part } });
    
    if (apparel) {
        // Apparel exists – do not automatically update stockroom.
        return { 
            message: 'Apparel already exists. Please use the update function to adjust quantity if needed.', 
            apparel 
        };
    } else {
        // Create a new apparel record.
        apparel = await db.Apparel.create({
            type: params.type,
            part: params.part,
            sex: params.sex,
            name: params.name,
            size: params.size,
            color: params.color,
            quantity: params.quantity,
            description: params.description,
            apparelStatus: 'available'
        });
        // Automatically store in stockroom with computed stockStatus.
        const quantity = params.quantity || 0;
        const stockStatus = quantity < 10 ? 'low' : 'high';
        await db.Stockroom.create({
            apparelId: apparel.id,
            quantity: quantity,
            stockStatus: stockStatus
        });
        return { 
            message: 'New apparel created and stored in stockroom.', 
            apparel 
        };
    }
}
// If a new quantity is provided, the stockStatus is computed based on the quantity.
async function updateApparel(id, params) {
    const apparel = await getApparelById(id);
    if (!apparel) throw new Error('Apparel not found');

    // Update apparel details.
    Object.assign(apparel, params);
    await apparel.save();

    // If quantity is provided, update the stockroom record.
    if (params.quantity !== undefined) {
        const newQuantity = params.quantity;
        const stockStatus = newQuantity < 10 ? 'low' : 'high';
        let stockroom = await db.Stockroom.findOne({ where: { apparelId: apparel.id } });
        if (stockroom) {
            stockroom.quantity = newQuantity;
            stockroom.stockStatus = stockStatus;
            await stockroom.save();
        } else {
            await db.Stockroom.create({
                apparelId: apparel.id,
                quantity: newQuantity,
                stockStatus: stockStatus
            });
        }
    }
    return apparel;
}
async function monitorInventory() {
    return await db.Stockroom.findAll({
        include: [{ model: db.Apparel, attributes: ['name', 'size', 'color'] }]
    });
}
async function reorderDecision(apparelId, threshold) {
    let stockroom = await db.Stockroom.findOne({ where: { apparelId } });
    if (!stockroom) {
        throw new Error('Stock record not found for this apparel');
    }
    if (stockroom.quantity < threshold) {
        return { reorder: true, message: 'Stock below threshold, reorder needed.' };
    }
    return { reorder: false, message: 'Stock level adequate.' };
}
async function scanItem(qrCode) {
    const item = await db.Apparel.findOne({ where: { qrCode } });
        if (!item) throw new Error('Item not found');
        item.status = 'active';
        await item.save();
    return item;
}
async function markLostInRoom(roomId, scannedIds) {
    await db.Apparel.update(
        { status: 'lost' },
        {
            where: {
                roomId,
                id: { [Op.notIn]: scannedIds }
            }
        }
    );
}

