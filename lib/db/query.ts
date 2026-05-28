import { SCHEMA } from "./schema";
import type { SupabaseClient } from "@supabase/supabase-js";

const R = SCHEMA.renders.columns;
const P = SCHEMA.profiles.columns;
const C = SCHEMA.credits.columns;

export function renders(db: SupabaseClient) {
  const table = SCHEMA.renders.table;
  return {
    forUser(userId: string) {
      return db.from(table).select("*").eq(R.userId, userId);
    },
    recentByUser(userId: string, limit = 20) {
      return db.from(table).select("*").eq(R.userId, userId)
        .order(R.createdAt, { ascending: false })
        .limit(limit);
    },
    byId(id: string) {
      return db.from(table).select("*").eq(R.id, id).single();
    },
    byIdForUser(id: string, userId: string) {
      return db.from(table).select("*").eq(R.id, id).eq(R.userId, userId).single();
    },
    statusForUser(userId: string, status: string) {
      return db.from(table).select("*").eq(R.userId, userId).eq(R.status, status);
    },
    realtimeFilter(userId: string) {
      return `${R.userId}=eq.${userId}`;
    },
  };
}

export function profiles(db: SupabaseClient) {
  const table = SCHEMA.profiles.table;
  return {
    byId(id: string) {
      return db.from(table).select("*").eq(P.id, id).single();
    },
    planForUser(id: string) {
      return db.from(table).select(P.plan).eq(P.id, id).single();
    },
  };
}

export function credits(db: SupabaseClient) {
  const table = SCHEMA.credits.table;
  return {
    forUser(userId: string) {
      return db.from(table).select("*").eq(C.userId, userId).single();
    },
  };
}
