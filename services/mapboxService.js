const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const logger = require('../utils/logger');
const axios = require('axios');

const MAPBOX_CONFIG = {
    username: process.env.MAPBOX_USERNAME,
    accessToken: process.env.MAPBOX_ACCESS_TOKEN,
    tilesetSourceId: process.env.MAPBOX_TILESET_SOURCE_ID,
    tilesetId: process.env.MAPBOX_TILESET_ID,
    styleId: process.env.MAPBOX_STYLE_ID,
    mapName: process.env.MAPBOX_MAP_NAME,
};

// Instructions on how to create the tileset
function createTilesetRecipe(sourceId) {
    return {
        version: 1,
        layers: {
            schools: {
                source: sourceId, // 'mapbox://tileset-source/{username}/{tileset_id}',
                minzoom: 4,
                maxzoom: 11,
            },
        },
    };
}

// Validate a recipe object
async function validateRecipe(recipe) {
    logger.debug('Validating recipe');
    const url = `https://api.mapbox.com/tilesets/v1/validateRecipe?access_token=${MAPBOX_CONFIG.accessToken}`;
    const headers = {
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.post(url, recipe, { headers });
        if (!response.data.valid) {
            logger.error(`Invalid recipe: ${JSON.stringify(response.data)}`);
        }
        return response;
    } catch (error) {
        logger.error(`Error validating recipe: ${error.message}`);
        throw error;
    }
}

/*
Use the Mapbox Geocoding API to fetch coordinates for a given string.

Takes two arguments:
- searchText: The address of the school
- options: An object containing optional parameters to customize the query

Returns an object with the latitude and longitude of the address.
*/
async function getCoordinates(searchText, options = {}) {
    logger.debug(`Fetching coordinates for ${searchText}`);
    if (options) {
        logger.debug(`Options: ${JSON.stringify(options)}`);
    }
    const encodedText = encodeURIComponent(searchText);

    // Base URL with required parameters
    let url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodedText}&access_token=${MAPBOX_CONFIG.accessToken}`;

    // Append optional parameters to the URL

    if (options.permanent !== undefined) url += `&permanent=${options.permanent}`;
    // Specify whether you intend to store the results of the query (true) or not (false, default).

    if (options.autocomplete !== undefined) url += `&autocomplete=${options.autocomplete}`;
    // Specify whether to return autocomplete results (true, default) or not (false). When autocomplete is enabled, results will be included that start with the requested string

    if (options.bbox) url += `&bbox=${options.bbox}`;
    // Limit results to only those contained within the supplied bounding box. Bounding boxes should be supplied as four numbers separated by commas, in minLon,minLat,maxLon,maxLat order.

    if (options.country) url += `&country=${options.country}`;
    // Limit results to one or more countries. Permitted values are ISO 3166 alpha 2 country codes separated by commas

    if (options.format) url += `&format=${options.format}`;
    // Specify the desired response format of results (geojson, default) or for backwards compatibility (v5).

    if (options.language) url += `&language=${options.language}`;
    // Set the language of the text supplied in responses. Also affects result scoring, with results matching the user’s query in the requested language being preferred over results that match in another language

    if (options.limit) url += `&limit=${options.limit}`;
    // Specify the maximum number of results to return. The default is 5 and the maximum supported is 10.

    if (options.proximity) url += `&proximity=${options.proximity}`;
    // Bias the response to favor results that are closer to this location. Provided as two comma-separated coordinates in longitude,latitude order, or the string ip to bias based on reverse IP lookup.

    if (options.types) url += `&types=${options.types}`;
    // Filter results to include only a subset (one or more) of the available feature types. Options are country, region, postcode, district, place, locality, neighborhood, street, and address. Multiple options can be comma-separated.

    if (options.worldview) url += `&worldview=${options.worldview}`;
    // Returns features that are defined differently by audiences that belong to various regional, cultural, or political groups.

    try {
        const response = await axios.get(url);

        const features = response.data.features;
        if (features && features.length > 0) {
            const { coordinates } = features[0].geometry; // Extract coordinates from the first feature, which is the most relevant
            return { latitude: coordinates[1], longitude: coordinates[0] };
        } else {
            logger.error(`No coordinates found for ${searchText}`);
        }
    } catch (error) {
        logger.error(`Error fetching coordinates for ${searchText}: ${error}`);
        throw error;
    }
}

/*
Create GeoJSON features from school data.

Input:
- data: An array of school objects, each containing a name, latitude, and longitude

Returns:
- An array of GeoJSON features.

Mapbox requires unique IDs for each feature. I used the index of each feature 
in the array as the ID.
https://docs.mapbox.com/mapbox-tiling-service/recipe-specification/vector/#id-expression 
*/
function createGeoJSONFeatures(data) {
    const uniqueData = Array.from(
        new Map(data.map(item => [item.name, item])).values()
    );

    return uniqueData.map((item, index) => ({
        type: 'Feature',
        id: index + 1,
        properties: { name: item.name },
        geometry: {
            type: 'Point',
            coordinates: [parseFloat(item.longitude), parseFloat(item.latitude)]
        }
    }));
}

/*
Create a line-delimited GeoJSON file from a GeoJSON object.
The Mapbox Tilesets API requires GeoJSON data to be in a line-delimited format.

Input:
- data: A GeoJSON object containing a FeatureCollection
- outputFilePath: The path where the file will be saved

Returns:
- The path of the created file
*/
async function createGeoJSONFile(data) {
    if (!data.features || !Array.isArray(data.features)) {
        throw new Error('Invalid GeoJSON format: Missing "features" array.');
    }

    // Transform each feature into a line-delimited format
    const lineDelimitedData = data.features
        .map(feature => JSON.stringify(feature))  // Convert each feature to a JSON string
        .join('\n');                             // Join features with newline characters

    // Write the line-delimited features to a new file
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir);
    }
    const outputFilePath = path.join(tmpDir, 'output.geojson.ld');
    await fs.promises.writeFile(outputFilePath, lineDelimitedData, 'utf8')
        .then(() => logger.info(`Line-delimited GeoJSON created at ${outputFilePath}`))
        .catch((err) => logger.error(`Error writing GeoJSON file: ${err.message}`));
    
    return outputFilePath;
}
  
/*
Replaces a tileset source with new GeoJSON source data, or creates a source if it does not exist already.

Input:
- filePath: The path to the line-delimited GeoJSON file

Returns:
- The response from the API request
*/
async function updateTilesetSource(filePath) {
    logger.debug(`Updating tileset source with data from ${filePath}`);
    const url = `https://api.mapbox.com/tilesets/v1/sources/${MAPBOX_CONFIG.username}/${MAPBOX_CONFIG.tilesetSourceId}?access_token=${MAPBOX_CONFIG.accessToken}`;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    
    try {
        const response = await axios.put(url, formData, {
            headers: formData.getHeaders()
        });
        logger.info(`Tileset source updated: ${JSON.stringify(response.data)}`);
        return response;
    } catch (error) {
        logger.error(`Error updating tileset source: ${error}, ${JSON.stringify(error.response.data)}`);
    } finally {
        fs.promises.unlink(filePath)
            .then(() => logger.debug(`Temporary file deleted: ${filePath}`))
            .catch((err) => logger.error(`Error deleting temporary file: ${err.message}`));
    }
}


