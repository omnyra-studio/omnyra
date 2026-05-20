if (!globalThis.__omnyra_blacklist) globalThis.__omnyra_blacklist = new Map();
const blacklist = globalThis.__omnyra_blacklist;

export function blacklistToken(jti, exp) {
  blacklist.set(jti, exp);
  pruneExpired();
}

export function isBlacklisted(jti) {
  return blacklist.has(jti);
}

function pruneExpired() {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, exp] of blacklist.entries()) {
    if (exp < now) blacklist.delete(key);
  }
}
