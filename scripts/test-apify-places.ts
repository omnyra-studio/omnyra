import { config } from 'dotenv';
config({ path: '.env.local' });

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const actorInput = {
  searchStringsArray: ['ramen'],
  locationQuery: 'New York, USA',
  maxCrawledPlacesPerSearch: 10,
  language: 'en',
};

console.log('Running the Actor...');
const run = await client.actor('compass/crawler-google-places').call(actorInput);
console.log('🚀 Actor finished', run.status);

const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log('Data from the dataset:', JSON.stringify(items, null, 2));
console.log(`💾 Check your data here: https://console.apify.com/storage/datasets/${run.defaultDatasetId}`);
