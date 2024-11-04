const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');

router.use('/', routeController);

module.exports = router;
