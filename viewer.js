const express = require('express');
const path = require('path');

const db = require('./database');

const app = express();

const PORT = process.env.PORT || 3000;

const dataDir =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');

const uploadsFolder = path.join(dataDir, 'uploads');

// Allows archived attachments to appear in the viewer.
app.use('/uploads', express.static(uploadsFolder));

app.get('/api/guilds', (req, res) => {
  try {
const guilds = db.prepare(`
  SELECT
    guild_id,
    guild_name,
    MAX(guild_icon_url) AS guild_icon_url,
    COUNT(*) AS message_count
  FROM messages
  GROUP BY guild_id, guild_name
  ORDER BY guild_name COLLATE NOCASE
`).all();

    res.json(guilds);
  } catch (error) {
    console.error('Guild loading error:', error);
    res.status(500).json({
      error: 'Unable to load servers.'
    });
  }
});

app.get('/api/guilds/:guildId/channels', (req, res) => {
  try {
    const channels = db.prepare(`
      SELECT
        channel_id,
        channel_name,
        COUNT(*) AS message_count
      FROM messages
      WHERE guild_id = ?
      GROUP BY channel_id, channel_name
      ORDER BY channel_name COLLATE NOCASE
    `).all(req.params.guildId);

    res.json(channels);
  } catch (error) {
    console.error('Channel loading error:', error);
    res.status(500).json({
      error: 'Unable to load channels.'
    });
  }
});

