// const db = require('_helpers/db-handler');

// module.exports = {
//     getApparel,
//     getApparelById,
//     createApparel,
//     updateApparel,
//     // deactivate,
//     // reactivate
// };
  
// async function getApparel(userRole) {
//     // Check if user is Admin or Manager to show all apparel
//     // if (userRole === 'Admin' || userRole === 'Staff') {
//     //     return await db.Apparel.findAll();
//     // }
    
//     // For regular users, only show active apparel
//     return await db.Apparel.findAll({
//         where: { 
//             apparelStatus: 'active' 
//         }
//     });
// }
// async function getApparelById(id) {
//     const apparel = await db.Apparel.findByPk(id);

//     // Check if the apparel exists
//     if (!apparel) {
//         throw new Error('Invalid apparel ID');
//     }
//     return apparel;
// }
// async function createApparel(params) {
//     let apparel = await db.Apparel.findOne({ where: { name: params.name } });

//     if (apparel) {
//         // await checkIfActive(apparel);
//         // apparel exists, update the inventory quantity
//         const stockroom = await db.Stockroom.findOne({ where: { apparelId: apparel.id } });
//         //const warehouse = await db.Warehouse.findOne({ where: { apparelId: apparel.id } });
        
//         if (stockroom) {
//             stockroom.quantity += params.quantity || 0; // Increase the quantity by the given value or by 1 if not specified
//             await stockroom.save();
//         } //else {
//         //     // If no stock exists for the apparel, create it (this should generally not happen if managed correctly)
//         //     await db.Stockroom.createApparel({
//         //         apparelId: apparel.id,
//         //         quantity: params.quantity || 0 
//         //     });
//         // }

//         return { message: 'Apparel already exists, inventory updated', apparel };

//     } else {
//         // Apparel doesn't exist, create a new apparel
//         apparel = await db.Apparel.create({
//             name: params.name,
//             size: params.size,
//             color: params.color,
//             description: params.description,
//             apparelStatus: 'available'
//         });

//         // Create stock for the new apparel
//         await db.Stockroom.create({
//             apparelId: apparel.id,
//             quantity: params.quantity || 0
//         });

//         return { message: 'New apparel created', apparel };
//     }
// }
// async function updateApparel(id, params) {
//     const apparel = await getApparelById(id);
//     if (!apparel) throw 'Apparel not found';
    
//     Object.assign(apparel, params);
//     return await apparel.save();
// }




// //------------------------- Deactivate apparel -------------------------
// // async function deactivate(id) {
// //     const apparel = await getapparelById(id);
// //     if (!apparel) throw 'apparel not found';

// //     // Check if the apparel is already deactivated
// //     if (apparel.apparelStatus === 'deactivated') throw 'apparel is already deactivated';

// //     // Find the inventory for this apparel
// //     const inventory = await db.Inventory.findOne({ where: { apparelId: id } });
    
// //     // Check if inventory quantity is zero before deactivating
// //     if (inventory && inventory.quantity > 0) {
// //         throw 'Cannot deactivate apparel with remaining inventory';
// //     }

// //     // Set status to 'deactivated' and save
// //     apparel.apparelStatus = 'deactivated';
// //     await apparel.save();
// // }

// // async function reactivate(id) {
// //     const apparel = await getapparelById(id);
// //     if (!apparel) throw 'apparel not found';

// //     // Check if the apparel is already active
// //     if (apparel.apparelStatus === 'active') throw 'apparel is already active';

// //     // Set status to 'active' and save
// //     apparel.apparelStatus = 'active';
// //     await apparel.save();
// // }
// // // Helper function to check if the apparel is active
// // async function checkIfActive(apparel) {
// //     if (apparel.apparelStatus === 'deactivated') {
// //         throw new Error('apparel is deactivated');
// //     }
// // }





const db = require('_helpers/db-handler');

module.exports = {
    getApparel,
    getApparelById,
    createApparel,
    updateApparel,
    monitorInventory,
    reorderDecision,
};

// Retrieve all active apparel
async function getApparel() {
    return await db.Apparel.findAll({
        where: { 
            apparelStatus: 'available' 
        }
    });
}

// Retrieve apparel by its ID
async function getApparelById(id) {
    const apparel = await db.Apparel.findByPk(id);
    if (!apparel) {
        throw new Error('Invalid apparel ID');
    }
    return apparel;
}

// Create new apparel or update existing apparel's stock
// Represents Procurement/Order Placement + Receiving & Registration steps
// async function createApparel(params) {
//     const apparel = new db.Apparel(params);

//     // if (await db.Apparel.findOne({ where: { name: params.name } })) {
//     //     throw 'name "' + params.name + '" is already registered';
//     // }

//     await apparel.save();
// }

// // Update apparel details
// async function updateApparel(id, params) {
//     const apparel = await getApparelById(id);
//     if (!apparel) throw new Error('Apparel not found');

//     Object.assign(apparel, params);
//     return await apparel.save();
// }
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

// Update apparel and also update the corresponding stockroom record.
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

// Monitor inventory (Inventory Monitoring & Reporting step)
async function monitorInventory() {
    return await db.Stockroom.findAll({
        include: [{ model: db.Apparel, attributes: ['name', 'size', 'color'] }]
    });
}

// Check if the stock level is below a threshold (Reorder Decision step)
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
