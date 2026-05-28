/**
 * Quick smoke-test for lib/apify scrapePost.
 * Run with: npx ts-node scripts/test-apify.ts
 *
 * Set APIFY_TOKEN in .env.local (or your shell environment) before running.
 */

// Load .env.local so APIFY_TOKEN is available when running outside Next.js
import { config } from 'dotenv';
config({ path: '.env.local' });

import { scrapePost, detectPlatform } from '../lib/apify';

const TEST_URLS: string[] = [
  // Replace with a real public TikTok URL to test live scraping.
  'https://www.tiktok.com/@charlidamelio/video/7106167356980992302',
];

async function main() {
  console.log('=== Apify integration test ===\n');
  console.log(`APIFY_TOKEN set: ${!!process.env.APIFY_TOKEN}\n`);

  for (const url of TEST_URLS) {
    console.log(`URL: ${url}`);
    console.log(`Platform detected: ${detectPlatform(url)}`);
    console.log('Calling scrapePost()...\n');

    const result = await scrapePost(url);

    if ('error' in result && result.error) {
      console.error('ERROR:', result.message);
      console.error('Suggestion:', result.suggestion);
    } else {
      const metrics = result as Exclude<typeof result, { error: true }>;
      console.log('SUCCESS — metrics returned:');
      console.log(JSON.stringify(metrics, null, 2));
    }

    console.log('\n' + '─'.repeat(60) + '\n');
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