app.get('/api/channels/:channelId/messages', (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 100, 1),
      500
    );

 const messages = db.prepare(`
  SELECT
    id,
    guild_id,
    guild_name,
    guild_icon_url,
    channel_id,
    channel_name,
    author_id,
    author_name,
    author_avatar_url,
    content,
    reply_to_message_id,
    created_at,
    edited_at
  FROM messages
  WHERE channel_id = ?
  ORDER BY created_at ASC
  LIMIT ?
`).all(req.params.channelId, limit);

    const attachmentQuery = db.prepare(`
      SELECT
        id,
        message_id,
        original_name,
        stored_name,
        content_type,
        created_at
      FROM attachments
      WHERE message_id = ?
      ORDER BY id ASC
    `);

    const results = messages.map(message => {
      const attachments = attachmentQuery
        .all(message.id)
        .map(attachment => ({
          ...attachment,
          viewer_url: `/uploads/${encodeURIComponent(
            attachment.stored_name
          )}`
        }));

      return {
        ...message,
        attachments
      };
    });

     res.json(results);
  } catch (error) {
    console.error('Message loading error:', error);

    res.status(500).json({
      error: 'Unable to load messages.'
    });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok'
  });
});

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
  <title>Discord Archive Viewer</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      height: 100vh;
      overflow: hidden;
      background: #1e1f22;
      color: #dbdee1;
      font-family:
        Inter,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .app {
      display: grid;
      grid-template-columns: 260px 1fr;
      height: 100vh;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      background: #2b2d31;
      border-right: 1px solid #1e1f22;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 18px;
      background: #232428;
      border-bottom: 1px solid #1e1f22;
    }

    .sidebar-header h1 {
      margin: 0;
      font-size: 17px;
    }

    .sidebar-header p {
      margin: 5px 0 0;
      color: #949ba4;
      font-size: 12px;
    }

    .sidebar-content {
      padding: 12px;
      overflow-y: auto;
    }

    .section-title {
      margin: 12px 8px 6px;
      color: #949ba4;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .sidebar-button {
      width: 100%;
      margin-bottom: 3px;
      padding: 9px 10px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #b5bac1;
      text-align: left;
      cursor: pointer;
    }

    .sidebar-button:hover {
      background: #35373c;
      color: #f2f3f5;
    }

    .sidebar-button.active {
      background: #404249;
      color: #ffffff;
    }

    .button-title {
      display: block;
      overflow: hidden;
      font-size: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .button-count {
      display: block;
      margin-top: 2px;
      color: #949ba4;
      font-size: 11px;
    }

    .main {
      display: flex;
      min-width: 0;
      flex-direction: column;
      background: #313338;
    }

    .channel-header {
      display: flex;
      min-height: 58px;
      align-items: center;
      padding: 0 22px;
      background: #313338;
      border-bottom: 1px solid #26272b;
      box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
    }

    .channel-header h2 {
      margin: 0;
      font-size: 17px;
    }

    .channel-symbol {
      margin-right: 8px;
      color: #949ba4;
      font-size: 22px;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 22px 0 40px;
    }

    .empty-state {
      display: flex;
      height: 100%;
      align-items: center;
      justify-content: center;
      padding: 30px;
      color: #949ba4;
      text-align: center;
    }

    .message {
      display: grid;
      grid-template-columns: 48px 1fr;
      gap: 12px;
      padding: 8px 24px;
    }

    .message:hover {
      background: #2e3035;
    }

    .avatar {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #5865f2;
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  user-select: none;
}
  .avatar img {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
}

    .message-header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 3px;
    }

    .author {
      color: #f2f3f5;
      font-size: 15px;
      font-weight: 600;
    }

    .timestamp {
      color: #949ba4;
      font-size: 11px;
    }

    .content {
      color: #dbdee1;
      font-size: 15px;
      line-height: 1.4;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .attachments {
      margin-top: 9px;
    }

    .attachment-image {
      display: block;
      max-width: min(520px, 100%);
      max-height: 420px;
      border-radius: 8px;
      object-fit: contain;
    }

    .attachment-file {
      display: inline-block;
      margin-top: 4px;
      padding: 12px 14px;
      border-radius: 6px;
      background: #2b2d31;
      color: #00a8fc;
      text-decoration: none;
    }

    .attachment-file:hover {
      text-decoration: underline;
    }

    .status {
      padding: 8px 18px;
      background: #232428;
      color: #949ba4;
      font-size: 12px;
    }
  </style>
</head>

<body>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>Discord Archive</h1>
        <p>Read-only archive viewer</p>
      </div>

      <div class="sidebar-content">
        <div class="section-title">Servers</div>
        <div id="guild-list"></div>

        <div class="section-title">Channels</div>
        <div id="channel-list">
          <p style="padding: 0 8px; color: #949ba4;">
            Select a server.
          </p>
        </div>
      </div>
    </aside>

    <main class="main">
      <header class="channel-header">
        <span class="channel-symbol">#</span>
        <h2 id="channel-title">Select a channel</h2>
      </header>

      <section class="messages" id="messages">
        <div class="empty-state">
          Select a server and channel to view archived messages.
        </div>
      </section>

      <footer class="status" id="status">
        Loading archive…
      </footer>
    </main>
  </div>

  <script>
    const guildList = document.getElementById('guild-list');
    const channelList = document.getElementById('channel-list');
    const messagesContainer = document.getElementById('messages');
    const channelTitle = document.getElementById('channel-title');
    const statusElement = document.getElementById('status');

    function escapeHtml(value) {
      const element = document.createElement('div');
      element.textContent = value ?? '';
      return element.innerHTML;
    }

    function getInitials(name) {
      const cleanName = String(name || '?')
        .replace(/#\\d+$/, '')
        .trim();

      const parts = cleanName.split(/\\s+/).filter(Boolean);

      return parts
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('') || '?';
    }

    function formatDate(value) {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return value || 'Unknown time';
      }

      return date.toLocaleString();
    }

    function isImage(attachment) {
      if (attachment.content_type?.startsWith('image/')) {
        return true;
      }

      return /\\.(png|jpe?g|gif|webp|bmp)$/i.test(
        attachment.original_name || ''
      );
    }

    async function loadGuilds() {
      const response = await fetch('/api/guilds');

      if (!response.ok) {
        throw new Error('Unable to load servers.');
      }

      const guilds = await response.json();

      guildList.innerHTML = '';

      if (guilds.length === 0) {
        guildList.innerHTML =
          '<p style="padding: 0 8px; color: #949ba4;">' +
          'No archived servers found.</p>';

        statusElement.textContent = 'No archived messages found.';
        return;
      }

      guilds.forEach(guild => {
        const button = document.createElement('button');
        button.className = 'sidebar-button';

       button.innerHTML =
  (
    guild.guild_icon_url
      ? '<img src="' +
        escapeHtml(guild.guild_icon_url) +
        '" style="width:24px;height:24px;border-radius:50%;margin-right:8px;vertical-align:middle;">'
      : ''
  ) +
  '<span class="button-title">' +
  escapeHtml(guild.guild_name) +
  '</span>' +
          '<span class="button-count">' +
          guild.message_count +
          ' messages</span>';

        button.addEventListener('click', () => {
          document
            .querySelectorAll('#guild-list .sidebar-button')
            .forEach(item => item.classList.remove('active'));

          button.classList.add('active');
          loadChannels(guild.guild_id);
        });

        guildList.appendChild(button);
      });

      statusElement.textContent =
        guilds.length + ' archived server(s) found.';
    }

    async function loadChannels(guildId) {
      channelList.innerHTML =
        '<p style="padding: 0 8px; color: #949ba4;">Loading…</p>';

      const response = await fetch(
        '/api/guilds/' +
        encodeURIComponent(guildId) +
        '/channels'
      );

      if (!response.ok) {
        throw new Error('Unable to load channels.');
      }

      const channels = await response.json();
      channelList.innerHTML = '';

      channels.forEach(channel => {
        const button = document.createElement('button');
        button.className = 'sidebar-button';

        button.innerHTML =
          '<span class="button-title"># ' +
          escapeHtml(channel.channel_name) +
          '</span>' +
          '<span class="button-count">' +
          channel.message_count +
          ' messages</span>';

        button.addEventListener('click', () => {
          document
            .querySelectorAll('#channel-list .sidebar-button')
            .forEach(item => item.classList.remove('active'));

          button.classList.add('active');

          loadMessages(
            channel.channel_id,
            channel.channel_name
          );
        });

        channelList.appendChild(button);
      });

      statusElement.textContent =
        channels.length + ' archived channel(s) found.';
    }

    async function loadMessages(channelId, channelName) {
      channelTitle.textContent = channelName;
      messagesContainer.innerHTML =
        '<div class="empty-state">Loading messages…</div>';

      const response = await fetch(
        '/api/channels/' +
        encodeURIComponent(channelId) +
        '/messages?limit=500'
      );

      if (!response.ok) {
        throw new Error('Unable to load messages.');
      }

      const messages = await response.json();

      if (messages.length === 0) {
        messagesContainer.innerHTML =
          '<div class="empty-state">' +
          'No archived messages in this channel.' +
          '</div>';

        return;
      }

      messagesContainer.innerHTML = '';

      messages.forEach(message => {
        const article = document.createElement('article');
        article.className = 'message';

        const attachmentsHtml = message.attachments
          .map(attachment => {
            const safeUrl = escapeHtml(attachment.viewer_url);
            const safeName = escapeHtml(
              attachment.original_name || 'Attachment'
            );

            if (isImage(attachment)) {
              return (
                '<a href="' +
                safeUrl +
                '" target="_blank" rel="noopener noreferrer">' +
                '<img class="attachment-image" src="' +
                safeUrl +
                '" alt="' +
                safeName +
                '">' +
                '</a>'
              );
            }

            return (
              '<a class="attachment-file" href="' +
              safeUrl +
              '" target="_blank" rel="noopener noreferrer">' +
              '📎 ' +
              safeName +
              '</a>'
            );
          })
          .join('');

        article.innerHTML =
         (
  message.author_avatar_url
    ? '<div class="avatar">' +
      '<img src="' +
      escapeHtml(message.author_avatar_url) +
      '" alt="avatar">' +
      '</div>'
    : '<div class="avatar">' +
      escapeHtml(getInitials(message.author_name)) +
      '</div>'
) +
          '<div>' +
            '<div class="message-header">' +
              '<span class="author">' +
                escapeHtml(message.author_name) +
              '</span>' +
              '<span class="timestamp">' +
                escapeHtml(formatDate(message.created_at)) +
              '</span>' +
            '</div>' +
            '<div class="content">' +
              escapeHtml(message.content) +
            '</div>' +
            '<div class="attachments">' +
              attachmentsHtml +
            '</div>' +
          '</div>';

        messagesContainer.appendChild(article);
      });

      messagesContainer.scrollTop =
        messagesContainer.scrollHeight;

      statusElement.textContent =
        messages.length + ' message(s) displayed.';
    }

    loadGuilds().catch(error => {
      console.error(error);

      statusElement.textContent = error.message;

      messagesContainer.innerHTML =
        '<div class="empty-state">' +
        'The archive could not be loaded.' +
        '</div>';
    });
  </script>
</body>
</html>
  `);
});

const host = process.env.RAILWAY_ENVIRONMENT
  ? '0.0.0.0'
  : '127.0.0.1';

app.listen(PORT, host, () => {
  console.log(
    `Archive viewer running at http://localhost:${PORT}`
  );
});

module.exports = app;