# agent-knowledge-base

SQLite FTS5 knowledge base for Claude Code agents. Stores domain-specific facts with full-text search — faster and more precise than semantic memory for exact command recall, setup procedures, and error solutions.

> Part of [The Agent Crafting Table](https://github.com/Agent-Crafting-Table) — standalone Claude Code agent components.

## How It Works

```mermaid
flowchart LR
    subgraph "Write Path"
        A["kb.js add title body tags"] --> B[SQLite FTS5
kb.db]
        C[Agent solves a problem] -->|save lesson| A
    end

    subgraph "Read Path"
        D["kb.js search query"] --> E[FTS5 full-text search
ranked by relevance]
        E --> F[Highlighted matches
returned to agent]
        G["kb.js list tag"] --> H[Filter by tag
all entries]
        I["kb.js get id"] --> J[Full entry JSON]
    end

    subgraph "Agent Integration"
        K[CLAUDE.md
KB lookup rule] --> L{Agent needs info}
        L -->|topic known| D
        L -->|no KB hit| M[Agent researches
then saves to KB]
        M --> A
    end
```

```mermaid
graph TD
    subgraph "CLI Commands"
        C1["add title body tags
Insert new entry"]
        C2["search query
Full-text search with highlights"]
        C3["list [tag]
All entries, optionally filtered"]
        C4["tags
Tag frequency report"]
        C5["get id
Full JSON for one entry"]
        C6["delete id
Remove entry"]
    end

    subgraph "Storage"
        DB[(kb.db
SQLite FTS5)]
        ENV["KB_PATH env var
default: ./kb.db"]
        ENV --> DB
    end
```

## Why

Session memory is recent-only. This gives you a persistent, structured reference library that survives restarts, model switches, and context resets — and returns exact matches instead of paraphrases.

## Setup

```bash
npm install
# or: bun install
```

```bash
# Optional: set a custom DB path
export KB_PATH=/workspace/data/my-agent.db
```

## Usage

```bash
node kb.js add "SSH to prod" "ssh root@192.168.1.133 -i ~/.ssh/prod_key" "ssh,infrastructure"
node kb.js add "Fix merge conflict" "git checkout --theirs . && git add . && git rebase --continue" "git,lesson"

node kb.js search "ssh prod"
# [1] SSH to prod (ssh,infrastructure)
#     ...ssh root@>>> 192.168.1.133 <<< -i ~/.ssh/prod_key...

node kb.js list                  # all entries
node kb.js list infrastructure   # filter by tag
node kb.js tags                  # tag frequency
node kb.js get 1                 # full entry JSON
node kb.js delete 1
```

## How agents use it

Add to your `CLAUDE.md`:

```markdown
**KB lookup**: Before answering about prior setup, run `node scripts/kb.js search "<topic>"`.
**Save lessons**: When you solve a non-obvious problem, run `node scripts/kb.js add "title" "solution" "tags"`.
```

## Environment

| Var | Default | Description |
|-----|---------|-------------|
| `KB_PATH` | `./kb.db` | Path to the SQLite database file |
