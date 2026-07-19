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
      overflow: hidden;
      background: #2b2d31;
      border-right: 1px solid #1e1f22;
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
      margin-top: 3px;
      color: #949ba4;
      font-size: 11px;
    }

        .main {
      display: flex;
      min-width: 0;
      flex-direction: column;
      background: #313338;
    }

    .topbar {
      display: flex;
      min-height: 52px;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      background: #313338;
      border-bottom: 1px solid #26272b;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
    }

    .channel-heading {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 8px;
    }

    .channel-hash {
      color: #949ba4;
      font-size: 23px;
      font-weight: 500;
    }

    #channel-title {
      overflow: hidden;
      color: #f2f3f5;
      font-size: 16px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #status {
      margin-left: 16px;
      color: #949ba4;
      font-size: 12px;
      text-align: right;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 18px 0 28px;
      scroll-behavior: smooth;
    }

    .empty-state {
      display: grid;
      min-height: 100%;
      place-items: center;
      padding: 30px;
      color: #949ba4;
      font-size: 14px;
      text-align: center;
    }

    .message {
      position: relative;
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      padding: 4px 16px 4px 0;
    }

    .message:hover {
      background: rgba(4, 4, 5, 0.07);
    }

    .message.grouped {
      min-height: 22px;
      padding-top: 1px;
      padding-bottom: 1px;
    }

    .avatar {
      display: flex;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      justify-self: center;
      margin-top: 2px;
      overflow: hidden;
      border-radius: 50%;
      background: #5865f2;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      user-select: none;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .message-body {
      min-width: 0;
    }

    .message-header {
      display: flex;
      min-width: 0;
      align-items: baseline;
      gap: 8px;
      line-height: 1.3;
    }

    .author {
      overflow: hidden;
      color: #f2f3f5;
      font-size: 15px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .timestamp {
      flex-shrink: 0;
      color: #949ba4;
      font-size: 11px;
      font-weight: 400;
    }

    .content {
      margin-top: 2px;
      color: #dbdee1;
      font-size: 15px;
      line-height: 1.375rem;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .grouped-time {
      display: flex;
      align-items: center;
      justify-content: center;
      color: transparent;
      font-size: 10px;
      line-height: 22px;
      user-select: none;
    }

    .message.grouped:hover .grouped-time {
      color: #949ba4;
    }

    .attachments {
      display: flex;
      max-width: 720px;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      margin-top: 8px;
    }

    .attachment-image {
      display: block;
      max-width: min(100%, 550px);
      max-height: 500px;
      border-radius: 7px;
      object-fit: contain;
      background: #1e1f22;
    }

    .attachment-file {
      display: inline-flex;
      max-width: 100%;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border: 1px solid #1e1f22;
      border-radius: 7px;
      background: #2b2d31;
      color: #00a8fc;
      font-size: 14px;
      text-decoration: none;
      overflow-wrap: anywhere;
    }

    .attachment-file:hover {
      text-decoration: underline;
    }

    ::-webkit-scrollbar {
      width: 12px;
    }

    ::-webkit-scrollbar-track {
      background: #2b2d31;
    }

    ::-webkit-scrollbar-thumb {
      border: 3px solid #2b2d31;
      border-radius: 8px;
      background: #1a1b1e;
    }

    @media (max-width: 760px) {
      .app {
        grid-template-columns: 210px minmax(0, 1fr);
      }

      .sidebar-header {
        padding: 14px;
      }

      .message {
        grid-template-columns: 48px minmax(0, 1fr);
        padding-right: 10px;
      }

      .avatar {
        width: 34px;
        height: 34px;
        font-size: 11px;
      }

      #status {
        display: none;
      }
    }
  </style>
</head>

<body>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>Discord Archive</h1>
        <p>Saved messages and attachments</p>
      </div>

      <div class="sidebar-content">
        <div class="section-title">Servers</div>
        <div id="guild-list">
          <p style="padding: 0 8px; color: #949ba4;">
            Loading servers…
          </p>
        </div>

        <div class="section-title">Channels</div>
        <div id="channel-list">
          <p style="padding: 0 8px; color: #949ba4;">
            Select a server.
          </p>
        </div>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="channel-heading">
          <span class="channel-hash">#</span>
          <span id="channel-title">Select a channel</span>
        </div>

        <div id="status">Loading archive…</div>
      </header>

      <section id="messages" class="messages">
        <div class="empty-state">
          Select a server and channel to view archived messages.
        </div>
      </section>
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
        .replace(/#\d+$/, '')
        .trim();

      const parts = cleanName
        .split(/\s+/)
        .filter(Boolean);

      return (
        parts
          .slice(0, 2)
          .map(part => part.charAt(0).toUpperCase())
          .join('') || '?'
      );
    }

    function formatDate(value) {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return value || 'Unknown time';
      }

      return date.toLocaleString();
    }

    function formatTime(value) {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return '';
      }

      return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    function shouldGroupMessage(message, previousMessage) {
      if (!previousMessage) {
        return false;
      }

      const sameAuthor =
        message.author_id && previousMessage.author_id
          ? message.author_id === previousMessage.author_id
          : message.author_name === previousMessage.author_name;

      if (!sameAuthor) {
        return false;
      }

      const currentDate = new Date(message.created_at);
      const previousDate = new Date(previousMessage.created_at);

      if (
        Number.isNaN(currentDate.getTime()) ||
        Number.isNaN(previousDate.getTime())
      ) {
        return false;
      }

      const sameDay =
        currentDate.toDateString() === previousDate.toDateString();

      const difference =
        currentDate.getTime() - previousDate.getTime();

      return (
        sameDay &&
        difference >= 0 &&
        difference <= 5 * 60 * 1000
      );
    }

    function isImage(attachment) {
      if (attachment.content_type?.startsWith('image/')) {
        return true;
      }

      return /\.(png|jpe?g|gif|webp|bmp)$/i.test(
        attachment.original_name || ''
      );
    }

    function showMessageError(message) {
      statusElement.textContent = message;

      messagesContainer.innerHTML =
        '<div class="empty-state">' +
        escapeHtml(message) +
        '</div>';
    }

    async function loadGuilds() {
      statusElement.textContent = 'Loading servers…';

      const response = await fetch('/api/guilds');

      if (!response.ok) {
        throw new Error('Unable to load servers.');
      }

      const guilds = await response.json();

      guildList.innerHTML = '';

      if (guilds.length === 0) {
        guildList.innerHTML =
          '<p style="padding: 0 8px; color: #949ba4;">' +
          'No archived servers found.' +
          '</p>';

        statusElement.textContent =
          'No archived messages found.';

        return;
      }

      guilds.forEach(guild => {
        const button = document.createElement('button');

        button.className = 'sidebar-button';

        const guildIcon = guild.guild_icon_url
          ? (
              '<img src="' +
              escapeHtml(guild.guild_icon_url) +
              '" alt="" style="' +
              'width:24px;' +
              'height:24px;' +
              'border-radius:50%;' +
              'margin-right:8px;' +
              'vertical-align:middle;' +
              '">'
            )
          : '';

        button.innerHTML =
          guildIcon +
          '<span class="button-title">' +
          escapeHtml(guild.guild_name) +
          '</span>' +
          '<span class="button-count">' +
          guild.message_count +
          ' messages</span>';

        button.addEventListener('click', async () => {
          document
            .querySelectorAll('#guild-list .sidebar-button')
            .forEach(item => item.classList.remove('active'));

          button.classList.add('active');

          try {
            await loadChannels(guild.guild_id);
          } catch (error) {
            console.error(error);

            channelList.innerHTML =
              '<p style="padding: 0 8px; color: #949ba4;">' +
              'Unable to load channels.' +
              '</p>';

            statusElement.textContent = error.message;
          }
        });

        guildList.appendChild(button);
      });

      statusElement.textContent =
        guilds.length + ' archived server(s) found.';
    }

    async function loadChannels(guildId) {
      channelList.innerHTML =
        '<p style="padding: 0 8px; color: #949ba4;">' +
        'Loading…' +
        '</p>';

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

      if (channels.length === 0) {
        channelList.innerHTML =
          '<p style="padding: 0 8px; color: #949ba4;">' +
          'No archived channels found.' +
          '</p>';

        statusElement.textContent =
          'No archived channels found for this server.';

        return;
      }

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

        button.addEventListener('click', async () => {
          document
            .querySelectorAll('#channel-list .sidebar-button')
            .forEach(item => item.classList.remove('active'));

          button.classList.add('active');

          try {
            await loadMessages(
              channel.channel_id,
              channel.channel_name
            );
          } catch (error) {
            console.error(error);
            showMessageError(error.message);
          }
        });

        channelList.appendChild(button);
      });

      statusElement.textContent =
        channels.length + ' archived channel(s) found.';
    }

        async function loadMessages(channelId, channelName) {
      channelTitle.textContent = channelName;

      messagesContainer.innerHTML =
        '<div class="empty-state">' +
        'Loading messages…' +
        '</div>';

      statusElement.textContent = 'Loading messages…';

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

        statusElement.textContent =
          'No archived messages in this channel.';

        return;
      }

      messagesContainer.innerHTML = '';

      let previousMessage = null;

      messages.forEach(message => {
        const grouped = shouldGroupMessage(
          message,
          previousMessage
        );

        const article = document.createElement('article');

        article.className = grouped
          ? 'message grouped'
          : 'message';

        const attachments = Array.isArray(message.attachments)
          ? message.attachments
          : [];

        const attachmentsHtml = attachments
          .map(attachment => {
            const safeUrl = escapeHtml(
              attachment.viewer_url || ''
            );

            const safeName = escapeHtml(
              attachment.original_name || 'Attachment'
            );

            if (isImage(attachment)) {
              return (
                '<a href="' +
                safeUrl +
                '" target="_blank" ' +
                'rel="noopener noreferrer">' +
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
              '" target="_blank" ' +
              'rel="noopener noreferrer">' +
              '📎 ' +
              safeName +
              '</a>'
            );
          })
          .join('');

        const textContent = message.content
          ? (
              '<div class="content">' +
              escapeHtml(message.content) +
              '</div>'
            )
          : '';

        const messageContent =
          textContent +
          (
            attachmentsHtml
              ? (
                  '<div class="attachments">' +
                  attachmentsHtml +
                  '</div>'
                )
              : ''
          );

        if (grouped) {
          article.innerHTML =
            '<div class="grouped-time">' +
            escapeHtml(formatTime(message.created_at)) +
            '</div>' +
            '<div class="message-body">' +
            messageContent +
            '</div>';
        } else {
          const avatarHtml = message.author_avatar_url
            ? (
                '<div class="avatar">' +
                '<img src="' +
                escapeHtml(message.author_avatar_url) +
                '" alt="avatar">' +
                '</div>'
              )
            : (
                '<div class="avatar">' +
                escapeHtml(getInitials(message.author_name)) +
                '</div>'
              );

          article.innerHTML =
            avatarHtml +
            '<div class="message-body">' +
            '<div class="message-header">' +
            '<span class="author">' +
            escapeHtml(message.author_name) +
            '</span>' +
            '<span class="timestamp">' +
            escapeHtml(formatDate(message.created_at)) +
            '</span>' +
            '</div>' +
            messageContent +
            '</div>';
        }

        messagesContainer.appendChild(article);

        previousMessage = message;
      });

      messagesContainer.scrollTop =
        messagesContainer.scrollHeight;

      statusElement.textContent =
        messages.length + ' message(s) displayed.';
    }

    loadGuilds().catch(error => {
      console.error(error);
      showMessageError(error.message);
    });
  </script>
</body>
</html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Archive viewer running at http://localhost:${PORT}`
  );
});