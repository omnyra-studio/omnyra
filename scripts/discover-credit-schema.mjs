import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres",
  { ssl: "require", max: 1 }
);

const cols = await sql.unsafe(`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      column_name ILIKE '%credit%'
      OR column_name ILIKE '%balance%'
      OR column_name ILIKE '%plan%'
      OR column_name ILIKE '%subscription%'
    )
  ORDER BY table_name, ordinal_position
`);

const fks = await sql.unsafe(`
  SELECT
    kcu.table_name  AS from_table,
    kcu.column_name AS from_col,
    ccu.table_name  AS to_table,
    ccu.column_name AS to_col
  FROM information_schema.key_column_usage kcu
  JOIN information_schema.referential_constraints rc
    ON kcu.constraint_name = rc.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
  WHERE ccu.table_name IN ('profiles','credits')
    AND ccu.table_schema = 'public'
`);

const deductFn = await sql.unsafe(`
  SELECT proname, pg_get_functiondef(oid) AS def
  FROM pg_proc
  WHERE proname = 'deduct_credits'
`);

const profileSample = await sql.unsafe(`
  SELECT id, plan, credits, stripe_subscription_id
  FROM public.profiles LIMIT 2
`);

const creditSample = await sql.unsafe(`
  SELECT id, user_id, balance, plan, updated_at
  FROM public.credits LIMIT 2
`);

const profileCount = await sql.unsafe(`SELECT COUNT(*) AS n FROM public.profiles`);
const creditsCount = await sql.unsafe(`SELECT COUNT(*) AS n FROM public.credits`);

await sql.end();

console.log("=== CREDIT/PLAN/BALANCE/SUBSCRIPTION COLUMNS ===");
for (const r of cols) {
  console.log(`  ${r.table_name}.${r.column_name}  [${r.data_type}] nullable=${r.is_nullable}`);
}

console.log("\n=== FOREIGN KEYS TO profiles/credits ===");
for (const r of fks) {
  console.log(`  ${r.from_table}.${r.from_col} -> ${r.to_table}.${r.to_col}`);
}

console.log("\n=== public.profiles ROW COUNT ===", profileCount[0].n);
console.log("=== public.credits ROW COUNT ===", creditsCount[0].n);

console.log("\n=== public.profiles SAMPLE (redacted) ===");
for (const r of profileSample) {
  console.log(`  plan=${r.plan}  credits=${r.credits}  stripe_subscription_id=${r.stripe_subscription_id ? "SET" : "NULL"}`);
}

console.log("\n=== public.credits SAMPLE (redacted) ===");
for (const r of creditSample) {
  console.log(`  user_id=${r.user_id}  balance=${r.balance}  plan=${r.plan}  updated_at=${r.updated_at}`);
}

console.log("\n=== deduct_credits RPC ===");
if (deductFn.length) {
  console.log(deductFn[0].def);
} else {
  console.log("  NOT FOUND");
}
