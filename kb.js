#!/usr/bin/env node
/**
 * agent-kb — SQLite FTS5 knowledge base for Claude Code agents
 *
 * Usage:
 *   node kb.js add "title" "content" "tag1,tag2"
 *   node kb.js search "query"
 *   node kb.js list [tag]
 *   node kb.js tags
 *   node kb.js get <id>
 *   node kb.js delete <id>
 *
 * DB path: KB_PATH env var, or ./kb.db by default.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.KB_PATH || path.join(__dirname, 'kb.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      title   TEXT NOT NULL,
      content TEXT NOT NULL,
      tags    TEXT DEFAULT '',
      source  TEXT DEFAULT 'manual',
      created TEXT DEFAULT (datetime('now'))
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      title, content,
      content='knowledge', content_rowid='id'
    );
    CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
      INSERT INTO knowledge_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
      INSERT INTO knowledge_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
  `);
  return db;
}

const cmd = process.argv[2];

switch (cmd) {
  case 'add': {
    const [,, , title, content, tags] = process.argv;
    if (!title || !content) { console.error('Usage: kb.js add "title" "content" ["tags"]'); process.exit(1); }
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
    const rows = tag
      ? db.prepare("SELECT id, title, tags FROM knowledge WHERE (',' || tags || ',') LIKE ('%,' || ? || ',%') ORDER BY id").all(tag)
      : db.prepare('SELECT id, title, tags FROM knowledge ORDER BY id').all();
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
  case 'delete': {
    const id = process.argv[3];
    if (!id) { console.error('Usage: kb.js delete <id>'); process.exit(1); }
    const db = getDb();
    const r = db.prepare('DELETE FROM knowledge WHERE id = ?').run(id);
    console.log(r.changes ? `Deleted entry #${id}` : 'Not found.');
    db.close();
    break;
  }
  default:
    console.log('Commands: add, search, list, tags, get, delete');
    console.log('Env: KB_PATH — path to SQLite db (default: ./kb.db)');
}
