use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            recovery_key: None,
            backup_path: None,
            filename: None,
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
            recovery_key: None,
            backup_path: None,
            filename: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subject {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub opening_count: i64,
    pub recovered: i64,
    pub issued: i64,
    pub damaged: i64,
    pub lost: i64,
    pub notes: Option<String>,
    pub average_condition: f64,
    pub degradation_rate: f64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub available: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectInput {
    pub name: Option<String>,
    pub category: Option<String>,
    pub opening_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub id: i64,
    #[serde(rename = "type")]
    pub incident_type: String,
    pub date: String,
    pub subject_id: Option<i64>,
    pub book_title: String,
    pub condition: Option<String>,
    pub comment: Option<String>,
    pub reported_by: Option<String>,
    pub responsible_party: Option<String>,
    pub student_class: Option<String>,
    pub action_taken: Option<String>,
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<Subject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentInput {
    #[serde(rename = "type")]
    pub incident_type: String,
    pub date: Option<String>,
    pub subject_id: Option<i64>,
    pub book_title: String,
    pub condition: Option<String>,
    pub comment: Option<String>,
    pub reported_by: Option<String>,
    pub responsible_party: Option<String>,
    pub student_class: Option<String>,
    pub action_taken: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLog {
    pub id: i64,
    pub subject_id: i64,
    pub field: String,
    pub old_value: String,
    pub new_value: String,
    pub changed_by: Option<String>,
    pub changed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<Subject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkout {
    pub id: i64,
    pub subject_id: i64,
    pub student_name: String,
    pub student_class: Option<String>,
    pub checkout_date: String,
    pub due_date: String,
    pub return_date: Option<String>,
    pub status: String,
    pub condition_out: i64,
    pub condition_in: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<Subject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BorrowingRule {
    pub id: i64,
    pub role_or_grade: String,
    pub max_books_allowed: i64,
    pub borrow_duration_days: i64,
    pub fine_per_day: f64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BorrowingRuleInput {
    pub id: Option<i64>,
    pub role_or_grade: Option<String>,
    pub max_books_allowed: Option<i64>,
    pub borrow_duration_days: Option<i64>,
    pub fine_per_day: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAudit {
    pub id: i64,
    pub audit_date: String,
    pub audited_by: Option<String>,
    pub notes: Option<String>,
    pub status: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<StockAuditItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<StockAuditSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAuditItem {
    pub id: i64,
    pub audit_id: i64,
    pub subject_id: i64,
    pub expected_count: i64,
    pub actual_count: i64,
    pub discrepancy: i64,
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<Subject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAuditSummary {
    pub total_subjects: i64,
    pub total_expected: i64,
    pub total_actual: i64,
    pub total_discrepancy: i64,
    pub missing_items: i64,
    pub misplaced_items: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolInfo {
    pub name: String,
    pub motto: Option<String>,
    pub logo_path: Option<String>,
    pub address: Option<String>,
    pub contact_phone: Option<String>,
    pub academic_year: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentInfo {
    pub student_name: String,
    pub student_class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearanceRecord {
    pub student_name: String,
    pub student_class: Option<String>,
    pub status: String,
    pub active_checkouts: Vec<Checkout>,
    pub incidents: Vec<Incident>,
    pub unresolved_incidents: Vec<Incident>,
    pub total_replacement_charges: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clearance_decision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub school: Option<SchoolInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student: Option<StudentInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub total_books: i64,
    pub available: i64,
    pub issued: i64,
    pub damaged_lost: i64,
    pub subjects: Vec<Subject>,
    pub overdue_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionDecayPoint {
    pub checkouts: i64,
    pub projected_condition: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectDecayProjection {
    pub subject_id: i64,
    pub subject_name: String,
    pub category: String,
    pub average_condition: f64,
    pub degradation_rate: f64,
    pub remaining_checkouts: i64,
    pub projections: Vec<ConditionDecayPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementSubjectCost {
    pub subject_id: i64,
    pub name: String,
    pub category: String,
    pub total_books: i64,
    pub damaged_count: i64,
    pub near_end_life_count: i64,
    pub replacement_count: i64,
    pub estimated_cost: f64,
    pub average_condition: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementCategoryCost {
    pub category: String,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementCostAnalysis {
    pub subjects: Vec<ReplacementSubjectCost>,
    pub total_replacement_cost: f64,
    pub total_damaged: i64,
    pub total_near_end_life: i64,
    pub category_costs: Vec<ReplacementCategoryCost>,
    pub unit_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepreciationAnalytics {
    pub decay_projections: Vec<SubjectDecayProjection>,
    pub replacement_cost_analysis: ReplacementCostAnalysis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyCirculationTrend {
    pub month: String,
    pub checkouts: i64,
    pub returns: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeakBorrowingDay {
    pub day: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopularCategory {
    pub category: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopReader {
    pub student_name: String,
    pub student_class: Option<String>,
    pub total_checkouts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CirculationInsights {
    pub monthly_trends: Vec<MonthlyCirculationTrend>,
    pub peak_days: Vec<PeakBorrowingDay>,
    pub popular_categories: Vec<PopularCategory>,
    pub top_readers: Vec<TopReader>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub auto_backup_enabled: bool,
    pub auto_backup_interval_hours: i64,
    pub auto_backup_path: Option<String>,
    pub last_auto_backup_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfigInput {
    pub auto_backup_enabled: Option<bool>,
    pub auto_backup_interval_hours: Option<i64>,
    pub auto_backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileRecord {
    pub filename: String,
    pub full_path: String,
    pub size_bytes: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanSyncConfig {
    pub lan_sync_enabled: bool,
    pub lan_port: u16,
    pub lan_passcode: Option<String>,
    pub last_lan_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanSyncConfigInput {
    pub lan_sync_enabled: Option<bool>,
    pub lan_port: Option<u16>,
    pub lan_passcode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanStatusResponse {
    pub local_ip: String,
    pub is_server_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanSyncResult {
    pub success: bool,
    pub subjects_synced: Option<i64>,
    pub checkouts_synced: Option<i64>,
    pub incidents_synced: Option<i64>,
    pub rules_synced: Option<i64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseExportResult {
    pub target_dir: String,
    pub exported_count: i64,
    pub filenames: Vec<String>,
}
