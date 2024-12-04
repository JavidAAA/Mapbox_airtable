const express = require('express');
const router = express.Router();
const { getCoordinates, updateMap } = require('../services/mapboxService');
const { fetchSchools } = require('../services/airtableService');
const logger = require('../utils/logger');

/*
Geoencode an address and return the coordinates.
*/
router.post('/geocode', async (req, res) => {
    logger.debug(`Raw request body: ${JSON.stringify(req.body)}`);
    const airtableData = req.body;
    // Sanitize and validate fields
    const schoolName = airtableData.schoolName && airtableData.schoolName.trim();
    const address = airtableData.address && airtableData.address.trim();

    if (!schoolName || schoolName.toLowerCase() === 'null') {
        logger.debug(`schoolName failed`)
        res.status(400).json({
            error: 'InvalidInput',
            message: 'schoolName is required and cannot be empty or "null".',
        });
        return;
    }

    if (!address || address === ', ,') {
        logger.debug(`address failed`)
        res.status(400).json({
            error: 'InvalidInput',
            message: 'address is required and cannot be empty or invalid.',
        });
        return;
    }

    logger.debug(`Geocode endpoint called for ${airtableData.schoolName}`);

    const options = {
        autocomplete: false, // Don't return autocomplete results - assume the user has entered the full address
        country: 'US',
        language: 'en',
        bbox: '-71.20445,42.98646,-66.84923,47.53167', // Bounding box for Maine - don't get places outside
    };

    try {
        let geoCoordinates = await getCoordinates(airtableData.address, options);

        if (geoCoordinates) {
            logger.info(`Coordinates for ${airtableData.schoolName}: ${JSON.stringify(geoCoordinates)}`);
            res.send(geoCoordinates); // Always send JSON
        } else {
            logger.error(`Error during geocoding for ${airtableData.schoolName}`);
            res.status(500).json({
                error: 'GeocodingError',
                message: `Unable to fetch coordinates for ${airtableData.schoolName}.`,
            });
        }
    } catch (error) {
        logger.error(`Unhandled error during geocoding: ${error.message}`);
        res.status(500).json({
            error: 'ServerError',
            message: 'An unexpected error occurred during geocoding. Please try again later.',
        });
    }
});

router.get('/update', async (req, res) => {
    res.status(200).send('Update process initialized (does not mean it is complete). Check logs for more information.');
    logger.debug(`Update endpoint called`);
    const schools = await fetchSchools(); // Format: [{ name, latitude, longitude }, ...]
    await updateMap(schools);
});

module.exports = router;
