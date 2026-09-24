use crate::models::*;
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub struct Database {
    conn: Mutex<Option<Connection>>,
}

impl Database {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }

    pub fn is_open(&self) -> bool {
        self.conn.lock().is_some()
    }

    pub fn open(&self, path: &Path) -> Result<(), String> {
        let conn = Connection::open(path)
            .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

        conn.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS School (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                motto TEXT,
                logoPath TEXT,
                address TEXT,
                contactName TEXT,
                contactPhone TEXT,
                academicYear TEXT,
                updatedAt TEXT NOT NULL,
                checkoutDuration INTEGER NOT NULL DEFAULT 14
            );

            CREATE TABLE IF NOT EXISTS Subject (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                category TEXT,
                openingCount INTEGER NOT NULL DEFAULT 0,
                recovered INTEGER NOT NULL DEFAULT 0,
                issued INTEGER NOT NULL DEFAULT 0,
                damaged INTEGER NOT NULL DEFAULT 0,
                lost INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                averageCondition REAL NOT NULL DEFAULT 3.0,
                degradationRate REAL NOT NULL DEFAULT 0.0,
                createdAt TEXT NOT NULL DEFAULT (datetime('now')),
                updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS Incident (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                date TEXT NOT NULL,
                subjectId INTEGER,
                bookTitle TEXT NOT NULL,
                condition TEXT,
                comment TEXT,
                reportedBy TEXT,
                responsibleParty TEXT,
                studentClass TEXT,
                actionTaken TEXT,
                createdAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (subjectId) REFERENCES Subject (id) ON DELETE SET NULL ON UPDATE CASCADE
            );

            CREATE TABLE IF NOT EXISTS AuditLog (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                subjectId INTEGER NOT NULL,
                field TEXT NOT NULL,
                oldValue TEXT NOT NULL,
                newValue TEXT NOT NULL,
                changedBy TEXT,
                changedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (subjectId) REFERENCES Subject (id) ON DELETE RESTRICT ON UPDATE CASCADE
            );

            CREATE TABLE IF NOT EXISTS Checkout (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                subjectId INTEGER NOT NULL,
                studentName TEXT NOT NULL,
                studentClass TEXT,
                checkoutDate TEXT NOT NULL DEFAULT (datetime('now')),
                dueDate TEXT NOT NULL,
                returnDate TEXT,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                conditionOut INTEGER NOT NULL,
                conditionIn INTEGER,
                createdAt TEXT NOT NULL DEFAULT (datetime('now')),
                updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (subjectId) REFERENCES Subject (id) ON DELETE RESTRICT ON UPDATE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_checkout_subjectId ON Checkout(subjectId);
            CREATE INDEX IF NOT EXISTS idx_checkout_student_status ON Checkout(studentName, status);
            CREATE INDEX IF NOT EXISTS idx_checkout_due_status ON Checkout(dueDate, status);
            CREATE INDEX IF NOT EXISTS idx_incident_subjectId ON Incident(subjectId);
            CREATE INDEX IF NOT EXISTS idx_incident_responsibleParty ON Incident(responsibleParty);
            CREATE INDEX IF NOT EXISTS idx_incident_type_date ON Incident(type, date);
            CREATE INDEX IF NOT EXISTS idx_auditlog_subjectId ON AuditLog(subjectId);
            CREATE TABLE IF NOT EXISTS BorrowingRule (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                roleOrGrade TEXT NOT NULL UNIQUE,
                maxBooksAllowed INTEGER NOT NULL DEFAULT 2,
                borrowDurationDays INTEGER NOT NULL DEFAULT 14,
                finePerDay REAL NOT NULL DEFAULT 0.0,
                createdAt TEXT NOT NULL DEFAULT (datetime('now')),
                updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS StockAudit (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                auditDate TEXT NOT NULL DEFAULT (datetime('now')),
                auditedBy TEXT,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
                createdAt TEXT NOT NULL DEFAULT (datetime('now')),
                updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS StockAuditItem (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                auditId INTEGER NOT NULL,
                subjectId INTEGER NOT NULL,
                expectedCount INTEGER NOT NULL,
                actualCount INTEGER NOT NULL,
                discrepancy INTEGER NOT NULL,
                notes TEXT,
                FOREIGN KEY (auditId) REFERENCES StockAudit (id) ON DELETE CASCADE ON UPDATE CASCADE,
                FOREIGN KEY (subjectId) REFERENCES Subject (id) ON DELETE RESTRICT ON UPDATE CASCADE,
                UNIQUE (auditId, subjectId)
            );
            CREATE INDEX IF NOT EXISTS idx_stockaudititem_auditId ON StockAuditItem(auditId);
            CREATE INDEX IF NOT EXISTS idx_stockaudititem_subjectId ON StockAuditItem(subjectId);

            CREATE TABLE IF NOT EXISTS AppConfig (
                id INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
                autoBackupEnabled INTEGER NOT NULL DEFAULT 0,
                autoBackupPath TEXT,
                autoBackupIntervalHours INTEGER NOT NULL DEFAULT 24,
                lastAutoBackupAt TEXT,
                lanSyncEnabled INTEGER NOT NULL DEFAULT 0,
                lanPort INTEGER NOT NULL DEFAULT 8085,
                lanPasscode TEXT DEFAULT 'quantlib-sync',
                lastLanSyncAt TEXT,
                updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );
            "#,
        )
        .map_err(|e| format!("Failed to create database schema: {}", e))?;

        // Initialize default AppConfig if empty
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM AppConfig", [], |r| r.get(0))
            .unwrap_or(0);
        if count == 0 {
            let now = Utc::now().to_rfc3339();
            let _ = conn.execute(
                "INSERT INTO AppConfig (id, autoBackupEnabled, autoBackupIntervalHours, lanSyncEnabled, lanPort, lanPasscode, updatedAt) VALUES (1, 0, 24, 0, 8085, 'quantlib-sync', ?)",
                params![now],
            );
        }

        // Initialize default BorrowingRule if empty
        let rule_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM BorrowingRule", [], |r| r.get(0))
            .unwrap_or(0);
        if rule_count == 0 {
            let now = Utc::now().to_rfc3339();
            let default_rules = [
                ("DEFAULT", 2, 14, 0.0),
                ("S.1-S.4", 2, 14, 0.0),
                ("S.5-S.6", 4, 21, 0.0),
                ("TEACHER", 10, 30, 0.0),
            ];
            for (role, max_books, duration, fine) in default_rules {
                let _ = conn.execute(
                    "INSERT INTO BorrowingRule (roleOrGrade, maxBooksAllowed, borrowDurationDays, finePerDay, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
                    params![role, max_books, duration, fine, now, now],
                );
            }
        }

        // Initialize default School if empty
        let school_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM School", [], |r| r.get(0))
            .unwrap_or(0);
        if school_count == 0 {
            let now = Utc::now().to_rfc3339();
            let _ = conn.execute(
                r#"INSERT INTO School (id, name, motto, logoPath, address, contactName, contactPhone, academicYear, updatedAt, checkoutDuration)
                   VALUES (1, 'Mentor High School - Kitende', 'Education is the Key', NULL, 'P.O. Box 1234, Kampala', 'Library Dept', '+256 700 000 000', '2026', ?, 14)"#,
                params![now],
            );
        }

        *self.conn.lock() = Some(conn);
        Ok(())
    }

    pub fn close(&self) {
        let mut lock = self.conn.lock();
        if let Some(conn) = lock.take() {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            drop(conn);
        }
    }

    pub fn checkpoint(&self) {
        if let Some(ref conn) = *self.conn.lock() {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
    }

    fn calculate_available(opening: i64, recovered: i64, issued: i64, damaged: i64, lost: i64) -> i64 {
        std::cmp::max(0, opening + recovered - issued - damaged - lost)
    }

    pub fn get_subjects(&self) -> Result<Vec<Subject>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked. Please authenticate first.")?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, category, openingCount, recovered, issued, damaged, lost, notes, averageCondition, degradationRate, createdAt, updatedAt FROM Subject ORDER BY name ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let opening: i64 = row.get(3)?;
                let recovered: i64 = row.get(4)?;
                let issued: i64 = row.get(5)?;
                let damaged: i64 = row.get(6)?;
                let lost: i64 = row.get(7)?;
                let available = Self::calculate_available(opening, recovered, issued, damaged, lost);
                Ok(Subject {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    opening_count: opening,
                    recovered,
                    issued,
                    damaged,
                    lost,
                    notes: row.get(8)?,
                    average_condition: row.get(9)?,
                    degradation_rate: row.get(10)?,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                    available: Some(available),
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_incidents(&self) -> Result<Vec<Incident>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked. Please authenticate first.")?;

        let mut stmt = conn
            .prepare(
                r#"SELECT i.id, i.type, i.date, i.subjectId, i.bookTitle, i.condition, i.comment,
                          i.reportedBy, i.responsibleParty, i.studentClass, i.actionTaken, i.createdAt,
                          s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost,
                          s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                   FROM Incident i
                   LEFT JOIN Subject s ON i.subjectId = s.id
                   ORDER BY i.date DESC"#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let subject_id: Option<i64> = row.get(3)?;
                let subject = if let Some(sid) = subject_id {
                    let sub_name: Option<String> = row.get(12)?;
                    sub_name.map(|name| {
                        let opening: i64 = row.get(14).unwrap_or(0);
                        let recovered: i64 = row.get(15).unwrap_or(0);
                        let issued: i64 = row.get(16).unwrap_or(0);
                        let damaged: i64 = row.get(17).unwrap_or(0);
                        let lost: i64 = row.get(18).unwrap_or(0);
                        Subject {
                            id: sid,
                            name,
                            category: row.get(13).unwrap_or(None),
                            opening_count: opening,
                            recovered,
                            issued,
                            damaged,
                            lost,
                            notes: row.get(19).unwrap_or(None),
                            average_condition: row.get(20).unwrap_or(3.0),
                            degradation_rate: row.get(21).unwrap_or(0.0),
                            created_at: row.get(22).unwrap_or(None),
                            updated_at: row.get(23).unwrap_or(None),
                            available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                        }
                    })
                } else {
                    None
                };

                Ok(Incident {
                    id: row.get(0)?,
                    incident_type: row.get(1)?,
                    date: row.get(2)?,
                    subject_id,
                    book_title: row.get(4)?,
                    condition: row.get(5)?,
                    comment: row.get(6)?,
                    reported_by: row.get(7)?,
                    responsible_party: row.get(8)?,
                    student_class: row.get(9)?,
                    action_taken: row.get(10)?,
                    created_at: row.get(11)?,
                    subject,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_summary(&self) -> Result<DashboardSummary, String> {
        let subjects = self.get_subjects()?;
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked. Please authenticate first.")?;

        let overdue_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM Checkout WHERE status = 'ACTIVE' AND datetime(dueDate) < datetime('now')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let mut total_books = 0;
        let mut available = 0;
        let mut issued = 0;
        let mut damaged_lost = 0;

        for s in &subjects {
            total_books += s.opening_count + s.recovered;
            issued += s.issued;
            damaged_lost += s.damaged + s.lost;
            available += s.available.unwrap_or(0);
        }

        Ok(DashboardSummary {
            total_books,
            available,
            issued,
            damaged_lost,
            subjects,
            overdue_count,
        })
    }

    pub fn add_subject(&self, data: SubjectInput) -> Result<Subject, String> {
        let name = data.name.ok_or("Subject name is required")?;
        if name.trim().is_empty() {
            return Err("Subject name cannot be empty".into());
        }
        let category = data.category.unwrap_or_else(|| "General".to_string());
        let opening = data.opening_count.unwrap_or(0);
        if opening < 0 {
            return Err("Opening count cannot be negative".into());
        }
        let now = Utc::now().to_rfc3339();

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        conn.execute(
            "INSERT INTO Subject (name, category, openingCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
            params![name, category, opening, now, now],
        )
        .map_err(|e| e.to_string())?;

        let id = conn.last_insert_rowid();

        Ok(Subject {
            id,
            name,
            category: Some(category),
            opening_count: opening,
            recovered: 0,
            issued: 0,
            damaged: 0,
            lost: 0,
            notes: None,
            average_condition: 3.0,
            degradation_rate: 0.0,
            created_at: Some(now.clone()),
            updated_at: Some(now),
            available: Some(opening),
        })
    }

    pub fn update_subject(&self, id: i64, data: SubjectInput) -> Result<Subject, String> {
        if let Some(ref n) = data.name {
            if n.trim().is_empty() {
                return Err("Subject name cannot be empty".into());
            }
        }
        if let Some(cnt) = data.opening_count {
            if cnt < 0 {
                return Err("Opening count cannot be negative".into());
            }
        }

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;
        // Retrieve existing subject
        let existing: Subject = conn
            .query_row(
                "SELECT id, name, category, openingCount, recovered, issued, damaged, lost, notes, averageCondition, degradationRate, createdAt, updatedAt FROM Subject WHERE id = ?",
                params![id],
                |row| {
                    let opening: i64 = row.get(3)?;
                    let recovered: i64 = row.get(4)?;
                    let issued: i64 = row.get(5)?;
                    let damaged: i64 = row.get(6)?;
                    let lost: i64 = row.get(7)?;
                    Ok(Subject {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        category: row.get(2)?,
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(8)?,
                        average_condition: row.get(9)?,
                        degradation_rate: row.get(10)?,
                        created_at: row.get(11)?,
                        updated_at: row.get(12)?,
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    })
                },
            )
            .map_err(|_| "Referenced subject does not exist".to_string())?;

        let new_name = data.name.unwrap_or(existing.name.clone());
        let new_cat = data.category.or(existing.category.clone());
        let new_opening = data.opening_count.unwrap_or(existing.opening_count);
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE Subject SET name = ?, category = ?, openingCount = ?, updatedAt = ? WHERE id = ?",
            params![new_name, new_cat, new_opening, now, id],
        )
        .map_err(|e| e.to_string())?;

        // Audit logs
        if new_name != existing.name {
            let _ = conn.execute(
                "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'name', ?, ?, 'LIBRARIAN', ?)",
                params![id, existing.name, new_name, now],
            );
        }
        if new_cat != existing.category {
            let _ = conn.execute(
                "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'category', ?, ?, 'LIBRARIAN', ?)",
                params![id, existing.category.unwrap_or_default(), new_cat.clone().unwrap_or_default(), now],
            );
        }
        if new_opening != existing.opening_count {
            let _ = conn.execute(
                "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'openingCount', ?, ?, 'LIBRARIAN', ?)",
                params![id, existing.opening_count.to_string(), new_opening.to_string(), now],
            );
        }

        let available = Self::calculate_available(
            new_opening,
            existing.recovered,
            existing.issued,
            existing.damaged,
            existing.lost,
        );

        Ok(Subject {
            id,
            name: new_name,
            category: new_cat,
            opening_count: new_opening,
            recovered: existing.recovered,
            issued: existing.issued,
            damaged: existing.damaged,
            lost: existing.lost,
            notes: existing.notes,
            average_condition: existing.average_condition,
            degradation_rate: existing.degradation_rate,
            created_at: existing.created_at,
            updated_at: Some(now),
            available: Some(available),
        })
    }

    pub fn add_incident(&self, data: IncidentInput) -> Result<Incident, String> {
        if data.book_title.trim().is_empty() {
            return Err("Invalid book title".into());
        }

        let now = Utc::now().to_rfc3339();
        let date = data.date.unwrap_or_else(|| now.clone());

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let mut sub: Option<Subject> = None;
        if let Some(sid) = data.subject_id {
            let s: Subject = conn
                .query_row(
                    "SELECT id, name, category, openingCount, recovered, issued, damaged, lost, notes, averageCondition, degradationRate, createdAt, updatedAt FROM Subject WHERE id = ?",
                    params![sid],
                    |row| {
                        let opening: i64 = row.get(3)?;
                        let recovered: i64 = row.get(4)?;
                        let issued: i64 = row.get(5)?;
                        let damaged: i64 = row.get(6)?;
                        let lost: i64 = row.get(7)?;
                        Ok(Subject {
                            id: row.get(0)?,
                            name: row.get(1)?,
                            category: row.get(2)?,
                            opening_count: opening,
                            recovered,
                            issued,
                            damaged,
                            lost,
                            notes: row.get(8)?,
                            average_condition: row.get(9)?,
                            degradation_rate: row.get(10)?,
                            created_at: row.get(11)?,
                            updated_at: row.get(12)?,
                            available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                        })
                    },
                )
                .map_err(|_| "Referenced subject does not exist".to_string())?;

            let active_cid: Option<i64> = if let Some(ref party) = data.responsible_party {
                conn.query_row(
                    "SELECT id FROM Checkout WHERE subjectId = ? AND LOWER(TRIM(studentName)) = LOWER(TRIM(?)) AND status = 'ACTIVE' LIMIT 1",
                    params![sid, party],
                    |r| r.get(0),
                ).optional().unwrap_or(None)
            } else {
                None
            };

            // Update subject based on incident type
            match data.incident_type.to_uppercase().as_str() {
                "DAMAGED" => {
                    let _ = conn.execute("UPDATE Subject SET damaged = damaged + 1 WHERE id = ?", params![sid]);
                    let _ = conn.execute(
                        "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'damaged', ?, ?, 'LIBRARIAN', ?)",
                        params![sid, s.damaged.to_string(), (s.damaged + 1).to_string(), now],
                    );
                    if let Some(cid) = active_cid {
                        let _ = conn.execute("UPDATE Checkout SET status = 'RETURNED', returnDate = ?, conditionIn = 1, updatedAt = ? WHERE id = ?", params![now, now, cid]);
                        let _ = conn.execute("UPDATE Subject SET issued = MAX(0, issued - 1) WHERE id = ?", params![sid]);
                        let _ = conn.execute(
                            "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'issued', ?, ?, 'LIBRARIAN', ?)",
                            params![sid, s.issued.to_string(), (s.issued.saturating_sub(1)).to_string(), now],
                        );
                    }
                }
                "LOST" => {
                    let _ = conn.execute("UPDATE Subject SET lost = lost + 1 WHERE id = ?", params![sid]);
                    let _ = conn.execute(
                        "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'lost', ?, ?, 'LIBRARIAN', ?)",
                        params![sid, s.lost.to_string(), (s.lost + 1).to_string(), now],
                    );
                    if let Some(cid) = active_cid {
                        let _ = conn.execute("UPDATE Checkout SET status = 'LOST', returnDate = ?, updatedAt = ? WHERE id = ?", params![now, now, cid]);
                        let _ = conn.execute("UPDATE Subject SET issued = MAX(0, issued - 1) WHERE id = ?", params![sid]);
                        let _ = conn.execute(
                            "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'issued', ?, ?, 'LIBRARIAN', ?)",
                            params![sid, s.issued.to_string(), (s.issued.saturating_sub(1)).to_string(), now],
                        );
                    }
                }
                "RECOVERED" => {
                    let _ = conn.execute("UPDATE Subject SET recovered = recovered + 1 WHERE id = ?", params![sid]);
                    let _ = conn.execute(
                        "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'recovered', ?, ?, 'LIBRARIAN', ?)",
                        params![sid, s.recovered.to_string(), (s.recovered + 1).to_string(), now],
                    );
                }
                _ => {}
            }
            sub = Some(s);
        }

        conn.execute(
            r#"INSERT INTO Incident (type, date, subjectId, bookTitle, condition, comment, reportedBy, responsibleParty, studentClass, actionTaken, createdAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            params![
                data.incident_type,
                date,
                data.subject_id,
                data.book_title,
                data.condition,
                data.comment,
                data.reported_by,
                data.responsible_party,
                data.student_class,
                data.action_taken,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        let id = conn.last_insert_rowid();

        Ok(Incident {
            id,
            incident_type: data.incident_type,
            date,
            subject_id: data.subject_id,
            book_title: data.book_title,
            condition: data.condition,
            comment: data.comment,
            reported_by: data.reported_by,
            responsible_party: data.responsible_party,
            student_class: data.student_class,
            action_taken: data.action_taken,
            created_at: Some(now),
            subject: sub,
        })
    }

    pub fn get_audit_logs(&self) -> Result<Vec<AuditLog>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let mut stmt = conn
            .prepare(
                r#"SELECT a.id, a.subjectId, a.field, a.oldValue, a.newValue, a.changedBy, a.changedAt,
                          s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost,
                          s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                   FROM AuditLog a
                   LEFT JOIN Subject s ON a.subjectId = s.id
                   ORDER BY a.changedAt DESC LIMIT 100"#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let subject_id: i64 = row.get(1)?;
                let sub_name: Option<String> = row.get(7)?;
                let subject = sub_name.map(|name| {
                    let opening: i64 = row.get(9).unwrap_or(0);
                    let recovered: i64 = row.get(10).unwrap_or(0);
                    let issued: i64 = row.get(11).unwrap_or(0);
                    let damaged: i64 = row.get(12).unwrap_or(0);
                    let lost: i64 = row.get(13).unwrap_or(0);
                    Subject {
                        id: subject_id,
                        name,
                        category: row.get(8).unwrap_or(None),
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(14).unwrap_or(None),
                        average_condition: row.get(15).unwrap_or(3.0),
                        degradation_rate: row.get(16).unwrap_or(0.0),
                        created_at: row.get(17).unwrap_or(None),
                        updated_at: row.get(18).unwrap_or(None),
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    }
                });

                Ok(AuditLog {
                    id: row.get(0)?,
                    subject_id,
                    field: row.get(2)?,
                    old_value: row.get(3)?,
                    new_value: row.get(4)?,
                    changed_by: row.get(5)?,
                    changed_at: row.get(6)?,
                    subject,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_rule_for_class(&self, student_class: Option<&str>) -> Result<BorrowingRule, String> {
        let rules = self.get_borrowing_rules()?;
        let default_rule = rules
            .iter()
            .find(|r| r.role_or_grade == "DEFAULT")
            .cloned()
            .unwrap_or(BorrowingRule {
                id: 1,
                role_or_grade: "DEFAULT".into(),
                max_books_allowed: 2,
                borrow_duration_days: 14,
                fine_per_day: 0.0,
                created_at: None,
                updated_at: None,
            });

        let s_class = match student_class {
            Some(c) if !c.trim().is_empty() => c.trim().to_uppercase(),
            _ => return Ok(default_rule),
        };

        if let Some(r) = rules.iter().find(|r| r.role_or_grade.trim().to_uppercase() == s_class) {
            return Ok(r.clone());
        }

        if s_class.starts_with("S.1") || s_class.starts_with("S.2") || s_class.starts_with("S.3") || s_class.starts_with("S.4") {
            if let Some(r) = rules.iter().find(|r| r.role_or_grade == "S.1-S.4") {
                return Ok(r.clone());
            }
        }

        if s_class.starts_with("S.5") || s_class.starts_with("S.6") {
            if let Some(r) = rules.iter().find(|r| r.role_or_grade == "S.5-S.6") {
                return Ok(r.clone());
            }
        }

        if s_class.contains("TEACHER") || s_class.contains("STAFF") {
            if let Some(r) = rules.iter().find(|r| r.role_or_grade == "TEACHER") {
                return Ok(r.clone());
            }
        }

        Ok(default_rule)
    }

    pub fn add_checkout(
        &self,
        subject_id: i64,
        student_name: String,
        student_class: Option<String>,
        due_date: Option<String>,
        condition_out: Option<i64>,
    ) -> Result<Checkout, String> {
        let name = student_name.trim();
        if name.is_empty() {
            return Err("Student name is required".into());
        }
        if let Some(cout) = condition_out {
            if !(1..=3).contains(&cout) {
                return Err("Condition out must be between 1 and 3".into());
            }
        }

        let rule = self.get_rule_for_class(student_class.as_deref())?;

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;
        // Check subject availability
        let subject: Subject = conn
            .query_row(
                "SELECT id, name, category, openingCount, recovered, issued, damaged, lost, notes, averageCondition, degradationRate, createdAt, updatedAt FROM Subject WHERE id = ?",
                params![subject_id],
                |row| {
                    let opening: i64 = row.get(3)?;
                    let recovered: i64 = row.get(4)?;
                    let issued: i64 = row.get(5)?;
                    let damaged: i64 = row.get(6)?;
                    let lost: i64 = row.get(7)?;
                    Ok(Subject {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        category: row.get(2)?,
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(8)?,
                        average_condition: row.get(9)?,
                        degradation_rate: row.get(10)?,
                        created_at: row.get(11)?,
                        updated_at: row.get(12)?,
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    })
                },
            )
            .map_err(|_| "Referenced subject does not exist".to_string())?;

        if subject.available.unwrap_or(0) <= 0 {
            return Err("No available books for this subject".into());
        }


        let active_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM Checkout WHERE studentName = ? AND status = 'ACTIVE'",
                params![name],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if active_count >= rule.max_books_allowed {
            return Err(format!(
                "Borrowing limit exceeded: {} already has {} active book(s) checked out (max allowed for {}: {}).",
                name, active_count, rule.role_or_grade, rule.max_books_allowed
            ));
        }

        let now = Utc::now();
        let now_str = now.to_rfc3339();
        let calculated_due = match due_date {
            Some(d) if !d.trim().is_empty() => d,
            _ => (now + chrono::Duration::days(rule.borrow_duration_days)).to_rfc3339(),
        };
        let cond_out = condition_out.unwrap_or(3);

        conn.execute(
            r#"INSERT INTO Checkout (subjectId, studentName, studentClass, checkoutDate, dueDate, status, conditionOut, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)"#,
            params![
                subject_id,
                name,
                student_class,
                now_str,
                calculated_due,
                cond_out,
                now_str,
                now_str
            ],
        )
        .map_err(|e| e.to_string())?;

        let id = conn.last_insert_rowid();

        // Increment issued count on subject
        conn.execute("UPDATE Subject SET issued = issued + 1 WHERE id = ?", params![subject_id])
            .map_err(|e| e.to_string())?;

        let _ = conn.execute(
            "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'issued', ?, ?, 'LIBRARIAN', ?)",
            params![subject_id, subject.issued.to_string(), (subject.issued + 1).to_string(), now_str],
        );

        Ok(Checkout {
            id,
            subject_id,
            student_name: name.to_string(),
            student_class,
            checkout_date: now_str.clone(),
            due_date: calculated_due,
            return_date: None,
            status: "ACTIVE".to_string(),
            condition_out: cond_out,
            condition_in: None,
            created_at: Some(now_str.clone()),
            updated_at: Some(now_str),
            subject: Some(subject),
        })
    }

    pub fn return_checkout(&self, id: i64, condition_in: Option<i64>) -> Result<Checkout, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let existing: Checkout = conn
            .query_row(
                "SELECT id, subjectId, studentName, studentClass, checkoutDate, dueDate, returnDate, status, conditionOut, conditionIn, createdAt, updatedAt FROM Checkout WHERE id = ?",
                params![id],
                |r| {
                    Ok(Checkout {
                        id: r.get(0)?,
                        subject_id: r.get(1)?,
                        student_name: r.get(2)?,
                        student_class: r.get(3)?,
                        checkout_date: r.get(4)?,
                        due_date: r.get(5)?,
                        return_date: r.get(6)?,
                        status: r.get(7)?,
                        condition_out: r.get(8)?,
                        condition_in: r.get(9)?,
                        created_at: r.get(10)?,
                        updated_at: r.get(11)?,
                        subject: None,
                    })
                },
            )
            .map_err(|_| "Checkout record not found".to_string())?;

        if existing.status != "ACTIVE" {
            return Err("Checkout is not active".into());
        }

        let now = Utc::now().to_rfc3339();
        if let Some(cin) = condition_in {
            if !(1..=3).contains(&cin) {
                return Err("Condition in must be between 1 and 3".into());
            }
        }
        let cond_in = condition_in.unwrap_or(existing.condition_out);
        conn.execute(
            "UPDATE Checkout SET status = 'RETURNED', returnDate = ?, conditionIn = ?, updatedAt = ? WHERE id = ?",
            params![now, cond_in, now, id],
        )
        .map_err(|e| e.to_string())?;

        // Retrieve subject to decrement issued and update degradation
        let subject: Option<Subject> = conn
            .query_row(
                "SELECT id, name, category, openingCount, recovered, issued, damaged, lost, notes, averageCondition, degradationRate, createdAt, updatedAt FROM Subject WHERE id = ?",
                params![existing.subject_id],
                |row| {
                    let opening: i64 = row.get(3)?;
                    let recovered: i64 = row.get(4)?;
                    let issued: i64 = row.get(5)?;
                    let damaged: i64 = row.get(6)?;
                    let lost: i64 = row.get(7)?;
                    Ok(Subject {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        category: row.get(2)?,
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(8)?,
                        average_condition: row.get(9)?,
                        degradation_rate: row.get(10)?,
                        created_at: row.get(11)?,
                        updated_at: row.get(12)?,
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    })
                },
            )
            .optional()
            .unwrap_or(None);

        if let Some(sub) = subject {
            let total_books = sub.opening_count + sub.recovered - sub.lost - sub.damaged;
            let condition_loss = (existing.condition_out - cond_in) as f64;
            let condition_shift = if total_books > 0 {
                condition_loss / (total_books as f64)
            } else {
                condition_loss
            };
            let new_average_condition = (sub.average_condition - condition_shift).max(1.0);

            // Compute new degradation rate
            let mut stmt = conn
                .prepare("SELECT conditionOut, conditionIn FROM Checkout WHERE subjectId = ? AND status = 'RETURNED' AND conditionIn IS NOT NULL")
                .map_err(|e| e.to_string())?;
            let mut total_deg = 0.0;
            let mut deg_count = 0;
            if let Ok(rows) = stmt.query_map(params![sub.id], |r| {
                let cout: i64 = r.get(0)?;
                let cin: i64 = r.get(1)?;
                Ok((cout - cin) as f64)
            }) {
                for loss in rows.flatten() {
                    total_deg += loss;
                    deg_count += 1;
                }
            }
            let new_deg_rate = if deg_count > 0 { total_deg / (deg_count as f64) } else { 0.0 };

            let new_issued = (sub.issued - 1).max(0);
            conn.execute(
                "UPDATE Subject SET issued = ?, degradationRate = ?, averageCondition = ?, updatedAt = ? WHERE id = ?",
                params![new_issued, new_deg_rate, new_average_condition, now, sub.id],
            )
            .map_err(|e| e.to_string())?;

            let _ = conn.execute(
                "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'issued', ?, ?, 'LIBRARIAN', ?)",
                params![sub.id, sub.issued.to_string(), new_issued.to_string(), now],
            );
        }

        Ok(Checkout {
            id,
            subject_id: existing.subject_id,
            student_name: existing.student_name,
            student_class: existing.student_class,
            checkout_date: existing.checkout_date,
            due_date: existing.due_date,
            return_date: Some(now.clone()),
            status: "RETURNED".to_string(),
            condition_out: existing.condition_out,
            condition_in: Some(cond_in),
            created_at: existing.created_at,
            updated_at: Some(now),
            subject: None,
        })
    }

    pub fn get_active_checkouts(&self, subject_id: Option<i64>) -> Result<Vec<Checkout>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let (sql, params_vec): (&str, Vec<rusqlite::types::Value>) = if let Some(sid) = subject_id {
            (
                r#"SELECT c.id, c.subjectId, c.studentName, c.studentClass, c.checkoutDate, c.dueDate, c.returnDate, c.status, c.conditionOut, c.conditionIn, c.createdAt, c.updatedAt,
                          s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost, s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                   FROM Checkout c
                   LEFT JOIN Subject s ON c.subjectId = s.id
                   WHERE c.status = 'ACTIVE' AND c.subjectId = ?
                   ORDER BY c.checkoutDate DESC"#,
                vec![rusqlite::types::Value::Integer(sid)],
            )
        } else {
            (
                r#"SELECT c.id, c.subjectId, c.studentName, c.studentClass, c.checkoutDate, c.dueDate, c.returnDate, c.status, c.conditionOut, c.conditionIn, c.createdAt, c.updatedAt,
                          s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost, s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                   FROM Checkout c
                   LEFT JOIN Subject s ON c.subjectId = s.id
                   WHERE c.status = 'ACTIVE'
                   ORDER BY c.checkoutDate DESC"#,
                vec![],
            )
        };

        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params_vec), |row| {
                let sid: i64 = row.get(1)?;
                let sub_name: Option<String> = row.get(12)?;
                let subject = sub_name.map(|name| {
                    let opening: i64 = row.get(14).unwrap_or(0);
                    let recovered: i64 = row.get(15).unwrap_or(0);
                    let issued: i64 = row.get(16).unwrap_or(0);
                    let damaged: i64 = row.get(17).unwrap_or(0);
                    let lost: i64 = row.get(18).unwrap_or(0);
                    Subject {
                        id: sid,
                        name,
                        category: row.get(13).unwrap_or(None),
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(19).unwrap_or(None),
                        average_condition: row.get(20).unwrap_or(3.0),
                        degradation_rate: row.get(21).unwrap_or(0.0),
                        created_at: row.get(22).unwrap_or(None),
                        updated_at: row.get(23).unwrap_or(None),
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    }
                });

                Ok(Checkout {
                    id: row.get(0)?,
                    subject_id: sid,
                    student_name: row.get(2)?,
                    student_class: row.get(3)?,
                    checkout_date: row.get(4)?,
                    due_date: row.get(5)?,
                    return_date: row.get(6)?,
                    status: row.get(7)?,
                    condition_out: row.get(8)?,
                    condition_in: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    subject,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_overdue_checkouts(&self) -> Result<Vec<Checkout>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let mut stmt = conn
            .prepare(
                r#"SELECT c.id, c.subjectId, c.studentName, c.studentClass, c.checkoutDate, c.dueDate, c.returnDate, c.status, c.conditionOut, c.conditionIn, c.createdAt, c.updatedAt,
                          s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost, s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                   FROM Checkout c
                   LEFT JOIN Subject s ON c.subjectId = s.id
                   WHERE c.status = 'ACTIVE' AND datetime(c.dueDate) < datetime('now')
                   ORDER BY c.dueDate ASC"#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let sid: i64 = row.get(1)?;
                let sub_name: Option<String> = row.get(12)?;
                let subject = sub_name.map(|name| {
                    let opening: i64 = row.get(14).unwrap_or(0);
                    let recovered: i64 = row.get(15).unwrap_or(0);
                    let issued: i64 = row.get(16).unwrap_or(0);
                    let damaged: i64 = row.get(17).unwrap_or(0);
                    let lost: i64 = row.get(18).unwrap_or(0);
                    Subject {
                        id: sid,
                        name,
                        category: row.get(13).unwrap_or(None),
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(19).unwrap_or(None),
                        average_condition: row.get(20).unwrap_or(3.0),
                        degradation_rate: row.get(21).unwrap_or(0.0),
                        created_at: row.get(22).unwrap_or(None),
                        updated_at: row.get(23).unwrap_or(None),
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    }
                });

                Ok(Checkout {
                    id: row.get(0)?,
                    subject_id: sid,
                    student_name: row.get(2)?,
                    student_class: row.get(3)?,
                    checkout_date: row.get(4)?,
                    due_date: row.get(5)?,
                    return_date: row.get(6)?,
                    status: row.get(7)?,
                    condition_out: row.get(8)?,
                    condition_in: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    subject,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn calculate_clearance(&self, student_name: &str, student_class: Option<&str>) -> Result<ClearanceRecord, String> {
        let s_name = student_name.trim();
        if s_name.is_empty() {
            return Err("Invalid student name".into());
        }

        let all_active = self.get_active_checkouts(None)?;
        let active_checkouts: Vec<Checkout> = all_active
            .into_iter()
            .filter(|c| {
                c.student_name.trim().eq_ignore_ascii_case(s_name)
                    && (student_class.is_none()
                        || c.student_class
                            .as_deref()
                            .unwrap_or("")
                            .trim()
                            .eq_ignore_ascii_case(student_class.unwrap_or("").trim()))
            })
            .collect();

        let all_incidents = self.get_incidents()?;
        let student_incidents: Vec<Incident> = all_incidents
            .into_iter()
            .filter(|i| {
                i.responsible_party
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .eq_ignore_ascii_case(s_name)
                    && (student_class.is_none()
                        || i.student_class.is_none()
                        || i.student_class
                            .as_deref()
                            .unwrap_or("")
                            .trim()
                            .eq_ignore_ascii_case(student_class.unwrap_or("").trim()))
            })
            .collect();

        let unresolved_incidents: Vec<Incident> = student_incidents
            .iter()
            .filter(|i| {
                let action = i.action_taken.as_deref().unwrap_or("").to_uppercase();
                !action.contains("RESOLVED") && !action.contains("PAID") && !action.contains("WAIVED")
            })
            .cloned()
            .collect();

        let rule = self.get_rule_for_class(student_class)?;
        let now = Utc::now();
        let mut overdue_fines = 0.0;
        for c in &active_checkouts {
            if let Ok(due) = chrono::DateTime::parse_from_rfc3339(&c.due_date) {
                if due < now {
                    let diff_days = (now - due.with_timezone(&Utc)).num_days() + 1;
                    overdue_fines += (diff_days as f64) * rule.fine_per_day;
                }
            }
        }

        let mut incident_charges = 0.0;
        for inc in &unresolved_incidents {
            match inc.incident_type.to_uppercase().as_str() {
                "LOST" => incident_charges += 25.0,
                "DAMAGED" => incident_charges += 10.0,
                _ => incident_charges += 5.0,
            }
        }

        let total_replacement_charges = overdue_fines + incident_charges;
        let is_cleared = active_checkouts.is_empty() && unresolved_incidents.is_empty();
        let status = if is_cleared { "CLEARED" } else { "HOLD" };

        Ok(ClearanceRecord {
            student_name: s_name.to_string(),
            student_class: student_class.map(|s| s.to_string()),
            status: status.to_string(),
            active_checkouts,
            incidents: student_incidents,
            unresolved_incidents,
            total_replacement_charges,
            clearance_decision: None,
            school: None,
            student: None,
            timestamp: None,
        })
    }

    pub fn record_fine_payment(
        &self,
        student_name: &str,
        student_class: Option<&str>,
        amount: f64,
        payment_method: Option<&str>,
        notes: Option<&str>,
    ) -> Result<ClearanceRecord, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let s_name = student_name.trim();
        if s_name.is_empty() {
            return Err("Student name cannot be empty".into());
        }
        if amount <= 0.0 || amount.is_nan() || amount.is_infinite() {
            return Err("Payment amount must be greater than zero".into());
        }
        let method = payment_method.unwrap_or("Cash");
        let date_str = Utc::now().format("%Y-%m-%d").to_string();
        let action_note = format!(
            "PAID ({} - ${:.2}{}) on {}",
            method,
            amount,
            notes.map(|n| format!(" - {}", n)).unwrap_or_default(),
            date_str
        );

        conn.execute(
            r#"UPDATE Incident
               SET actionTaken = ?
               WHERE LOWER(TRIM(responsibleParty)) = LOWER(?)
                 AND (actionTaken IS NULL OR (actionTaken NOT LIKE '%PAID%' AND actionTaken NOT LIKE '%WAIVED%' AND actionTaken NOT LIKE '%RESOLVED%'))"#,
            params![action_note, s_name],
        )
        .map_err(|e| e.to_string())?;

        drop(lock);
        self.calculate_clearance(student_name, student_class)
    }

    pub fn waive_fine(
        &self,
        student_name: &str,
        student_class: Option<&str>,
        reason: &str,
        approved_by: Option<&str>,
    ) -> Result<ClearanceRecord, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let s_name = student_name.trim();
        if s_name.is_empty() {
            return Err("Student name cannot be empty".into());
        }
        if reason.trim().is_empty() {
            return Err("Reason for waiver cannot be empty".into());
        }
        let approver = approved_by.unwrap_or("LIBRARIAN");
        let date_str = Utc::now().format("%Y-%m-%d").to_string();
        let action_note = format!("WAIVED (Reason: {} by {}) on {}", reason.trim(), approver, date_str);

        conn.execute(
            r#"UPDATE Incident
               SET actionTaken = ?
               WHERE LOWER(TRIM(responsibleParty)) = LOWER(?)
                 AND (actionTaken IS NULL OR (actionTaken NOT LIKE '%PAID%' AND actionTaken NOT LIKE '%WAIVED%' AND actionTaken NOT LIKE '%RESOLVED%'))"#,
            params![action_note, s_name],
        )
        .map_err(|e| e.to_string())?;

        drop(lock);
        self.calculate_clearance(student_name, student_class)
    }

    pub fn generate_clearance_slip(&self, student_name: &str, student_class: Option<&str>) -> Result<ClearanceRecord, String> {
        let mut clearance = self.calculate_clearance(student_name, student_class)?;
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let school: SchoolInfo = conn
            .query_row(
                "SELECT name, motto, logoPath, address, contactPhone, academicYear FROM School LIMIT 1",
                [],
                |r| {
                    Ok(SchoolInfo {
                        name: r.get(0)?,
                        motto: r.get(1)?,
                        logo_path: r.get(2)?,
                        address: r.get(3)?,
                        contact_phone: r.get(4)?,
                        academic_year: r.get(5)?,
                    })
                },
            )
            .unwrap_or(SchoolInfo {
                name: "Mentor High School - Kitende".into(),
                motto: Some("Education is the Key".into()),
                logo_path: None,
                address: Some("P.O. Box 1234, Kampala".into()),
                contact_phone: Some("+256 700 000 000".into()),
                academic_year: Some("2026".into()),
            });

        let decision = if clearance.status == "CLEARED" {
            "CLEARED - Student has returned all materials and cleared all outstanding obligations."
        } else {
            "HOLD - Clearance withheld due to outstanding checkouts or unaddressed incidents."
        };

        clearance.clearance_decision = Some(decision.to_string());
        clearance.school = Some(school);
        clearance.student = Some(StudentInfo {
            student_name: clearance.student_name.clone(),
            student_class: clearance.student_class.clone(),
        });
        clearance.timestamp = Some(Utc::now().to_rfc3339());

        Ok(clearance)
    }

    pub fn get_borrowing_rules(&self) -> Result<Vec<BorrowingRule>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let mut stmt = conn
            .prepare("SELECT id, roleOrGrade, maxBooksAllowed, borrowDurationDays, finePerDay, createdAt, updatedAt FROM BorrowingRule ORDER BY id ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(BorrowingRule {
                    id: row.get(0)?,
                    role_or_grade: row.get(1)?,
                    max_books_allowed: row.get(2)?,
                    borrow_duration_days: row.get(3)?,
                    fine_per_day: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn save_borrowing_rule(&self, data: BorrowingRuleInput) -> Result<BorrowingRule, String> {
        let role = data.role_or_grade.ok_or("Invalid role or grade")?;
        let role_trim = role.trim().to_uppercase();
        let max_books = data.max_books_allowed.unwrap_or(2);
        let duration = data.borrow_duration_days.unwrap_or(14);
        let fine = data.fine_per_day.unwrap_or(0.0);
        let now = Utc::now().to_rfc3339();

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        conn.execute(
            r#"INSERT INTO BorrowingRule (roleOrGrade, maxBooksAllowed, borrowDurationDays, finePerDay, createdAt, updatedAt)
               VALUES (?1, ?2, ?3, ?4, ?5, ?5)
               ON CONFLICT(roleOrGrade) DO UPDATE SET
                   maxBooksAllowed = ?2,
                   borrowDurationDays = ?3,
                   finePerDay = ?4,
                   updatedAt = ?5"#,
            params![role_trim, max_books, duration, fine, now],
        )
        .map_err(|e| e.to_string())?;

        let rule: BorrowingRule = conn
            .query_row(
                "SELECT id, roleOrGrade, maxBooksAllowed, borrowDurationDays, finePerDay, createdAt, updatedAt FROM BorrowingRule WHERE roleOrGrade = ?",
                params![role_trim],
                |r| {
                    Ok(BorrowingRule {
                        id: r.get(0)?,
                        role_or_grade: r.get(1)?,
                        max_books_allowed: r.get(2)?,
                        borrow_duration_days: r.get(3)?,
                        fine_per_day: r.get(4)?,
                        created_at: r.get(5)?,
                        updated_at: r.get(6)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;

        Ok(rule)
    }

    pub fn delete_borrowing_rule(&self, id: i64) -> Result<(), String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let role: Option<String> = conn
            .query_row("SELECT roleOrGrade FROM BorrowingRule WHERE id = ?", params![id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some(r) = role {
            if r == "DEFAULT" {
                return Err("Cannot delete the DEFAULT borrowing rule".into());
            }
            conn.execute("DELETE FROM BorrowingRule WHERE id = ?", params![id])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn create_stock_audit(&self, audited_by: Option<String>, notes: Option<String>) -> Result<StockAudit, String> {
        let subjects = self.get_subjects()?;
        let now = Utc::now().to_rfc3339();
        let auditor = audited_by.unwrap_or_else(|| "LIBRARIAN".into());

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        conn.execute(
            "INSERT INTO StockAudit (auditDate, auditedBy, notes, status, createdAt, updatedAt) VALUES (?, ?, ?, 'IN_PROGRESS', ?, ?)",
            params![now, auditor, notes, now, now],
        )
        .map_err(|e| e.to_string())?;

        let audit_id = conn.last_insert_rowid();

        let mut items = Vec::new();
        for s in subjects {
            let exp = s.available.unwrap_or(0);
            conn.execute(
                "INSERT INTO StockAuditItem (auditId, subjectId, expectedCount, actualCount, discrepancy, notes) VALUES (?, ?, ?, ?, 0, NULL)",
                params![audit_id, s.id, exp, exp],
            )
            .map_err(|e| e.to_string())?;

            let item_id = conn.last_insert_rowid();
            items.push(StockAuditItem {
                id: item_id,
                audit_id,
                subject_id: s.id,
                expected_count: exp,
                actual_count: exp,
                discrepancy: 0,
                notes: None,
                subject: Some(s),
            });
        }

        Ok(StockAudit {
            id: audit_id,
            audit_date: now.clone(),
            audited_by: Some(auditor),
            notes,
            status: "IN_PROGRESS".into(),
            created_at: Some(now.clone()),
            updated_at: Some(now),
            items: Some(items),
            summary: None,
        })
    }

    pub fn save_stock_audit_item(&self, audit_id: i64, subject_id: i64, actual_count: i64, notes: Option<String>) -> Result<StockAuditItem, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let audit_status: String = conn
            .query_row("SELECT status FROM StockAudit WHERE id = ?", params![audit_id], |r| r.get(0))
            .map_err(|_| "Stock audit not found".to_string())?;

        if audit_status == "COMPLETED" {
            return Err("Cannot edit a completed audit".into());
        }

        let subject: Subject = conn
            .query_row(
                "SELECT id, name, category, openingCount, recovered, issued, damaged, lost, notes, averageCondition, degradationRate, createdAt, updatedAt FROM Subject WHERE id = ?",
                params![subject_id],
                |row| {
                    let opening: i64 = row.get(3)?;
                    let recovered: i64 = row.get(4)?;
                    let issued: i64 = row.get(5)?;
                    let damaged: i64 = row.get(6)?;
                    let lost: i64 = row.get(7)?;
                    Ok(Subject {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        category: row.get(2)?,
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(8)?,
                        average_condition: row.get(9)?,
                        degradation_rate: row.get(10)?,
                        created_at: row.get(11)?,
                        updated_at: row.get(12)?,
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    })
                },
            )
            .map_err(|_| "Referenced subject does not exist".to_string())?;

        let expected_count = subject.available.unwrap_or(0);
        let discrepancy = actual_count - expected_count;

        conn.execute(
            r#"INSERT INTO StockAuditItem (auditId, subjectId, expectedCount, actualCount, discrepancy, notes)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(auditId, subjectId) DO UPDATE SET
                   expectedCount = ?3,
                   actualCount = ?4,
                   discrepancy = ?5,
                   notes = COALESCE(?6, notes)"#,
            params![audit_id, subject_id, expected_count, actual_count, discrepancy, notes],
        )
        .map_err(|e| e.to_string())?;

        let item_id: i64 = conn
            .query_row(
                "SELECT id FROM StockAuditItem WHERE auditId = ? AND subjectId = ?",
                params![audit_id, subject_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;

        Ok(StockAuditItem {
            id: item_id,
            audit_id,
            subject_id,
            expected_count,
            actual_count,
            discrepancy,
            notes,
            subject: Some(subject),
        })
    }

    pub fn complete_stock_audit(&self, audit_id: i64, notes: Option<String>) -> Result<StockAudit, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let (current_status, existing_notes): (String, Option<String>) = conn
            .query_row(
                "SELECT status, notes FROM StockAudit WHERE id = ?",
                params![audit_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "Stock audit not found".to_string())?;

        if current_status == "COMPLETED" {
            return Err("Stock audit is already completed".into());
        }

        let now = Utc::now().to_rfc3339();
        let final_notes = notes.or(existing_notes);

        conn.execute(
            "UPDATE StockAudit SET status = 'COMPLETED', notes = ?, updatedAt = ? WHERE id = ?",
            params![final_notes, now, audit_id],
        )
        .map_err(|e| e.to_string())?;

        // Retrieve items to update subject lost count for missing items
        let mut stmt = conn
            .prepare(
                r#"SELECT i.id, i.auditId, i.subjectId, i.expectedCount, i.actualCount, i.discrepancy, i.notes,
                          s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost, s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                   FROM StockAuditItem i
                   LEFT JOIN Subject s ON i.subjectId = s.id
                   WHERE i.auditId = ?"#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![audit_id], |row| {
                let sid: i64 = row.get(2)?;
                let sub_name: Option<String> = row.get(7)?;
                let subject = sub_name.map(|name| {
                    let opening: i64 = row.get(9).unwrap_or(0);
                    let recovered: i64 = row.get(10).unwrap_or(0);
                    let issued: i64 = row.get(11).unwrap_or(0);
                    let damaged: i64 = row.get(12).unwrap_or(0);
                    let lost: i64 = row.get(13).unwrap_or(0);
                    Subject {
                        id: sid,
                        name,
                        category: row.get(8).unwrap_or(None),
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(14).unwrap_or(None),
                        average_condition: row.get(15).unwrap_or(3.0),
                        degradation_rate: row.get(16).unwrap_or(0.0),
                        created_at: row.get(17).unwrap_or(None),
                        updated_at: row.get(18).unwrap_or(None),
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    }
                });

                Ok(StockAuditItem {
                    id: row.get(0)?,
                    audit_id: row.get(1)?,
                    subject_id: sid,
                    expected_count: row.get(3)?,
                    actual_count: row.get(4)?,
                    discrepancy: row.get(5)?,
                    notes: row.get(6)?,
                    subject,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        let mut total_expected = 0;
        let mut total_actual = 0;
        let mut total_discrepancy = 0;
        let mut missing_items = 0;
        let mut misplaced_items = 0;

        for r in rows {
            let item = r.map_err(|e| e.to_string())?;
            total_expected += item.expected_count;
            total_actual += item.actual_count;
            total_discrepancy += item.discrepancy;

            if item.discrepancy < 0 {
                let lost_qty = item.discrepancy.abs();
                missing_items += lost_qty;
                if let Some(ref sub) = item.subject {
                    let _ = conn.execute("UPDATE Subject SET lost = lost + ? WHERE id = ?", params![lost_qty, sub.id]);
                    let _ = conn.execute(
                        "INSERT INTO AuditLog (subjectId, field, oldValue, newValue, changedBy, changedAt) VALUES (?, 'lost', ?, ?, 'AUDIT_AUTO', ?)",
                        params![sub.id, sub.lost.to_string(), (sub.lost + lost_qty).to_string(), now],
                    );
                }
            } else if item.discrepancy > 0 {
                misplaced_items += item.discrepancy;
            }

            items.push(item);
        }

        let summary = StockAuditSummary {
            total_subjects: items.len() as i64,
            total_expected,
            total_actual,
            total_discrepancy,
            missing_items,
            misplaced_items,
        };

        Ok(StockAudit {
            id: audit_id,
            audit_date: now.clone(),
            audited_by: None,
            notes: final_notes,
            status: "COMPLETED".into(),
            created_at: Some(now.clone()),
            updated_at: Some(now),
            items: Some(items),
            summary: Some(summary),
        })
    }

    pub fn get_stock_audits(&self, id: Option<i64>) -> Result<Vec<StockAudit>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        if let Some(target_id) = id {
            let audit: StockAudit = conn
                .query_row(
                    "SELECT id, auditDate, auditedBy, notes, status, createdAt, updatedAt FROM StockAudit WHERE id = ?",
                    params![target_id],
                    |r| {
                        Ok(StockAudit {
                            id: r.get(0)?,
                            audit_date: r.get(1)?,
                            audited_by: r.get(2)?,
                            notes: r.get(3)?,
                            status: r.get(4)?,
                            created_at: r.get(5)?,
                            updated_at: r.get(6)?,
                            items: None,
                            summary: None,
                        })
                    },
                )
                .map_err(|_| "Audit not found".to_string())?;

            // Retrieve items
            let mut stmt = conn
                .prepare(
                    r#"SELECT i.id, i.auditId, i.subjectId, i.expectedCount, i.actualCount, i.discrepancy, i.notes,
                              s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost, s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                       FROM StockAuditItem i
                       LEFT JOIN Subject s ON i.subjectId = s.id
                       WHERE i.auditId = ?"#,
                )
                .map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map(params![target_id], |row| {
                    let sid: i64 = row.get(2)?;
                    let sub_name: Option<String> = row.get(7)?;
                    let subject = sub_name.map(|name| {
                        let opening: i64 = row.get(9).unwrap_or(0);
                        let recovered: i64 = row.get(10).unwrap_or(0);
                        let issued: i64 = row.get(11).unwrap_or(0);
                        let damaged: i64 = row.get(12).unwrap_or(0);
                        let lost: i64 = row.get(13).unwrap_or(0);
                        Subject {
                            id: sid,
                            name,
                            category: row.get(8).unwrap_or(None),
                            opening_count: opening,
                            recovered,
                            issued,
                            damaged,
                            lost,
                            notes: row.get(14).unwrap_or(None),
                            average_condition: row.get(15).unwrap_or(3.0),
                            degradation_rate: row.get(16).unwrap_or(0.0),
                            created_at: row.get(17).unwrap_or(None),
                            updated_at: row.get(18).unwrap_or(None),
                            available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                        }
                    });

                    Ok(StockAuditItem {
                        id: row.get(0)?,
                        audit_id: row.get(1)?,
                        subject_id: sid,
                        expected_count: row.get(3)?,
                        actual_count: row.get(4)?,
                        discrepancy: row.get(5)?,
                        notes: row.get(6)?,
                        subject,
                    })
                })
                .map_err(|e| e.to_string())?;

            let mut items = Vec::new();
            for r in rows {
                items.push(r.map_err(|e| e.to_string())?);
            }

            return Ok(vec![StockAudit {
                items: Some(items),
                ..audit
            }]);
        }

        let mut stmt = conn
            .prepare("SELECT id, auditDate, auditedBy, notes, status, createdAt, updatedAt FROM StockAudit ORDER BY auditDate DESC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| {
                Ok(StockAudit {
                    id: r.get(0)?,
                    audit_date: r.get(1)?,
                    audited_by: r.get(2)?,
                    notes: r.get(3)?,
                    status: r.get(4)?,
                    created_at: r.get(5)?,
                    updated_at: r.get(6)?,
                    items: None,
                    summary: None,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_backup_config(&self) -> Result<BackupConfig, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        conn.query_row(
            "SELECT autoBackupEnabled, autoBackupIntervalHours, autoBackupPath, lastAutoBackupAt FROM AppConfig WHERE id = 1",
            [],
            |r| {
                let enabled_num: i64 = r.get(0)?;
                Ok(BackupConfig {
                    auto_backup_enabled: enabled_num != 0,
                    auto_backup_interval_hours: r.get(1)?,
                    auto_backup_path: r.get(2)?,
                    last_auto_backup_at: r.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn save_backup_config(&self, data: BackupConfigInput) -> Result<BackupConfig, String> {
        let current = self.get_backup_config().unwrap_or(BackupConfig {
            auto_backup_enabled: false,
            auto_backup_interval_hours: 24,
            auto_backup_path: None,
            last_auto_backup_at: None,
        });

        let enabled = data.auto_backup_enabled.unwrap_or(current.auto_backup_enabled);
        let hours = data.auto_backup_interval_hours.unwrap_or(current.auto_backup_interval_hours);
        let path = data.auto_backup_path.or(current.auto_backup_path);
        let now = Utc::now().to_rfc3339();

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        conn.execute(
            "UPDATE AppConfig SET autoBackupEnabled = ?, autoBackupIntervalHours = ?, autoBackupPath = ?, updatedAt = ? WHERE id = 1",
            params![if enabled { 1 } else { 0 }, hours, path, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(BackupConfig {
            auto_backup_enabled: enabled,
            auto_backup_interval_hours: hours,
            auto_backup_path: path,
            last_auto_backup_at: current.last_auto_backup_at,
        })
    }

    pub fn set_last_auto_backup_at(&self, timestamp: &str) -> Result<(), String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;
        conn.execute("UPDATE AppConfig SET lastAutoBackupAt = ? WHERE id = 1", params![timestamp])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_lan_sync_config(&self) -> Result<LanSyncConfig, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        conn.query_row(
            "SELECT lanSyncEnabled, lanPort, lanPasscode, lastLanSyncAt FROM AppConfig WHERE id = 1",
            [],
            |r| {
                let enabled_num: i64 = r.get(0)?;
                let port_num: i64 = r.get(1)?;
                Ok(LanSyncConfig {
                    lan_sync_enabled: enabled_num != 0,
                    lan_port: port_num as u16,
                    lan_passcode: r.get(2)?,
                    last_lan_sync_at: r.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn save_lan_sync_config(&self, data: LanSyncConfigInput) -> Result<LanSyncConfig, String> {
        let current = self.get_lan_sync_config().unwrap_or(LanSyncConfig {
            lan_sync_enabled: false,
            lan_port: 8085,
            lan_passcode: Some("quantlib-sync".into()),
            last_lan_sync_at: None,
        });

        let enabled = data.lan_sync_enabled.unwrap_or(current.lan_sync_enabled);
        let port = data.lan_port.unwrap_or(current.lan_port);
        let passcode = data.lan_passcode.or(current.lan_passcode);
        let now = Utc::now().to_rfc3339();

        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        conn.execute(
            "UPDATE AppConfig SET lanSyncEnabled = ?, lanPort = ?, lanPasscode = ?, updatedAt = ? WHERE id = 1",
            params![if enabled { 1 } else { 0 }, port as i64, passcode, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(LanSyncConfig {
            lan_sync_enabled: enabled,
            lan_port: port,
            lan_passcode: passcode,
            last_lan_sync_at: current.last_lan_sync_at,
        })
    }

    pub fn get_all_checkouts_raw(&self) -> Result<Vec<Checkout>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let mut stmt = conn
            .prepare(
                r#"SELECT c.id, c.subjectId, c.studentName, c.studentClass, c.checkoutDate, c.dueDate, c.returnDate, c.status, c.conditionOut, c.conditionIn, c.createdAt, c.updatedAt,
                          s.name, s.category, s.openingCount, s.recovered, s.issued, s.damaged, s.lost, s.notes, s.averageCondition, s.degradationRate, s.createdAt, s.updatedAt
                   FROM Checkout c
                   LEFT JOIN Subject s ON c.subjectId = s.id
                   ORDER BY c.id ASC"#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let sid: i64 = row.get(1)?;
                let sub_name: Option<String> = row.get(12)?;
                let subject = sub_name.map(|name| {
                    let opening: i64 = row.get(14).unwrap_or(0);
                    let recovered: i64 = row.get(15).unwrap_or(0);
                    let issued: i64 = row.get(16).unwrap_or(0);
                    let damaged: i64 = row.get(17).unwrap_or(0);
                    let lost: i64 = row.get(18).unwrap_or(0);
                    Subject {
                        id: sid,
                        name,
                        category: row.get(13).unwrap_or(None),
                        opening_count: opening,
                        recovered,
                        issued,
                        damaged,
                        lost,
                        notes: row.get(19).unwrap_or(None),
                        average_condition: row.get(20).unwrap_or(3.0),
                        degradation_rate: row.get(21).unwrap_or(0.0),
                        created_at: row.get(22).unwrap_or(None),
                        updated_at: row.get(23).unwrap_or(None),
                        available: Some(Self::calculate_available(opening, recovered, issued, damaged, lost)),
                    }
                });

                Ok(Checkout {
                    id: row.get(0)?,
                    subject_id: sid,
                    student_name: row.get(2)?,
                    student_class: row.get(3)?,
                    checkout_date: row.get(4)?,
                    due_date: row.get(5)?,
                    return_date: row.get(6)?,
                    status: row.get(7)?,
                    condition_out: row.get(8)?,
                    condition_in: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    subject,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_schools(&self) -> Result<Vec<SchoolInfo>, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;

        let mut stmt = conn
            .prepare("SELECT name, motto, logoPath, address, contactPhone, academicYear FROM School ORDER BY id ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| {
                Ok(SchoolInfo {
                    name: r.get(0)?,
                    motto: r.get(1)?,
                    logo_path: r.get(2)?,
                    address: r.get(3)?,
                    contact_phone: r.get(4)?,
                    academic_year: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_school_info(&self) -> Result<SchoolInfo, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;
        conn.query_row(
            "SELECT name, motto, logoPath, address, contactPhone, academicYear FROM School ORDER BY id ASC LIMIT 1",
            [],
            |r| {
                Ok(SchoolInfo {
                    name: r.get(0)?,
                    motto: r.get(1)?,
                    logo_path: r.get(2)?,
                    address: r.get(3)?,
                    contact_phone: r.get(4)?,
                    academic_year: r.get(5)?,
                })
            },
        ).map_err(|e| e.to_string())
    }

    pub fn update_school_info(&self, data: SchoolInfo) -> Result<SchoolInfo, String> {
        let lock = self.conn.lock();
        let conn = lock.as_ref().ok_or("Database is locked.")?;
        let now = Utc::now().to_rfc3339();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM School", [], |r| r.get(0))
            .unwrap_or(0);

        if count == 0 {
            conn.execute(
                r#"INSERT INTO School (id, name, motto, logoPath, address, contactPhone, academicYear, updatedAt, checkoutDuration)
                   VALUES (1, ?, ?, ?, ?, ?, ?, ?, 14)"#,
                params![
                    data.name,
                    data.motto,
                    data.logo_path,
                    data.address,
                    data.contact_phone,
                    data.academic_year,
                    now,
                ],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                r#"UPDATE School SET
                   name = ?,
                   motto = ?,
                   logoPath = ?,
                   address = ?,
                   contactPhone = ?,
                   academicYear = ?,
                   updatedAt = ?
                   WHERE id = 1"#,
                params![
                    data.name,
                    data.motto,
                    data.logo_path,
                    data.address,
                    data.contact_phone,
                    data.academic_year,
                    now,
                ],
            ).map_err(|e| e.to_string())?;
        }

        Ok(data)
    }
}
