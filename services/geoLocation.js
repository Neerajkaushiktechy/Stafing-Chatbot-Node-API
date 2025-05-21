const opencage = require('opencage-api-client');
require('dotenv').config();

const apiKey = process.env.GEO_LOCATION_API_KEY;

async function geo_lat_lng(city_state_zip) {
  try {
    const data = await opencage.geocode({
      q: city_state_zip,
      language: 'fr',
      key: apiKey,
    });

    if (data.status.code === 200 && data.results.length > 0) {
      const result = data.results[0];
      console.log('Formatted Address:', result.formatted);
      console.log('Latitude:', result.geometry.lat);
      console.log('Longitude:', result.geometry.lng);

      return {
        lat: result.geometry.lat,
        lng: result.geometry.lng,
      };
    } else {
      console.log('No results found.');
      return null;
    }
  } catch (error) {
    console.warn('Error:', error.message);
    return null;
  }
}

module.exports = { geo_lat_lng };