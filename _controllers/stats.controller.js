const express = require('express');
const router = express.Router();
const statsService = require('../_services/stats.service');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

// routes
router.get('/dashboard', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getDashboardStats);

module.exports = router;

function getDashboardStats(req, res, next) {
    statsService.getDashboardStats()
        .then(stats => res.json(stats))
        .catch(next);
}
