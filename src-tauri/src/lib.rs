pub mod commands;
pub mod crypto;
pub mod db;
pub mod models;
pub mod services;

pub use commands::AppState;
pub use crypto::VaultManager;
pub use db::Database;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("quantlib");

    let vault = Arc::new(VaultManager::new(data_dir));
    let db = Arc::new(Database::new());

    let vault_for_cleanup = Arc::clone(&vault);
    let db_for_cleanup = Arc::clone(&db);
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(AppState {
            vault: Arc::clone(&vault),
            db: Arc::clone(&db),
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_db_status,
            commands::setup_db,
            commands::unlock_db,
            commands::change_password,
            commands::backup_database,
            commands::get_subjects,
            commands::get_incidents,
            commands::get_summary,
            commands::add_subject,
            commands::update_subject,
            commands::add_incident,
            commands::set_theme,
            commands::add_checkout,
            commands::return_checkout,
            commands::get_active_checkouts,
            commands::record_fine_payment,
            commands::waive_fine,
            commands::get_overdue_checkouts,
            commands::get_audit_logs,
            commands::get_borrowing_rules,
            commands::save_borrowing_rule,
            commands::delete_borrowing_rule,
            commands::get_clearance_status,
            commands::generate_clearance_slip,
            commands::create_stock_audit,
            commands::save_stock_audit_item,
            commands::complete_stock_audit,
            commands::get_stock_audits,
            commands::get_depreciation_analytics,
            commands::get_circulation_insights,
            commands::get_backup_config,
            commands::save_backup_config,
            commands::trigger_auto_backup,
            commands::list_backups,
            commands::get_lan_sync_config,
            commands::save_lan_sync_config,
            commands::sync_with_lan_peer_cmd,
            commands::get_lan_status,
            commands::get_school_info,
            commands::save_school_info,
            commands::export_entire_db_csv,
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                db_for_cleanup.close();
                vault_for_cleanup.cleanup();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;
    use chrono::Utc;
    use std::fs;

    fn create_test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("quantlib_test_{}_{}", name, Utc::now().timestamp_nanos_opt().unwrap_or(0)));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn test_vault_setup_and_unlock() {
        let test_dir = create_test_dir("vault");
        let vault = VaultManager::new(test_dir.clone());

        assert_eq!(vault.check_db_status(), "SETUP");

        let recovery_key = vault.setup_database("SuperSecurePassword123!").expect("Setup failed");
        assert!(!recovery_key.is_empty());
        assert_eq!(vault.check_db_status(), "LOCKED");
        assert!(vault.has_master_key());

        // Clear master key to simulate app relaunch
        vault.clear_master_key();
        assert!(!vault.has_master_key());

        // Unlock with wrong password should fail
        assert!(vault.unlock_database("WrongPassword", false).is_err());
        assert!(!vault.has_master_key());

        // Unlock with correct password
        vault.unlock_database("SuperSecurePassword123!", false).expect("Unlock failed");
        assert!(vault.has_master_key());

        // Unlock with recovery key
        vault.clear_master_key();
        vault.unlock_database(&recovery_key, true).expect("Recovery unlock failed");
        assert!(vault.has_master_key());

        // Clean up
        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_database_crud_and_invariants() {
        let test_dir = create_test_dir("db");
        let db_path = test_dir.join("test.db");
        let db = Database::new();
        db.open(&db_path).expect("Failed to open test DB");

        // 1. Add subject
        let subject = db.add_subject(SubjectInput {
            name: Some("Mathematics S.4".into()),
            category: Some("Science".into()),
            opening_count: Some(50),
        }).expect("Failed to add subject");

        assert_eq!(subject.name, "Mathematics S.4");
        assert_eq!(subject.opening_count, 50);
        assert_eq!(subject.available, Some(50));

        // 2. Add checkout
        let checkout = db.add_checkout(
            subject.id,
            "John Doe".into(),
            Some("S.4A".into()),
            None,
            Some(3),
        ).expect("Failed to add checkout");

        assert_eq!(checkout.status, "ACTIVE");
        assert_eq!(checkout.condition_out, 3);

        // Check availability decreased
        let subjects = db.get_subjects().expect("Failed to get subjects");
        let math = subjects.iter().find(|s| s.id == subject.id).unwrap();
        assert_eq!(math.issued, 1);
        assert_eq!(math.available, Some(49));

        // 3. Return checkout with condition 2 (degraded)
        let returned = db.return_checkout(checkout.id, Some(2)).expect("Failed to return checkout");
        assert_eq!(returned.status, "RETURNED");
        assert_eq!(returned.condition_in, Some(2));

        let subjects_after_return = db.get_subjects().expect("Failed to get subjects");
        let math_after = subjects_after_return.iter().find(|s| s.id == subject.id).unwrap();
        assert_eq!(math_after.issued, 0);
        assert_eq!(math_after.available, Some(50));
        assert!(math_after.average_condition < 3.0);

        // 4. Incident tracking and audit log
        let incident = db.add_incident(IncidentInput {
            incident_type: "DAMAGED".into(),
            date: None,
            subject_id: Some(subject.id),
            book_title: "Mathematics S.4 Volume 1".into(),
            condition: Some("Torn cover".into()),
            comment: Some("Water spill".into()),
            reported_by: Some("Librarian".into()),
            responsible_party: Some("John Doe".into()),
            student_class: Some("S.4A".into()),
            action_taken: None,
        }).expect("Failed to log incident");

        assert_eq!(incident.incident_type, "DAMAGED");

        // Available should now be 49 because 1 book is damaged
        let subjects_after_damage = db.get_subjects().unwrap();
        let math_damaged = subjects_after_damage.iter().find(|s| s.id == subject.id).unwrap();
        assert_eq!(math_damaged.damaged, 1);
        assert_eq!(math_damaged.available, Some(49));

        // Verify audit log exists
        let logs = db.get_audit_logs().unwrap();
        assert!(logs.iter().any(|l| l.subject_id == subject.id && l.field == "damaged"));

        // 5. Clearance calculation
        let clearance = db.calculate_clearance("John Doe", Some("S.4A")).unwrap();
        assert_eq!(clearance.status, "HOLD"); // has unresolved incident
        assert!(clearance.total_replacement_charges > 0.0);

        // Waive fine
        let cleared = db.waive_fine("John Doe", Some("S.4A"), "First warning", Some("Headteacher")).unwrap();
        assert_eq!(cleared.status, "CLEARED");

        // 6. Stock Audit
        let audit = db.create_stock_audit(Some("Auditor".into()), Some("Annual Check".into())).unwrap();
        assert_eq!(audit.status, "IN_PROGRESS");

        let completed_audit = db.complete_stock_audit(audit.id, Some("All verified".into())).unwrap();
        assert_eq!(completed_audit.status, "COMPLETED");
        assert!(completed_audit.summary.is_some());

        // Clean up
        // 7. Test overdue date detection with ISO-8601 'T' separator
        let overdue_checkout = db.add_checkout(
            subject.id,
            "Jane Smith".into(),
            Some("S.4A".into()),
            Some("2020-01-01T12:00:00Z".into()),
            Some(3),
        ).unwrap();
        assert_eq!(overdue_checkout.status, "ACTIVE");
        let overdue_list = db.get_overdue_checkouts().unwrap();
        assert!(overdue_list.iter().any(|c| c.id == overdue_checkout.id));

        // 8. Test incident on active checkout does not double-deduct
        // Currently math has opening=50, damaged=1, issued=1 (Jane Smith). Available = 50 - 1 - 1 = 48.
        let sub_before = db.get_subjects().unwrap().into_iter().find(|s| s.id == subject.id).unwrap();
        assert_eq!(sub_before.available, Some(48));
        assert_eq!(sub_before.issued, 1);

        // Jane Smith reports book LOST
        db.add_incident(IncidentInput {
            incident_type: "LOST".into(),
            book_title: "Mathematics S.4".into(),
            subject_id: Some(subject.id),
            responsible_party: Some("Jane Smith".into()),
            student_class: Some("S.4A".into()),
            condition: Some("Lost".into()),
            comment: None,
            reported_by: Some("Librarian".into()),
            action_taken: None,
            date: None,
        }).unwrap();

        let sub_after = db.get_subjects().unwrap().into_iter().find(|s| s.id == subject.id).unwrap();
        // Issued is decremented to 0, lost is incremented to 1
        assert_eq!(sub_after.issued, 0);
        assert_eq!(sub_after.lost, 1);
        // Available should still be 50 - 1(damaged) - 1(lost) = 48 (NOT 47 from double deduction!)
        assert_eq!(sub_after.available, Some(48));

        // 9. Test School info persistence
        let new_school = SchoolInfo {
            name: "Updated High School".into(),
            motto: Some("Excellence Always".into()),
            logo_path: None,
            address: Some("Plot 42, Kampala".into()),
            contact_phone: Some("+256 711 222 333".into()),
            academic_year: Some("2026/2027".into()),
        };
        db.update_school_info(new_school.clone()).unwrap();
        let fetched_school = db.get_school_info().unwrap();
        assert_eq!(fetched_school.name, "Updated High School");
        assert_eq!(fetched_school.academic_year, Some("2026/2027".into()));

        // Clean up
        db.close();
        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_backup_creates_both_enc_and_meta() {
        let test_dir = create_test_dir("backup_test");
        let vault = VaultManager::new(test_dir.clone());
        vault.setup_database("StrongPassword123!").expect("Setup failed");

        let backup_dir = test_dir.join("backups");
        let (dest_path, filename) = services::perform_vault_backup(
            &backup_dir,
            &vault.enc_file(),
            &vault.meta_file(),
        ).expect("Backup failed");

        assert!(std::path::Path::new(&dest_path).exists());
        assert!(filename.ends_with(".enc"));

        let meta_filename = filename.replace(".enc", ".meta");
        let meta_path = backup_dir.join(meta_filename);
        assert!(meta_path.exists(), "quantlib.meta backup must be created alongside quantlib.enc");

        let _ = fs::remove_dir_all(&test_dir);
    }
}
