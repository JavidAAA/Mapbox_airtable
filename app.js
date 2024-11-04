require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const routes = require('./routes');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use('/', routes);

app.listen(process.env.APP_PORT, () => {
    logger.info(`Server running on port ${process.env.APP_PORT}.`);
});
