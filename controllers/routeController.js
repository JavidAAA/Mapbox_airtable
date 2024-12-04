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

    // Validate input: schoolName and address must be present
    if (!airtableData.schoolName || typeof airtableData.schoolName !== 'string' || airtableData.schoolName.trim() === "") {
        res.status(400).send('Error: schoolName is required and cannot be empty.');
        return;
    }
    if (!airtableData.address || typeof airtableData.address !== 'string' || airtableData.address.trim() === "") {
        res.status(400).send('Error: address is required and cannot be empty.');
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
        logger.error(`Error during geocoding for ${airtableData.schoolName}`);
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
