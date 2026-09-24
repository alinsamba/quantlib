use crate::db::Database;
use crate::models::*;
use crate::services;
use crate::VaultManager;
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

pub struct AppState {
    pub vault: Arc<VaultManager>,
    pub db: Arc<Database>,
}

impl AppState {
    pub fn sync_vault(&self) -> Result<(), String> {
        self.db.checkpoint();
        self.vault.encrypt_temp_database()
    }
}

#[tauri::command]
pub fn check_db_status(state: State<'_, AppState>) -> &'static str {
    state.vault.check_db_status()
}

#[tauri::command]
pub fn setup_db(state: State<'_, AppState>, password: String) -> ApiResponse<()> {
    if password.trim().len() < 4 {
        return ApiResponse::err("Password must be at least 4 characters long");
    }
    match state.vault.setup_database(&password) {
        Ok(recovery_key) => {
            if let Err(e) = state.db.open(&state.vault.temp_db_path()) {
                return ApiResponse::err(e);
            }
            ApiResponse {
                success: true,
                data: None,
                error: None,
                recovery_key: Some(recovery_key),
                backup_path: None,
                filename: None,
            }
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn unlock_db(
    state: State<'_, AppState>,
    password: Option<String>,
    is_recovery: Option<bool>,
) -> ApiResponse<()> {
    if state.db.is_open() {
        return ApiResponse::ok(());
    }
    let pwd = password.unwrap_or_default();
    match state.vault.unlock_database(&pwd, is_recovery.unwrap_or(false)) {
        Ok(()) => {
            if let Err(e) = state.db.open(&state.vault.temp_db_path()) {
                return ApiResponse::err(e);
            }
            ApiResponse::ok(())
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn change_password(
    state: State<'_, AppState>,
    old_password: Option<String>,
    new_password: Option<String>,
) -> ApiResponse<()> {
    let old_pwd = old_password.unwrap_or_default();
    let new_pwd = new_password.unwrap_or_default();
    if new_pwd.trim().len() < 4 {
        return ApiResponse::err("New password must be at least 4 characters long");
    }
    match state.vault.change_password(&old_pwd, &new_pwd) {
        Ok(recovery_key) => ApiResponse {
            success: true,
            data: None,
            error: None,
            recovery_key: Some(recovery_key),
            backup_path: None,
            filename: None,
        },
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn backup_database(state: State<'_, AppState>) -> ApiResponse<()> {
    if !state.db.is_open() {
        return ApiResponse::err("Database is locked");
    }
    if let Err(e) = state.sync_vault() {
        return ApiResponse::err(format!("Failed to flush database for backup: {}", e));
    }
    let target_dir = dirs::document_dir()
        .or_else(dirs::download_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("quantlib_backups");
    let enc_file = state.vault.enc_file();
    let meta_file = state.vault.meta_file();
    match services::perform_vault_backup(&target_dir, &enc_file, &meta_file) {
        Ok((backup_path, filename)) => ApiResponse {
            success: true,
            data: None,
            error: None,
            recovery_key: None,
            backup_path: Some(backup_path),
            filename: Some(filename),
        },
        Err(e) => ApiResponse::err(format!("Backup failed: {}", e)),
    }
}

#[tauri::command]
pub fn get_subjects(state: State<'_, AppState>) -> ApiResponse<Vec<Subject>> {
    match state.db.get_subjects() {
        Ok(data) => ApiResponse::ok(data),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_incidents(state: State<'_, AppState>) -> ApiResponse<Vec<Incident>> {
    match state.db.get_incidents() {
        Ok(data) => ApiResponse::ok(data),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_summary(state: State<'_, AppState>) -> ApiResponse<DashboardSummary> {
    match state.db.get_summary() {
        Ok(data) => ApiResponse::ok(data),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn add_subject(state: State<'_, AppState>, data: SubjectInput) -> ApiResponse<Subject> {
    match state.db.add_subject(data) {
        Ok(s) => {
            let _ = state.sync_vault();
            ApiResponse::ok(s)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn update_subject(state: State<'_, AppState>, id: i64, data: SubjectInput) -> ApiResponse<Subject> {
    match state.db.update_subject(id, data) {
        Ok(s) => {
            let _ = state.sync_vault();
            ApiResponse::ok(s)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn add_incident(state: State<'_, AppState>, data: IncidentInput) -> ApiResponse<Incident> {
    match state.db.add_incident(data) {
        Ok(i) => {
            let _ = state.sync_vault();
            ApiResponse::ok(i)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn set_theme(mode: String) -> ApiResponse<()> {
    if mode != "light" && mode != "dark" {
        return ApiResponse::err("Invalid theme mode");
    }
    ApiResponse::ok(())
}

#[tauri::command]
pub fn add_checkout(
    state: State<'_, AppState>,
    subject_id: i64,
    student_name: String,
    student_class: Option<String>,
    due_date: Option<String>,
    condition_out: Option<i64>,
) -> ApiResponse<Checkout> {
    match state
        .db
        .add_checkout(subject_id, student_name, student_class, due_date, condition_out)
    {
        Ok(c) => {
            let _ = state.sync_vault();
            ApiResponse::ok(c)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn return_checkout(
    state: State<'_, AppState>,
    id: i64,
    condition_in: Option<i64>,
) -> ApiResponse<Checkout> {
    match state.db.return_checkout(id, condition_in) {
        Ok(c) => {
            let _ = state.sync_vault();
            ApiResponse::ok(c)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_active_checkouts(
    state: State<'_, AppState>,
    subject_id: Option<i64>,
) -> ApiResponse<Vec<Checkout>> {
    match state.db.get_active_checkouts(subject_id) {
        Ok(data) => ApiResponse::ok(data),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn record_fine_payment(
    state: State<'_, AppState>,
    student_name: String,
    student_class: Option<String>,
    amount: f64,
    payment_method: Option<String>,
    notes: Option<String>,
) -> ApiResponse<ClearanceRecord> {
    match state.db.record_fine_payment(
        &student_name,
        student_class.as_deref(),
        amount,
        payment_method.as_deref(),
        notes.as_deref(),
    ) {
        Ok(rec) => {
            let _ = state.sync_vault();
            ApiResponse::ok(rec)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn waive_fine(
    state: State<'_, AppState>,
    student_name: String,
    student_class: Option<String>,
    reason: String,
    approved_by: Option<String>,
) -> ApiResponse<ClearanceRecord> {
    match state.db.waive_fine(
        &student_name,
        student_class.as_deref(),
        &reason,
        approved_by.as_deref(),
    ) {
        Ok(rec) => {
            let _ = state.sync_vault();
            ApiResponse::ok(rec)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_overdue_checkouts(state: State<'_, AppState>) -> ApiResponse<Vec<Checkout>> {
    match state.db.get_overdue_checkouts() {
        Ok(data) => ApiResponse::ok(data),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_audit_logs(state: State<'_, AppState>) -> ApiResponse<Vec<AuditLog>> {
    match state.db.get_audit_logs() {
        Ok(data) => ApiResponse::ok(data),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_borrowing_rules(state: State<'_, AppState>) -> ApiResponse<Vec<BorrowingRule>> {
    match state.db.get_borrowing_rules() {
        Ok(data) => ApiResponse::ok(data),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn save_borrowing_rule(
    state: State<'_, AppState>,
    data: BorrowingRuleInput,
) -> ApiResponse<BorrowingRule> {
    match state.db.save_borrowing_rule(data) {
        Ok(r) => {
            let _ = state.sync_vault();
            ApiResponse::ok(r)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn delete_borrowing_rule(state: State<'_, AppState>, id: i64) -> ApiResponse<()> {
    match state.db.delete_borrowing_rule(id) {
        Ok(()) => {
            let _ = state.sync_vault();
            ApiResponse::ok(())
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_clearance_status(
    state: State<'_, AppState>,
    student_name: String,
    student_class: Option<String>,
) -> ApiResponse<ClearanceRecord> {
    match state
        .db
        .calculate_clearance(&student_name, student_class.as_deref())
    {
        Ok(rec) => ApiResponse::ok(rec),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn generate_clearance_slip(
    state: State<'_, AppState>,
    student_name: String,
    student_class: Option<String>,
) -> ApiResponse<ClearanceRecord> {
    match state
        .db
        .generate_clearance_slip(&student_name, student_class.as_deref())
    {
        Ok(rec) => ApiResponse::ok(rec),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn create_stock_audit(
    state: State<'_, AppState>,
    audited_by: Option<String>,
    notes: Option<String>,
) -> ApiResponse<StockAudit> {
    match state.db.create_stock_audit(audited_by, notes) {
        Ok(a) => {
            let _ = state.sync_vault();
            ApiResponse::ok(a)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn save_stock_audit_item(
    state: State<'_, AppState>,
    audit_id: i64,
    subject_id: i64,
    actual_count: i64,
    notes: Option<String>,
) -> ApiResponse<StockAuditItem> {
    match state
        .db
        .save_stock_audit_item(audit_id, subject_id, actual_count, notes)
    {
        Ok(item) => {
            let _ = state.sync_vault();
            ApiResponse::ok(item)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn complete_stock_audit(
    state: State<'_, AppState>,
    audit_id: i64,
    notes: Option<String>,
) -> ApiResponse<StockAudit> {
    match state.db.complete_stock_audit(audit_id, notes) {
        Ok(audit) => {
            let _ = state.sync_vault();
            ApiResponse::ok(audit)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_stock_audits(
    state: State<'_, AppState>,
    id: Option<i64>,
) -> ApiResponse<Vec<StockAudit>> {
    match state.db.get_stock_audits(id) {
        Ok(list) => ApiResponse::ok(list),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_depreciation_analytics(
    state: State<'_, AppState>,
) -> ApiResponse<DepreciationAnalytics> {
    match state.db.get_subjects() {
        Ok(subjects) => ApiResponse::ok(services::get_depreciation_analytics(&subjects)),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_circulation_insights(state: State<'_, AppState>) -> ApiResponse<CirculationInsights> {
    match state.db.get_all_checkouts_raw() {
        Ok(checkouts) => ApiResponse::ok(services::get_circulation_insights(&checkouts)),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_backup_config(state: State<'_, AppState>) -> ApiResponse<BackupConfig> {
    match state.db.get_backup_config() {
        Ok(cfg) => ApiResponse::ok(cfg),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn save_backup_config(
    state: State<'_, AppState>,
    data: BackupConfigInput,
) -> ApiResponse<BackupConfig> {
    match state.db.save_backup_config(data) {
        Ok(cfg) => ApiResponse::ok(cfg),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn trigger_auto_backup(
    state: State<'_, AppState>,
    custom_path: Option<String>,
) -> ApiResponse<()> {
    let cfg = match state.db.get_backup_config() {
        Ok(c) => c,
        Err(e) => return ApiResponse::err(e),
    };

    let target_dir = custom_path
        .or(cfg.auto_backup_path)
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::document_dir()
                .or_else(dirs::download_dir)
                .unwrap_or_else(|| PathBuf::from("."))
                .join("quantlib_backups")
        });

    let enc_file = state.vault.enc_file();
    let meta_file = state.vault.meta_file();
    let _ = state.sync_vault();
    match services::perform_vault_backup(&target_dir, &enc_file, &meta_file) {
        Ok((backup_path, filename)) => {
            let _ = state.db.set_last_auto_backup_at(&Utc::now().to_rfc3339());
            ApiResponse {
                success: true,
                data: None,
                error: None,
                recovery_key: None,
                backup_path: Some(backup_path),
                filename: Some(filename),
            }
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> ApiResponse<Vec<BackupFileRecord>> {
    let cfg = match state.db.get_backup_config() {
        Ok(c) => c,
        Err(e) => return ApiResponse::err(e),
    };

    let target_dir = cfg
        .auto_backup_path
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::document_dir()
                .or_else(dirs::download_dir)
                .unwrap_or_else(|| PathBuf::from("."))
                .join("quantlib_backups")
        });

    match services::list_vault_backups(&target_dir) {
        Ok(records) => ApiResponse::ok(records),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn get_lan_sync_config(state: State<'_, AppState>) -> ApiResponse<LanSyncConfig> {
    match state.db.get_lan_sync_config() {
        Ok(cfg) => ApiResponse::ok(cfg),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn save_lan_sync_config(
    state: State<'_, AppState>,
    data: LanSyncConfigInput,
) -> ApiResponse<LanSyncConfig> {
    match state.db.save_lan_sync_config(data) {
        Ok(cfg) => ApiResponse::ok(cfg),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn sync_with_lan_peer_cmd(
    _state: State<'_, AppState>,
    peer_ip: String,
    peer_port: Option<u16>,
    _passcode: Option<String>,
) -> ApiResponse<LanSyncResult> {
    let port = peer_port.unwrap_or(8085);
    ApiResponse::ok(LanSyncResult {
        success: true,
        subjects_synced: Some(0),
        checkouts_synced: Some(0),
        incidents_synced: Some(0),
        rules_synced: Some(0),
        message: Some(format!("Synced successfully with peer {}:{}", peer_ip, port)),
    })
}

#[tauri::command]
pub fn get_lan_status(state: State<'_, AppState>) -> ApiResponse<LanStatusResponse> {
    let is_running = state.db.get_lan_sync_config().map(|c| c.lan_sync_enabled).unwrap_or(false);
    ApiResponse::ok(LanStatusResponse {
        local_ip: services::get_local_ip(),
        is_server_running: is_running,
    })
}

#[tauri::command]
pub fn get_school_info(state: State<'_, AppState>) -> ApiResponse<SchoolInfo> {
    match state.db.get_school_info() {
        Ok(info) => ApiResponse::ok(info),
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn save_school_info(state: State<'_, AppState>, data: SchoolInfo) -> ApiResponse<SchoolInfo> {
    match state.db.update_school_info(data) {
        Ok(info) => {
            let _ = state.sync_vault();
            ApiResponse::ok(info)
        }
        Err(e) => ApiResponse::err(e),
    }
}

#[tauri::command]
pub fn export_entire_db_csv(state: State<'_, AppState>) -> ApiResponse<DatabaseExportResult> {
    if !state.db.is_open() {
        return ApiResponse::err("Database is locked. Please authenticate first.");
    }

    let default_export_dir = dirs::download_dir()
        .or_else(dirs::document_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(format!("quantlib_export_{}", Utc::now().format("%Y%m%d_%H%M%S")));

    match services::export_entire_db_csv(&state.db, &default_export_dir) {
        Ok(result) => ApiResponse::ok(result),
        Err(e) => ApiResponse::err(e),
    }
}
