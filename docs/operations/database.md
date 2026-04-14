<div align="center">

# 🗄️ Operations — Database

**MongoDB operations, backups, index maintenance, and common queries**

![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb)
![Mongoose](https://img.shields.io/badge/Mongoose-9.2.1-880000?style=flat-square)

</div>

---

## 📊 Overview

- **Database name:** `social-engagement-bot`
- **Connection:** `mongodb://127.0.0.1:27017/social-engagement-bot`
- **ODM:** Mongoose 9.2.1
- **Collections:** 9 (see [backend/models.md](../backend/models.md))

---

## 🔌 Connecting

### From shell
```bash
mongosh "mongodb://127.0.0.1:27017/social-engagement-bot"
```

### From Node (inside the repo)
```bash
node -e "
require('dotenv').config({path:'.env.local'});
const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGODB_URI);
  console.log('connected');
  await m.disconnect();
})();
"
```

### Connection pool
Configured in `src/lib/mongodb.ts`:
- Default: 10 connections
- Worker mode (`WORKER_PROCESS=1`): 3 connections
- `serverSelectionTimeoutMS: 5000`

---

## 📋 Quick Stats

```js
// User + post counts
use social-engagement-bot

db.users.countDocuments()
db.posts.countDocuments()
db.posts.aggregate([
  { $group: { _id: '$status', n: { $sum: 1 } } },
  { $sort: { n: -1 } }
])

// Posts by platform
db.posts.aggregate([
  { $group: { _id: '$platform', n: { $sum: 1 } } },
  { $sort: { n: -1 } }
])

// Posts posted in last 24h per platform
db.posts.aggregate([
  { $match: { status: 'posted', postedAt: { $gte: new Date(Date.now() - 24*3600*1000) } } },
  { $group: { _id: '$platform', n: { $sum: 1 } } }
])
```

---

## 🔍 Common Queries

### Recent failed tasks
```js
db.activitylogs.find({ level: 'error' })
  .sort({ createdAt: -1 })
  .limit(20)
  .forEach(l => printjson({ t: l.createdAt, p: l.platform, a: l.action, m: l.message }))
```

### One user's recent activity
```js
const U = 'user_xxxxxxxxxxxx';
db.activitylogs.find({ userId: U }).sort({ createdAt: -1 }).limit(50).forEach(printjson);
```

### Posts stuck in `evaluating` > 10 min
```js
db.posts.find({
  status: 'evaluating',
  updatedAt: { $lt: new Date(Date.now() - 10*60*1000) }
}).count()
```

### Reset stuck evaluations back to `new`
```js
db.posts.updateMany(
  { status: 'evaluating', updatedAt: { $lt: new Date(Date.now() - 10*60*1000) } },
  { $set: { status: 'new' } }
)
```

### Tasks that succeeded recently (per user, per platform)
```js
db.posts.find({
  userId: 'user_xxx',
  status: 'posted',
  postedAt: { $gte: new Date(Date.now() - 7*24*3600*1000) }
}, { url: 1, platform: 1, postedAt: 1, replyUrl: 1 })
  .sort({ postedAt: -1 })
```

### Per-platform success rate (last 7 days)
```js
db.posts.aggregate([
  { $match: { postedAt: { $gte: new Date(Date.now() - 7*24*3600*1000) } } },
  { $group: {
      _id: { platform: '$platform', status: '$status' },
      n: { $sum: 1 }
  } },
  { $sort: { '_id.platform': 1 } }
])
```

---

## 🧹 Cleanup Scripts

### Delete stale (failed) posts
```js
// Posts older than 30 days stuck in failed states
db.posts.deleteMany({
  status: { $in: ['rejected', 'skipped'] },
  scrapedAt: { $lt: new Date(Date.now() - 30*24*3600*1000) }
})
```

### Reset one user's activity log
```js
db.activitylogs.deleteMany({ userId: 'user_xxx' })
```

### Purge all test data for a user (USE WITH CARE)
```js
// Cascade delete — same as src/models/User.ts cascadeDeleteUser()
const U = 'user_xxx';
db.posts.deleteMany({ userId: U });
db.settings.deleteOne({ userId: U });
db.subscriptions.deleteOne({ userId: U });
db.accountstates.deleteMany({ userId: U });
db.activitylogs.deleteMany({ userId: U });
db.notifications.deleteMany({ userId: U });
db.twitterfolloweds.deleteMany({ userId: U });
db.extensiontasks.deleteMany({ userId: U });
db.users.deleteOne({ clerkId: U });
```

---

## 📈 Indexes

See [backend/models.md](../backend/models.md) for the full list. Key ones:

| Collection | Index | Purpose |
|---|---|---|
| `posts` | `(userId, url)` **unique** | Dedupe scraped posts |
| `posts` | `status` | Fast status filter |
| `posts` | `aiRelevanceScore -1` | Sort review queue high→low |
| `posts` | `(userId, platform, status)` | Per-user dashboard filter |
| `activitylogs` | `(userId, platform, createdAt)` | Recent-activity feed |
| `activitylogs` | `ttl: 7 days` | Auto-cleanup |
| `notifications` | `ttl: 30 days` | Auto-cleanup |
| `extensiontasks` | `ttl: 24h` on `expiresAt` | Auto-cleanup |

### List all indexes
```js
db.posts.getIndexes()
```

### Drop & rebuild an index (if corrupted)
```js
db.posts.dropIndex('userId_1_url_1')
db.posts.createIndex({ userId: 1, url: 1 }, { unique: true })
```

### Build an index in the background (non-blocking)
```js
db.posts.createIndex({ scrapedAt: -1 }, { background: true })
```

---

## 💾 Backups

### Full dump
```bash
mongodump \
  --uri="mongodb://127.0.0.1:27017/social-engagement-bot" \
  --out=/var/backups/bot-serp/$(date +%Y%m%d)
```

### Per-collection dump
```bash
mongodump \
  --uri="mongodb://127.0.0.1:27017/social-engagement-bot" \
  --collection=posts \
  --out=/tmp/posts-backup
```

### Restore
```bash
mongorestore \
  --uri="mongodb://127.0.0.1:27017/social-engagement-bot" \
  /var/backups/bot-serp/20260414/social-engagement-bot
```

### Automated daily backup (cron)
```bash
# /etc/cron.d/bot-serp-backup
0 3 * * * root mongodump --uri="mongodb://127.0.0.1:27017/social-engagement-bot" --out=/var/backups/bot-serp/$(date +\%Y\%m\%d) && find /var/backups/bot-serp -type d -mtime +14 -exec rm -rf {} \;
```

Keeps 14 days of daily backups.

---

## 🔄 Migrations

> [!NOTE]
> Mongoose adds fields schemaless-ly — adding new optional fields to a model requires no migration.
>
> For breaking changes (removing/renaming fields, changing enums), write a one-shot script in `/scripts/migrations/`.

### Example migration script template
```js
// scripts/migrations/2026-04-14-rename-field.js
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const res = await mongoose.connection.db.collection('posts').updateMany(
    { oldField: { $exists: true } },
    { $rename: { oldField: 'newField' } }
  );
  console.log(`Migrated ${res.modifiedCount} documents`);
  await mongoose.disconnect();
})();
```

Run with `node scripts/migrations/<file>.js`.

---

## 🩺 Health Checks

### Is Mongo up?
```bash
mongosh --quiet --eval 'db.adminCommand("ping")' | jq
```
Expected: `{ "ok": 1 }`.

### Connection count
```bash
mongosh --quiet --eval 'printjson(db.serverStatus().connections)'
```

### Slow queries
```bash
# Enable profiling on the DB (level 1 = slow ops >100ms)
mongosh social-engagement-bot --eval 'db.setProfilingLevel(1, { slowms: 100 })'

# Read the slow log
mongosh social-engagement-bot --eval 'db.system.profile.find().sort({ ts: -1 }).limit(10).pretty()'

# Disable profiling
mongosh social-engagement-bot --eval 'db.setProfilingLevel(0)'
```

### Disk usage per collection
```js
db.runCommand({ dbStats: 1 })
db.posts.stats()
```

---

## 🚨 Recovery Scenarios

### DB corruption
```bash
# Stop mongo
sudo systemctl stop mongod

# Run repair
sudo -u mongodb mongod --dbpath /var/lib/mongodb --repair

# Restart
sudo systemctl start mongod

# If repair fails, restore from last backup:
mongorestore --drop /var/backups/bot-serp/$(date -d yesterday +%Y%m%d)/
```

### Accidentally wiped a collection
```bash
mongorestore \
  --uri="mongodb://127.0.0.1:27017/social-engagement-bot" \
  --drop \
  --nsInclude="social-engagement-bot.posts" \
  /var/backups/bot-serp/LATEST/
```

### User data GDPR export
```js
const U = 'user_xxx';
const out = {
  user: db.users.findOne({ clerkId: U }),
  settings: db.settings.findOne({ userId: U }),
  posts: db.posts.find({ userId: U }).toArray(),
  notifications: db.notifications.find({ userId: U }).toArray(),
  activity: db.activitylogs.find({ userId: U }).toArray(),
};
printjson(out)   // or write to JSON file
```

---

## 🔐 Security

- Mongo bound to `127.0.0.1` only (not `0.0.0.0`) — never exposed externally
- No auth on local Mongo by design (trusted machine); **enable auth before exposing**:
  ```bash
  mongosh admin --eval 'db.createUser({user:"admin",pwd:"STRONG_PASSWORD",roles:["root"]})'
  # then set auth=true in /etc/mongod.conf and restart
  ```
- Backups stored under `/var/backups/` — make sure filesystem perms are `700 root:root`

---

<div align="center">

**← [Deployment](./deployment.md)** · **[Back to index](../README.md)** · **Next: [Environment](./environment.md)** →

</div>