// List all tilesets
async function listTilesets() {
    logger.debug('Listing tilesets...');
    const url = `https://api.mapbox.com/tilesets/v1/${MAPBOX_CONFIG.username}?access_token=${MAPBOX_CONFIG.accessToken}`;

    try {
        const response = await axios.get(url);
        logger.debug(`Tilesets: ${JSON.stringify(response.data)}`);
        return response;
    } catch (error) {
        logger.error(`Error listing tilesets: ${error.message}`);
        throw error;
    }
}


// Create a new tileset
async function createTileset(tilesetInfo) {
    logger.debug(`Creating tileset: ${JSON.stringify(tilesetInfo)}`);
    const url = `https://api.mapbox.com/tilesets/v1/${MAPBOX_CONFIG.username}.${MAPBOX_CONFIG.tilesetId}?access_token=${MAPBOX_CONFIG.accessToken}`;
    const headers = {
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.post(url, tilesetInfo, { headers });
        logger.info(`Tileset created: ${JSON.stringify(response.data)}`);
        return response;
    } catch (error) {
        logger.error(`Error creating tileset: ${error.message}`);
        throw error;
    }
}

/*
Send a tileset to be published. Assumes that the underlying tileset source has already been updated.
*/
async function publishTileset(tilesetId) {
    logger.debug(`Publishing tileset: ${tilesetId}`);
    const url = `https://api.mapbox.com/tilesets/v1/${MAPBOX_CONFIG.username}.${tilesetId}/publish?access_token=${MAPBOX_CONFIG.accessToken}`;
    const headers = {
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.post(url, {}, { headers });
        const jobId = response.data.jobId;
        logger.info(`Tileset send to be published: ${jobId}`);
        return jobId;
    } catch (error) {
        logger.error(`Error publishing tileset: ${error.message}`);
        throw error;
    }
}


