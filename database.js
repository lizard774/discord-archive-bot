const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir =
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'archive.db');

console.log(`Database path: ${dbPath}`);

const db = new Database(dbPath);

// Improves reliability and read performance.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create the main messages table.
db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    guild_name TEXT,
    guild_icon_url TEXT,
    channel_id TEXT,
    channel_name TEXT,
    author_id TEXT,
    author_name TEXT,
    author_avatar_url TEXT,
    content TEXT,
    reply_to_message_id TEXT,
    created_at TEXT,
    edited_at TEXT,
    deleted_at TEXT
  )
`).run();

// Safely add newer columns to an existing database.
function addColumnIfMissing(tableName, columnName, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all();

  const exists = columns.some(
    column => column.name === columnName
  );

  if (!exists) {
    db.prepare(`
      ALTER TABLE ${tableName}
      ADD COLUMN ${columnName} ${definition}
    `).run();

    console.log(
      `Added column ${tableName}.${columnName}`
    );
  }
}

addColumnIfMissing(
  'messages',
  'guild_icon_url',
  'TEXT'
);

addColumnIfMissing(
  'messages',
  'author_avatar_url',
  'TEXT'
);

addColumnIfMissing(
  'messages',
  'reply_to_message_id',
  'TEXT'
);

addColumnIfMissing(
  'messages',
  'edited_at',
  'TEXT'
);

addColumnIfMissing(
  'messages',
  'deleted_at',
  'TEXT'
);

// Attachments table.
db.prepare(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    original_name TEXT,
    stored_name TEXT,
    original_url TEXT,
    local_path TEXT,
    content_type TEXT,
    created_at TEXT,
    FOREIGN KEY (message_id)
      REFERENCES messages(id)
      ON DELETE CASCADE
  )
`).run();

// Indexes used by the archive viewer.
db.prepare(`
  CREATE INDEX IF NOT EXISTS
  idx_messages_channel_created
  ON messages(channel_id, created_at)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS
  idx_messages_guild
  ON messages(guild_id)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS
  idx_messages_author
  ON messages(author_id)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS
  idx_messages_created
  ON messages(created_at)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS
  idx_messages_reply
  ON messages(reply_to_message_id)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS
  idx_attachments_message
  ON attachments(message_id)
`).run();

console.log('Database initialized successfully.');

module.exports = db;