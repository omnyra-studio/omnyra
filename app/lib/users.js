import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "users.json");

function readUsers() {
  try {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify([]));
      return [];
    }
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

export function findUserByEmail(email) {
  return readUsers().find(u => u.email === email.toLowerCase()) || null;
}

export function createUser({ email, password, name }) {
  const users = readUsers();
  const existing = users.find(u => u.email === email.toLowerCase());
  if (existing) throw new Error("Email already registered");
  const user = {
    id: randomUUID(),
    email: email.toLowerCase(),
    password,
    name: name || email.split("@")[0],
    role: "free",
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function verifyUser(email, password) {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
