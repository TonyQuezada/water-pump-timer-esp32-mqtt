import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ========== DATABASE PATH ==========
// Store the database file outside the Next.js build directory
// so it persists across deployments and rebuilds.
const DB_DIR  = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "waterpump.db");

// Ensure the data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// ========== CONNECTION ==========
// better-sqlite3 is synchronous and creates the file if it doesn't exist.
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ========== SCHEMA ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  TEXT    NOT NULL DEFAULT (datetime('now')),
    source     TEXT    NOT NULL CHECK(source IN ('physical', 'web')),
    action     TEXT    NOT NULL,
    detail     TEXT,
    username   TEXT    -- NULL for physical events
  );
`);

// ========== TYPES ==========
export interface User {
  id:            number;
  username:      string;
  password_hash: string;
  role:          "admin" | "user";
  created_at:    string;
}

export interface Log {
  id:        number;
  timestamp: string;
  source:    "physical" | "web";
  action:    string;
  detail:    string | null;
  username:  string | null;
}

// ========== USER QUERIES ==========
export const userQueries = {
  findByUsername: db.prepare<[string], User>(
    "SELECT * FROM users WHERE username = ?"
  ),

  findById: db.prepare<[number], User>(
    "SELECT * FROM users WHERE id = ?"
  ),

  create: db.prepare<[string, string, string], void>(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `),

  delete: db.prepare<[string], void>(
    "DELETE FROM users WHERE username = ?"
  ),

  list: db.prepare<[], User>(
    "SELECT id, username, role, created_at FROM users"
  ),
};

// ========== LOG QUERIES ==========
export const logQueries = {
  insert: db.prepare<[string, string, string | null, string | null], void>(`
    INSERT INTO logs (source, action, detail, username)
    VALUES (?, ?, ?, ?)
  `),

  getRecent: db.prepare<[number], Log>(`
    SELECT * FROM logs
    ORDER BY timestamp DESC
    LIMIT ?
  `),

  getAll: db.prepare<[], Log>(
    "SELECT * FROM logs ORDER BY timestamp DESC"
  ),
};

export default db;
