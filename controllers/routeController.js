const express = require('express');
const router = express.Router();
const { getCoordinates, updateMap } = require('../services/mapboxService');
const { fetchSchools } = require('../services/airtableService');
const logger = require('../utils/logger');

/*
Geoencode an address and return the coordinates.
*/
router.post('/geocode', async (req, res) => {
    const airtableData = req.body;

    if (!airtableData.schoolName) {
        res.send('schoolName is required');
        return;
    }

    logger.debug(`Geocode endpoint called for ${airtableData.schoolName}`);

    const options = {
        autocomplete: false, // Don't return autocomplete results - assume the user has entered the full address
        country: 'US',
        language: 'en',
        bbox: '-71.20445,42.98646,-66.84923,47.53167', // Bounding box for Maine - don't get places outside
    };
    let geoCoordinates = await getCoordinates(airtableData.address, options);
    if (geoCoordinates) {
        logger.info(`Coordinates for ${airtableData.schoolName}: ${JSON.stringify(geoCoordinates)}`);
        res.send(geoCoordinates);
    } else {
        res.status(500).send(`Error fetching coordinates for ${airtableData.schoolName}`);
    }
});

router.get('/update', async (req, res) => {
    res.status(200).send('Update process initialized (does not mean it is complete). Check logs for more information.');
    logger.debug(`Update endpoint called`);
    const schools = await fetchSchools(); // Format: [{ name, latitude, longitude }, ...]
    await updateMap(schools);
});

module.exports = router;
