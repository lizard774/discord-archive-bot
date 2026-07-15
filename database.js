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
console.log(`Database path: ${dbPath}`);

const db = new Database(dbPath);

// Messages table
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

// Attachments table
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

// Indexes to improve performance
db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_messages_channel_created
  ON messages(channel_id, created_at)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_messages_guild
  ON messages(guild_id)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_messages_author
  ON messages(author_id)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_messages_created
  ON messages(created_at)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_attachments_message
  ON attachments(message_id)
`).run();

console.log('Database initialized successfully.');

module.exports = db;