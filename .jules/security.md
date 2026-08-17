## 2026-07-23 - Residual SQLite Journal Files After Vault Cleanup
**Learning:** Cleaning up or securely wiping only the main database file (`quantlib_temp.db`) leaves behind temporary journal files (`quantlib_temp.db-wal` and `quantlib_temp.db-shm`), exposing plaintext data fragments on disk after vault locking or application shutdown.
**Action:** Always include associated `-wal` and `-shm` files in secure wiping (`secureWipe`) routines during application shutdown and database cleanup.
