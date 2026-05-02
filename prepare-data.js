import fetch from 'node-fetch';
import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { parse } from 'csv-parse';

const EBIRD_API_KEY = '2s5d35bsmcis';

// Read and parse the CSV
const records = [];
const parser = createReadStream('ebird_world_life_list.csv').pipe(
  parse({ columns: true, skip_empty_lines: true })
);

for await (const record of parser) {
  if (record['Countable'] === '1') {
    records.push(record);
  }
}

console.log(`Found ${records.length} birds`);

// Get unique location IDs
const uniqueLocIDs = [...new Set(records.map(r => r.LocID))];
console.log(`Found ${uniqueLocIDs.length} unique locations — fetching coordinates...`);

// Fetch lat/long for each location from eBird API
const locationCache = {};
for (const locId of uniqueLocIDs) {
  try {
    const res = await fetch(`https://api.ebird.org/v2/ref/hotspot/info/${locId}`, {
      headers: { 'X-eBirdApiToken': EBIRD_API_KEY }
    });
    const data = await res.json();
    locationCache[locId] = {
      lat: data.lat,
      lng: data.lng,
      locationName: data.name
    };
    console.log(`✓ ${data.name}`);
  } catch (e) {
    console.log(`✗ Could not fetch ${locId}`);
  }
}

// Build final birds array
const birds = records.map(record => ({
  commonName: record['Common Name'],
  scientificName: record['Scientific Name'],
  date: record['Date'],
  year: new Date(record['Date']).getFullYear(),
  location: record['Location'],
  locId: record['LocID'],
  lat: locationCache[record.LocID]?.lat ?? null,
  lng: locationCache[record.LocID]?.lng ?? null,
}));

await writeFile('birds.json', JSON.stringify(birds, null, 2));
console.log(`\nDone! birds.json created with ${birds.length} birds.`);