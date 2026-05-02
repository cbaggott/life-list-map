//headers: { 'X-eBirdApiToken': '2s5d35bsmcis' }
 
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('birds.json'));
const nulls = b.filter(x => x.lat === null);
const uniqueLocs = [...new Map(nulls.map(x => [x.locId, x])).values()];
uniqueLocs.forEach(x => console.log(x.locId, '|', x.location));