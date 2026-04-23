#!/usr/bin/env node
/**
 * Knowledge Base CLI for Herc
 * Usage:
 *   node scripts/kb.js add "title" "content" "tag1,tag2"
 *   node scripts/kb.js search "query"
 *   node scripts/kb.js list [tag]
 *   node scripts/kb.js tags
 *   node scripts/kb.js get <id>
 *   node scripts/kb.js seed   - Seed from MEMORY.md/TOOLS.md
 */

const Database = require('/workspace/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'herc.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

const cmd = process.argv[2];

switch (cmd) {
  case 'add': {
    const [,, , title, content, tags] = process.argv;
    if (!title || !content) { console.error('Usage: kb.js add "title" "content" "tags"'); process.exit(1); }
    const db = getDb();
    const r = db.prepare('INSERT INTO knowledge (title, content, tags, source) VALUES (?, ?, ?, ?)').run(title, content, tags || '', 'manual');
    console.log(`Added entry #${r.lastInsertRowid}`);
    db.close();
    break;
  }
  case 'search': {
    const query = process.argv[3];
    if (!query) { console.error('Usage: kb.js search "query"'); process.exit(1); }
    const db = getDb();
    const rows = db.prepare(`
      SELECT k.id, k.title, snippet(knowledge_fts, 1, '>>>', '<<<', '...', 40) as snippet, k.tags
      FROM knowledge_fts f
      JOIN knowledge k ON k.id = f.rowid
      WHERE knowledge_fts MATCH ?
      ORDER BY rank
      LIMIT 20
    `).all(query);
    if (!rows.length) { console.log('No results.'); } 
    else { rows.forEach(r => console.log(`[${r.id}] ${r.title} (${r.tags})\n    ${r.snippet}\n`)); }
    db.close();
    break;
  }
  case 'list': {
    const tag = process.argv[3];
    const db = getDb();
    let rows;
    if (tag) {
      rows = db.prepare("SELECT id, title, tags FROM knowledge WHERE (',' || tags || ',') LIKE ('%,' || ? || ',%') ORDER BY id").all(tag);
    } else {
      rows = db.prepare('SELECT id, title, tags FROM knowledge ORDER BY id').all();
    }
    rows.forEach(r => console.log(`[${r.id}] ${r.title} (${r.tags})`));
    console.log(`\n${rows.length} entries`);
    db.close();
    break;
  }
  case 'tags': {
    const db = getDb();
    const rows = db.prepare("SELECT tags FROM knowledge WHERE tags IS NOT NULL AND tags != ''").all();
    const tagCount = {};
    rows.forEach(r => r.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    Object.entries(tagCount).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log(`${t}: ${c}`));
    db.close();
    break;
  }
  case 'get': {
    const id = process.argv[3];
    if (!id) { console.error('Usage: kb.js get <id>'); process.exit(1); }
    const db = getDb();
    const row = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id);
    if (!row) { console.log('Not found.'); } 
    else { console.log(JSON.stringify(row, null, 2)); }
    db.close();
    break;
  }
  case 'seed': {
    seed();
    break;
  }
  default:
    console.log('Commands: add, search, list, tags, get, seed');
}

