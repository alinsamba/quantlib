## 2026-07-23 - Database Encryption Flushes During Active SQLite Connections
**Learning:** Invoking synchronous disk reads (`fs.readFileSync`) on `quantlib_temp.db` while Prisma has an active connection can miss un-checkpointed WAL (Write-Ahead Log) pages and trigger OS file locking issues on Windows.
**Action:** Before reading or backing up SQLite database files, ensure active Prisma connections or transactions are flushed/checkpointed (`PRAGMA wal_checkpoint(FULL)`), or handle database locks gracefully before attempting atomic file updates.

## 2026-07-23 - Schema Type Safety and Payload Validation in IPC/LAN Sync
**Learning:** Using untyped `any` parameters in IPC handlers (`mergeLanSyncPayload`, `save-borrowing-rule`, `(prisma as any)`) bypasses TypeScript checks and allows malformed payloads to cause runtime exceptions or corrupt stored data.
**Action:** Enforce strict type definitions and validate all incoming IPC/LAN payload schemas before passing data to Prisma transactions.
