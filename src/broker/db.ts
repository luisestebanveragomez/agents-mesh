import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

const DB_PATH = process.env.AGENTS_MESH_DB ?? join(homedir(), ".agents-mesh.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  _db = new Database(DB_PATH, { create: true });
  _db.run("PRAGMA journal_mode = WAL");  // permite lecturas concurrentes
  _db.run("PRAGMA foreign_keys = ON");

  _db.run(`
    CREATE TABLE IF NOT EXISTS peers (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      path TEXT NOT NULL,
      pid INTEGER NOT NULL,
      agent TEXT NOT NULL DEFAULT 'unknown',
      agent_version TEXT NOT NULL DEFAULT 'unknown',
      started_at TEXT NOT NULL,
      last_heartbeat TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task TEXT,
      git_branch TEXT,
      token TEXT
    )
  `);

  // C3: migration — add token column for existing DBs
  try {
    _db.run("ALTER TABLE peers ADD COLUMN token TEXT");
  } catch {} // column already exists

  _db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      to_id TEXT NOT NULL,
      to_role TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0,
      auto_responded INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Migration: add auto_responded if it doesn't exist yet
  try {
    _db.run("ALTER TABLE messages ADD COLUMN auto_responded INTEGER NOT NULL DEFAULT 0");
  } catch {} // column already exists

  _db.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT ''
    )
  `);

  // Índices para queries frecuentes
  _db.run("CREATE INDEX IF NOT EXISTS idx_messages_to_delivered ON messages(to_id, delivered)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_peers_heartbeat ON peers(last_heartbeat)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity(timestamp DESC)");

  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
