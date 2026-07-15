require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const db = require('./database');

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is missing from the .env file.');
  process.exit(1);
}

const dataDir =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');

const uploadsFolder = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsFolder)) {
  fs.mkdirSync(uploadsFolder, { recursive: true });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const saveMessage = db.prepare(`
  INSERT OR IGNORE INTO messages (
    id,
    guild_id,
    guild_name,
    channel_id,
    channel_name,
    author_id,
    author_name,
    content,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const saveAttachment = db.prepare(`
  INSERT INTO attachments (
    message_id,
    original_name,
    stored_name,
    original_url,
    local_path,
    content_type,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    saveMessage.run(
      message.id,
      message.guild.id,
      message.guild.name,
      message.channel.id,
      message.channel.name ?? 'unknown-channel',
      message.author.id,
      message.author.tag,
      message.content,
      message.createdAt.toISOString()
    );

    for (const attachment of message.attachments.values()) {
      const originalName =
        attachment.name || `attachment-${attachment.id}`;

      const safeName = path.basename(originalName);

      const storedName =
        `${message.id}-${attachment.id}-${safeName}`;

      const localPath =
        path.join(uploadsFolder, storedName);

      const response = await fetch(attachment.url);

      if (!response.ok) {
        throw new Error(
          `Download failed with status ${response.status}`
        );
      }

      const fileData =
        Buffer.from(await response.arrayBuffer());

      fs.writeFileSync(localPath, fileData);

      saveAttachment.run(
        message.id,
        safeName,
        storedName,
        attachment.url,
        localPath,
        attachment.contentType ?? null,
        new Date().toISOString()
      );

      console.log(`Saved attachment: ${storedName}`);
    }

    console.log(
      `Saved message from ${message.author.tag} in #${message.channel.name}`
    );
  } catch (error) {
    console.error('Archive error:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);