/**
 * Run once after adding a valid STRIPE_SECRET_KEY to .env.local:
 *   node scripts/create-stripe-products.mjs
 *
 * Outputs three price IDs — paste them into .env.local as shown.
 */

import Stripe from 'stripe'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
const envText = readFileSync(envPath, 'utf8')
const key     = envText.match(/^STRIPE_SECRET_KEY=(.+)$/m)?.[1]?.trim()

if (!key || key.startsWith('sk_test_YOUR') || key.startsWith('your_')) {
  console.error('✗  Set a real STRIPE_SECRET_KEY in .env.local first.')
  process.exit(1)
}

const stripe = new Stripe(key)

const PLANS = [
  { env: 'STRIPE_PRICE_CREATOR', name: 'Omnyra Creator', desc: '200 credits/month · 1 min video · No watermark',         amount: 2900, plan: 'Creator' },
  { env: 'STRIPE_PRICE_PRO',     name: 'Omnyra Pro',     desc: '500 credits/month · 3 min video · 4K exports',           amount: 6900, plan: 'Pro'     },
  { env: 'STRIPE_PRICE_STUDIO',  name: 'Omnyra Studio',  desc: '1,500 credits/month · 5 min video · Batch generation',   amount: 9900, plan: 'Studio'  },
]

console.log('Creating Stripe products and prices (AUD)…\n')

const results = []

for (const p of PLANS) {
  const product = await stripe.products.create({
    name: p.name,
    description: p.desc,
    metadata: { plan: p.plan },
  })

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'aud',
    unit_amount: p.amount,
    recurring: { interval: 'month' },
    metadata: { plan: p.plan },
  })

  console.log(`✓  ${p.name}  →  ${price.id}`)
  results.push({ env: p.env, priceId: price.id })
}

// Patch .env.local with the new price IDs
let updated = envText
for (const { env, priceId } of results) {
  if (updated.includes(`${env}=`)) {
    updated = updated.replace(new RegExp(`^${env}=.*$`, 'm'), `${env}=${priceId}`)
  } else {
    updated += `\n${env}=${priceId}`
  }
}
writeFileSync(envPath, updated)

console.log('\n✓  Price IDs written to .env.local')
console.log('   Restart your dev server to pick up the new env vars.\n')
