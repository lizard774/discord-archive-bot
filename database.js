const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');

// Create the directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'archive.db');
const db = new Database(dbPath);

db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    guild_name TEXT,
    channel_id TEXT,
    channel_name TEXT,
    author_id TEXT,
    author_name TEXT,
    content TEXT,
    created_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    original_name TEXT,
    stored_name TEXT,
    original_url TEXT,
    local_path TEXT,
    content_type TEXT,
    created_at TEXT
  )
`).run();

module.exports = db;