function seed() {
  const db = getDb();
  const insert = db.prepare('INSERT INTO knowledge (title, content, tags, source) VALUES (?, ?, ?, ?)');
  let count = 0;
  
  const add = (title, content, tags, source = 'seed') => {
    insert.run(title, content, tags, source);
    count++;
  };

  const tx = db.transaction(() => {
    // --- Infrastructure ---
    add('Unraid Server', 'IP: 192.168.1.133, always-on Docker host. Specs: i5-13400, 32GB RAM, 52TB storage. Docker files at /mnt/user/appdata/openclaw/. Control UI: http://192.168.1.133:18789', 'infrastructure,unraid,docker', 'MEMORY.md');
    
    add('SSH - Unraid Production', 'root@192.168.1.133, key: ~/workspace/.ssh/unraid_herc', 'ssh,infrastructure,unraid', 'TOOLS.md');
    add('SSH - Unraid Staging', 'Same host (192.168.1.133), key: herc-staging@openclaw', 'ssh,infrastructure,staging', 'TOOLS.md');
    add('SSH - Kurt Mac', 'Key: ~/.ssh/unraid (ed25519, kurt@mac)', 'ssh,kurt', 'TOOLS.md');
    add('SSH - Kurt Windows PC', 'lavac@192.168.1.134, key: ~/workspace/.ssh/kurt_windows (ed25519, herc@openclaw)', 'ssh,kurt,htpc', 'TOOLS.md');
    add('WireGuard VPN', 'Kurt accesses remotely via 10.253.0.1', 'infrastructure,vpn', 'TOOLS.md');

    // --- NPM & Proxies ---
    add('Nginx Proxy Manager', 'Running on Unraid: http://192.168.1.133:81. Proxies: livingjuda.duckdns.org → Juda (3000), livingjellyfin.duckdns.org → Jellyfin (8096), livingunraid.duckdns.org → Unraid UI (8180). SSL via Let\'s Encrypt auto-renew. DuckDNS token on host. Unraid UI moved to 8180/8443 to free 80/443 for NPM.', 'infrastructure,npm,proxy,ssl', 'MEMORY.md');

    // --- Juda ---
    add('Juda - Daily Tasks App', 'Repo: github.com/livingkurt/Juda. Self-hosted on Unraid via Docker (ghcr.io/livingkurt/juda:latest). DB: PostgreSQL 15 on Unraid (192.168.1.133:5432/judaDB, password rotated 2026-02-13). GitHub Actions auto-builds on push to main. SECURE_COOKIES=true (HTTPS via NPM).', 'juda,docker,postgresql', 'MEMORY.md');

    // --- Home Assistant ---
    add('Home Assistant Setup', 'HAOS VM on Unraid (192.168.1.142:8123, 2 CPUs, 4GB RAM, autostart). HA version 2026.2.1. Voice hardware: HA Voice Preview (ESP32-S3, device 097ab1). STT: faster-whisper (local, Wyoming). TTS: Piper (local, Wyoming). Wake word: "Okay Nabu" (want "Hey Herc"). Conversation agent: OpenClaw via OpenAI-compatible endpoint at http://192.168.1.133:18789/v1/chat/completions. HA token in /mnt/user/appdata/openclaw/config/.env as HA_ACCESS_TOKEN. Integration: Extended OpenAI Conversation (HACS).', 'homeassistant,voice,infrastructure', 'MEMORY.md');

    // --- HTPC ---
    add('HTPC Project - Intel NUC', 'Intel NUC at 192.168.1.134, user: lavac. WeChip USB remote. Architecture: Kodi 21.3 Omega → PlexMod for Plex, Chrome /tv for YouTube, Chrome --app for Netflix. AHK script handles Chrome↔Kodi switching via flag file + JSON-RPC. Config tracked: github.com/livingkurt/htpc. Blocker: AHK script crashes on startup (exit code 1). TODO: Netflix Kodi add-on, harden Windows, auto-hide taskbar.', 'htpc,kodi,infrastructure', 'MEMORY.md');

    // --- Telegram ---
    add('Telegram Bot', 'Bot: @herc_short_for_hercules_bot. Kurt\'s Telegram user ID: 8562543451. Firewall rules in OPENCLAW-OUTBOUND chain for Telegram IPs (149.154.160.0/20, 91.108.x.x). Note: iptables rules not persistent across Unraid reboots.', 'telegram,bot,infrastructure', 'MEMORY.md');

    // --- Staging ---
    add('Staging Environment', 'Container: openclaw-staging (port 18790). Config: /mnt/user/appdata/openclaw-staging/config/. Workspace: /mnt/user/appdata/openclaw-staging/workspace/. Discord bot: "Herc Staging" (app ID: 1471918496660328468), responds ONLY in #herc-development. Git branch: staging (production uses main). Sync scripts: scripts/sync-from-production.sh and scripts/promote-to-production.sh.', 'staging,infrastructure,docker', 'MEMORY.md');

    // --- Secrets ---
    add('Secrets Management', 'Secrets encrypted at rest via env var substitution. .env file: /mnt/user/appdata/openclaw/config/.env (chmod 600, root only). Contains: DISCORD_BOT_TOKEN, GATEWAY_AUTH_TOKEN. openclaw.json references ${VAR_NAME}. docker-compose.yml loads via env_file directive. To rotate: edit .env on host, then docker compose down && up -d.', 'secrets,security,infrastructure', 'MEMORY.md');

    // --- Discord ---
    add('Discord Channels', '#herc-development (1471758077416964240): Dev logs, staging bot, audit reports. #glow-leds-contact (1471757682062000259): Customer email drafts.', 'discord,channels', 'TOOLS.md');

    // --- Kurt ---
    add('Kurt - User Details', 'GitHub: livingkurt. Discord ID: 676624899162374144. Telegram ID: 8562543451.', 'kurt,user', 'MEMORY.md');

    // --- Automations ---
    add('Automations - Git Backup', 'Hourly cron, commits + pushes workspace changes (job: 7528b0b4).', 'automation,git', 'MEMORY.md');
    add('Automations - Markdown Audit', 'Daily at 8am Madrid time, reviews all .md files for drift/duplication, posts summary to #herc-development (job: 5a30bcc6).', 'automation,audit', 'MEMORY.md');

    // --- QA ---
    add('QA Testing Setup', 'Headless Chrome: browserless/chrome on Unraid (port 9222). Test runner: Puppeteer inside chromium container. Scripts: /usr/src/app/ inside container. Screenshots: /tmp/qa-screenshots/ inside container.', 'qa,testing,infrastructure', 'TOOLS.md');

    // --- Preferences ---
    add('Email Humanizer', 'Use humanizer skill for customer email drafts. Always run emails through humanizer before sending.', 'preference,email,humanizer', 'MEMORY.md');
    add('Discord Behavior', 'Don\'t need @mention in guild, see all messages. Use <url> to suppress embeds. No markdown tables in Discord/WhatsApp - use bullet lists.', 'preference,discord,formatting', 'MEMORY.md');

    // --- Lessons Learned ---
    add('LESSON: Check Firewall First', 'When setting up any new external service, check the Unraid firewall (OPENCLAW-OUTBOUND chain) first and whitelist the IPs before debugging other things.', 'lesson,firewall,infrastructure', 'MEMORY.md');
    add('LESSON: Persist Everything', 'Never implement anything that would be lost on Unraid or Docker reboots — always persist configs (iptables, env vars, etc.).', 'lesson,persistence,infrastructure', 'MEMORY.md');
    add('LESSON: Test on Staging First', 'Test all infrastructure changes on staging first before applying to production.', 'lesson,staging,testing', 'MEMORY.md');
    add('LESSON: env_file Before Refs', 'Always add env_file to docker-compose.yml BEFORE patching config with ${} refs, or the gateway loses connectivity on restart.', 'lesson,docker,secrets', 'MEMORY.md');
    add('SSH Hardening', 'SSH hardened: key-only auth, no passwords, MaxAuthTries 3. SSH + git credentials persist across restarts via init.sh + mounted volumes.', 'ssh,security,lesson', 'MEMORY.md');

    // --- Active Tasks ---
    add('Active Tasks', 'TODO: Set up proactive email monitoring (contact.glowleds@gmail.com). WhatsApp setup (postponed). Persist Telegram iptables rules on Unraid (go file). Fix AHK script crash on HTPC. Set up DB backup solution.', 'tasks,todo', 'MEMORY.md');

    // --- GitHub ---
    add('GitHub Repos', 'Herc workspace: github.com/livingkurt/Herc (private). Juda: github.com/livingkurt/Juda. HTPC: github.com/livingkurt/htpc.', 'github,repos', 'MEMORY.md');
  });

  tx();
  console.log(`Seeded ${count} entries.`);
  db.close();
}
