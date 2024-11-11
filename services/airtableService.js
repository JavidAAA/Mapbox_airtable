const logger = require('../utils/logger');
const airtable = require('airtable');
const base = new airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE);

// Airtable mappings
const schoolsTable = process.env.AIRTABLE_SCHOOLS_TABLE;
const activeView = process.env.AIRTABLE_ACTIVE_VIEW;

async function fetchSchools() {
    const schools = [];
    
    return new Promise((resolve, reject) => {
        base(schoolsTable).select({
            view: activeView
        }).eachPage(
            function page(records, fetchNextPage) {
                for (const record of records) {
                    const name = record.get('Name');
                    const latitude = record.get('Latitude');
                    const longitude = record.get('Longitude');

                    if (name !== undefined && latitude !== undefined && longitude !== undefined) {
                        schools.push({ name, latitude, longitude });
                    } else {
                        logger.error(`Either name, latitude, or longitude is undefined for ${record}`);
                    }
                }
                // Fetch the next page of records
                fetchNextPage();
            },
            function done(err) {
                if (err) {
                    logger.error(err);
                    reject(err);
                } else {
                    resolve(schools); // Resolve the promise with the collected schools data
                }
            }
        );
    });
}

module.exports = {
    fetchSchools
};