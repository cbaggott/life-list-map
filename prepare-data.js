import fetch from 'node-fetch';
import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { parse } from 'csv-parse';

const EBIRD_API_KEY = '2s5d35bsmcis';

// Manual coordinates for private locations not in eBird API
const MANUAL_LOCATIONS = {
  'L21825909': { lat: 18.4955, lng: -77.8616, locationName: 'Hyatt Zilara Rose Hall' },
  'L9671891':  { lat: 39.446,  lng: -83.072,  locationName: 'Unnamed Road, Chillicothe, Ohio' },
  'L15150128': { lat: 34.701,  lng: -120.113, locationName: 'Figueroa Mountain Road' },
  'L15037017': { lat: 38.486,  lng: -122.903, locationName: '7750 Giusti Road, Forestville' },
  'L14388386': { lat: 40.664,  lng: -98.891,  locationName: 'Elm Island Road, Gibbon NE' },
  'L9320151':  { lat: 48.624,  lng: -123.150, locationName: '133 Brooks Lane, Friday Harbor' },
  'L10386057': { lat: 18.388,  lng: -65.770,  locationName: 'Wyndham Rio Mar' },
  'L17975932': { lat: 26.0793, lng: -81.7457, locationName: 'Naples Botanical Garden' },
  'L9037370':  { lat: 39.2320, lng: -84.3783, locationName: 'Catalpa Creek, Blue Ash OH' },
  'L8966142':  { lat: 39.1454, lng: -84.3858, locationName: 'Medpace, Madisonville Cincinnati' },
};

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
  // Use manual coordinates if available
  if (MANUAL_LOCATIONS[locId]) {
    locationCache[locId] = MANUAL_LOCATIONS[locId];
    console.log(`✓ (manual) ${MANUAL_LOCATIONS[locId].locationName}`);
    continue;
  }
  try {
    const res = await fetch(`https://api.ebird.org/v2/ref/hotspot/info/${locId}`, {
      headers: { 'X-eBirdApiToken': EBIRD_API_KEY }
    });
    const data = await res.json();
    if (data.lat) {
      locationCache[locId] = {
        lat: data.lat,
        lng: data.lng,
        locationName: data.name
      };
      console.log(`✓ ${data.name}`);
    } else {
      throw new Error('No coordinates');
    }
  } catch (e) {
    // Fall back to checklist subId for custom locations
    const record = records.find(r => r.LocID === locId);
    const subId = record?.['SubID'];
    if (subId) {
      try {
        const res2 = await fetch(`https://api.ebird.org/v2/product/checklist/view/${subId}`, {
          headers: { 'X-eBirdApiToken': EBIRD_API_KEY }
        });
        const data2 = await res2.json();
        if (data2.lat) {
          locationCache[locId] = {
            lat: data2.lat,
            lng: data2.lng,
            locationName: data2.loc?.name || locId
          };
          console.log(`✓ (via checklist) ${locationCache[locId].locationName}`);
        } else {
          console.log(`✗ No coordinates found for ${locId}`);
        }
      } catch (e2) {
        console.log(`✗ Could not fetch checklist for ${locId}`);
      }
    }
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