// Get job stage
async function getJobStage(jobId) {
    logger.debug(`Fetching job stage: ${jobId}`);
    const url = `https://api.mapbox.com/tilesets/v1/${MAPBOX_CONFIG.username}.${MAPBOX_CONFIG.tilesetId}/jobs/${jobId}?access_token=${MAPBOX_CONFIG.accessToken}`;

    try {
        const response = await axios.get(url);
        const jobStage = response.data.stage;
        logger.debug(`Job stage: ${jobStage}`);
        return jobStage;
    } catch (error) {
        logger.error(`Error fetching job stage: ${error.message}`);
        throw error;
    }
}


/*
Publish a style to make the draft changes visible on the map. There is no "publish" endpoint for styles,
so we need to update the style object by removing the "created" and "modified" properties.
*/
async function publishStyle(styleId) {
    logger.debug(`Publishing style: ${styleId}`);
    
    // Retrieve the style object
    const styleUrl = `https://api.mapbox.com/styles/v1/${MAPBOX_CONFIG.username}/${styleId}?access_token=${MAPBOX_CONFIG.accessToken}`;
    
    try {
        const styleResponse = await axios.get(styleUrl);
        const style = styleResponse.data;
        delete style.created;
        delete style.modified;

        // Publish the updated style object
        const publishUrl = `https://api.mapbox.com/styles/v1/${MAPBOX_CONFIG.username}/${styleId}?access_token=${MAPBOX_CONFIG.accessToken}`;
        const headers = {
            'Content-Type': 'application/json'
        };

        const publishResponse = await axios.patch(publishUrl, style, { headers });
        logger.info(`Style published: ${styleId}`);
        return publishResponse;
    } catch (error) {
        logger.error(`Error publishing style: ${error.message}`);
        throw error;
    }
}

// Update the map with new school data
async function updateMap(data) {
    logger.debug(`Updating map data...`);

    // Create a line-delimited GeoJSON file from the GeoJSON object
    const geoJSON = {
        type: 'FeatureCollection',
        features: createGeoJSONFeatures(data)
    };
    logger.debug(`Constructed GeoJSON: ${JSON.stringify(geoJSON)}`);
    const filePath = await createGeoJSONFile(geoJSON);
    logger.debug(`GeoJSON file created at ${filePath}`);

    // Update the tileset with the new GeoJSON data, consuming the temp file
    const updateResponse = await updateTilesetSource(filePath);
    if (updateResponse && updateResponse.data) {
        const id = updateResponse.data.id; // The ID of the updated tileset source
        
        // Tileset creation body
        const tilesetInfo = {
            recipe: createTilesetRecipe(id),
            name: MAPBOX_CONFIG.mapName,
            description: "School locations in Maine"
        }

        // Check if the tileset already exists, and create it if it doesn't
        const tilesets = await listTilesets();
        if (tilesets.data && tilesets.data.length > 0) {
            if (tilesets.data.some(tileset => tileset.id === `${MAPBOX_CONFIG.username}.${MAPBOX_CONFIG.tilesetId}`)) {
                logger.info(`Tileset ${MAPBOX_CONFIG.tilesetId} already exists`);
            } else {
                // Create a new tileset
                await createTileset(tilesetInfo);
            }
        }
    
        // Update the tileset (e.g. saying that it has an underlying source change)
        const publishJob = await publishTileset(MAPBOX_CONFIG.tilesetId);

        // Check the job stage to see if the tileset has been published
        let jobStage = await getJobStage(publishJob);

        // Poll the job stage until it reaches "complete"
        while (jobStage !== 'success') {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            jobStage = await getJobStage(publishJob);
        }
    
        // Publish the updated style (e.g. saying that the underlying tileset has changed)
        const publishResponse = await publishStyle(MAPBOX_CONFIG.styleId);
        if (publishResponse) {
            return { success: true, message: 'Map updated successfully' };
        }
    } else {
        return { success: false, message: 'Error updating map' };
    }
}

module.exports = {
    getCoordinates,
    updateMap
};