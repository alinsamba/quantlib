use crate::db::Database;
use crate::models::*;
use chrono::{DateTime, Datelike, NaiveDate, Utc};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

pub fn calculate_condition_decay(
    average_condition: f64,
    degradation_rate: f64,
    future_checkouts: i64,
) -> (f64, i64, f64) {
    let current_condition = average_condition.clamp(1.0, 3.0);
    let rate = if degradation_rate > 0.0 {
        degradation_rate
    } else {
        0.02
    };
    let projected_condition = (current_condition - rate * (future_checkouts as f64)).max(1.0);
    let projected_rounded = (projected_condition * 100.0).round() / 100.0;
    let remaining_checkouts = if rate > 0.0 {
        ((current_condition - 1.0) / rate).floor().max(0.0) as i64
    } else {
        0
    };
    (rate, remaining_checkouts, projected_rounded)
}

pub fn get_depreciation_analytics(subjects: &[Subject]) -> DepreciationAnalytics {
    let mut decay_projections = Vec::new();

    for s in subjects {
        let (rate, remaining, _) = calculate_condition_decay(s.average_condition, s.degradation_rate, 0);
        let projections = [0, 10, 25, 50, 100]
            .iter()
            .map(|&checkouts| {
                let (_, _, projected) =
                    calculate_condition_decay(s.average_condition, s.degradation_rate, checkouts);
                ConditionDecayPoint {
                    checkouts,
                    projected_condition: projected,
                }
            })
            .collect();

        decay_projections.push(SubjectDecayProjection {
            subject_id: s.id,
            subject_name: s.name.clone(),
            category: s.category.clone().unwrap_or_else(|| "General".into()),
            average_condition: s.average_condition,
            degradation_rate: rate,
            remaining_checkouts: remaining,
            projections,
        });
    }

    let unit_cost = 25.0;
    let mut total_replacement_cost = 0.0;
    let mut total_damaged = 0;
    let mut total_near_end_life = 0;
    let mut subject_costs = Vec::new();
    let mut category_map: HashMap<String, f64> = HashMap::new();

    for s in subjects {
        let total_books = (s.opening_count + s.recovered).max(0);
        let damaged = s.damaged.max(0);
        let lost = s.lost.max(0);
        let active_available = (total_books - damaged - lost).max(0);
        let cond = s.average_condition;

        let near_end_life = if cond <= 1.5 {
            active_available
        } else if cond < 2.5 {
            let decay_ratio = (2.5 - cond) / 1.5;
            ((active_available as f64) * decay_ratio).floor() as i64
        } else {
            0
        };

        let replacement_count = damaged + near_end_life;
        let estimated_cost = ((replacement_count as f64) * unit_cost * 100.0).round() / 100.0;

        total_replacement_cost += estimated_cost;
        total_damaged += damaged;
        total_near_end_life += near_end_life;

        let cat = s.category.clone().unwrap_or_else(|| "General".into());
        *category_map.entry(cat.clone()).or_insert(0.0) += estimated_cost;

        subject_costs.push(ReplacementSubjectCost {
            subject_id: s.id,
            name: s.name.clone(),
            category: cat,
            total_books,
            damaged_count: damaged,
            near_end_life_count: near_end_life,
            replacement_count,
            estimated_cost,
            average_condition: cond,
        });
    }

    let mut category_costs = Vec::new();
    for (category, cost) in category_map {
        category_costs.push(ReplacementCategoryCost {
            category,
            cost: (cost * 100.0).round() / 100.0,
        });
    }

    DepreciationAnalytics {
        decay_projections,
        replacement_cost_analysis: ReplacementCostAnalysis {
            subjects: subject_costs,
            total_replacement_cost: (total_replacement_cost * 100.0).round() / 100.0,
            total_damaged,
            total_near_end_life,
            category_costs,
            unit_cost,
        },
    }
}

pub fn get_circulation_insights(checkouts: &[Checkout]) -> CirculationInsights {
    let mut months_map: HashMap<String, (String, i64, i64, i64)> = HashMap::new(); // key -> (month_label, checkouts, returns, timestamp)
    let mut day_counts: [i64; 7] = [0; 7]; // Sunday=0 .. Saturday=6
    let day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let mut category_map: HashMap<String, i64> = HashMap::new();
    let mut reader_map: HashMap<(String, Option<String>), i64> = HashMap::new();

    for c in checkouts {
        if let Ok(dt) = DateTime::parse_from_rfc3339(&c.checkout_date) {
            let key = format!("{:04}-{:02}", dt.year(), dt.month());
            let label = dt.format("%b %Y").to_string();
            let timestamp = NaiveDate::from_ymd_opt(dt.year(), dt.month(), 1)
                .and_then(|d| d.and_hms_opt(0, 0, 0))
                .map(|t| t.and_utc().timestamp())
                .unwrap_or(0);

            let entry = months_map
                .entry(key)
                .or_insert_with(|| (label, 0, 0, timestamp));
            entry.1 += 1; // checkouts++

            let weekday = dt.weekday().num_days_from_sunday() as usize;
            if weekday < 7 {
                day_counts[weekday] += 1;
            }
        }

        if let Some(ref ret) = c.return_date {
            if let Ok(rdt) = DateTime::parse_from_rfc3339(ret) {
                let rkey = format!("{:04}-{:02}", rdt.year(), rdt.month());
                let rlabel = rdt.format("%b %Y").to_string();
                let rtimestamp = NaiveDate::from_ymd_opt(rdt.year(), rdt.month(), 1)
                    .and_then(|d| d.and_hms_opt(0, 0, 0))
                    .map(|t| t.and_utc().timestamp())
                    .unwrap_or(0);

                let entry = months_map
                    .entry(rkey)
                    .or_insert_with(|| (rlabel, 0, 0, rtimestamp));
                entry.2 += 1; // returns++
            }
        }

        let cat = c
            .subject
            .as_ref()
            .and_then(|s| s.category.clone())
            .unwrap_or_else(|| "General".into());
        *category_map.entry(cat).or_insert(0) += 1;

        let name = c.student_name.trim();
        if !name.is_empty() {
            let class = c.student_class.clone().map(|s| s.trim().to_string());
            *reader_map.entry((name.to_string(), class)).or_insert(0) += 1;
        }
    }

    let mut monthly_trends: Vec<_> = months_map
        .into_values()
        .map(|(month, checkouts, returns, timestamp)| (timestamp, MonthlyCirculationTrend { month, checkouts, returns }))
        .collect();
    monthly_trends.sort_by_key(|(t, _)| *t);
    let trends: Vec<MonthlyCirculationTrend> = monthly_trends.into_iter().map(|(_, m)| m).collect();

    let mut peak_days = Vec::new();
    for (i, name) in day_names.iter().enumerate() {
        peak_days.push(PeakBorrowingDay {
            day: name.to_string(),
            count: day_counts[i],
        });
    }

    let mut popular_categories: Vec<PopularCategory> = category_map
        .into_iter()
        .map(|(category, count)| PopularCategory { category, count })
        .collect();
    popular_categories.sort_by(|a, b| b.count.cmp(&a.count));

    let mut top_readers: Vec<TopReader> = reader_map
        .into_iter()
        .map(|((student_name, student_class), total_checkouts)| TopReader {
            student_name,
            student_class,
            total_checkouts,
        })
        .collect();
    top_readers.sort_by(|a, b| b.total_checkouts.cmp(&a.total_checkouts));
    top_readers.truncate(10);

    CirculationInsights {
        monthly_trends: trends,
        peak_days,
        popular_categories,
        top_readers,
    }
}

pub fn list_vault_backups(dir: &Path) -> Result<Vec<BackupFileRecord>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut records = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read backup dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "enc" || ext == "db" || ext == "bak" {
                    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let size_bytes = metadata.len() as i64;
                    let created_at = metadata
                        .created()
                        .or_else(|_| metadata.modified())
                        .ok()
                        .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
                        .unwrap_or_else(|| Utc::now().to_rfc3339());

                    records.push(BackupFileRecord {
                        filename,
                        full_path: path.to_string_lossy().to_string(),
                        size_bytes,
                        created_at,
                    });
                }
            }
        }
    }

    records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(records)
}

pub fn perform_vault_backup(target_dir: &Path, source_file: &Path, source_meta: &Path) -> Result<(String, String), String> {
    if !target_dir.exists() {
        fs::create_dir_all(target_dir)
            .map_err(|e| format!("Failed to create backup target dir: {}", e))?;
    }

    if !source_file.exists() {
        return Err("Source vault file does not exist".into());
    }

    let now_str = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("quantlib_backup_{}.enc", now_str);
    let dest_path = target_dir.join(&filename);

    fs::copy(source_file, &dest_path)
        .map_err(|e| format!("Failed to copy vault backup: {}", e))?;

    if source_meta.exists() {
        let meta_filename = format!("quantlib_backup_{}.meta", now_str);
        let meta_dest_path = target_dir.join(&meta_filename);
        let _ = fs::copy(source_meta, &meta_dest_path);
    }

    Ok((dest_path.to_string_lossy().to_string(), filename))
}

fn escape_csv(val: &str) -> String {
    let sanitized = if val.starts_with('=')
        || val.starts_with('+')
        || val.starts_with('-')
        || val.starts_with('@')
        || val.starts_with('\t')
        || val.starts_with('\r')
        || val.starts_with('|')
    {
        format!("'{}", val)
    } else {
        val.to_string()
    };
    format!("\"{}\"", sanitized.replace('"', "\"\""))
}

pub fn export_entire_db_csv(db: &Database, target_dir: &Path) -> Result<DatabaseExportResult, String> {
    if !target_dir.exists() {
        fs::create_dir_all(target_dir).map_err(|e| format!("Failed to create target dir: {}", e))?;
    }

    let subjects = db.get_subjects()?;
    let checkouts = db.get_all_checkouts_raw()?;
    let incidents = db.get_incidents()?;
    let rules = db.get_borrowing_rules()?;
    let audits = db.get_stock_audits(None)?;
    let audit_logs = db.get_audit_logs()?;
    let schools = db.get_schools()?;

    let mut filenames = Vec::new();

    // 1. quantlib_subjects.csv
    {
        let fname = "quantlib_subjects.csv";
        let mut f = File::create(target_dir.join(fname)).map_err(|e| e.to_string())?;
        writeln!(f, "\"id\",\"name\",\"category\",\"openingCount\",\"recovered\",\"issued\",\"damaged\",\"lost\",\"available\",\"notes\",\"averageCondition\",\"degradationRate\"").map_err(|e| e.to_string())?;
        for s in &subjects {
            writeln!(
                f,
                "{},{},{},{},{},{},{},{},{},{},{:.2},{:.4}",
                s.id,
                escape_csv(&s.name),
                escape_csv(s.category.as_deref().unwrap_or("")),
                s.opening_count,
                s.recovered,
                s.issued,
                s.damaged,
                s.lost,
                s.available.unwrap_or(0),
                escape_csv(s.notes.as_deref().unwrap_or("")),
                s.average_condition,
                s.degradation_rate
            ).map_err(|e| e.to_string())?;
        }
        filenames.push(fname.to_string());
    }

    // 2. quantlib_checkouts.csv
    {
        let fname = "quantlib_checkouts.csv";
        let mut f = File::create(target_dir.join(fname)).map_err(|e| e.to_string())?;
        writeln!(f, "\"id\",\"subjectId\",\"studentName\",\"studentClass\",\"checkoutDate\",\"dueDate\",\"returnDate\",\"status\",\"conditionOut\",\"conditionIn\"").map_err(|e| e.to_string())?;
        for c in &checkouts {
            writeln!(
                f,
                "{},{},{},{},{},{},{},{},{},{}",
                c.id,
                c.subject_id,
                escape_csv(&c.student_name),
                escape_csv(c.student_class.as_deref().unwrap_or("")),
                escape_csv(&c.checkout_date),
                escape_csv(&c.due_date),
                escape_csv(c.return_date.as_deref().unwrap_or("")),
                escape_csv(&c.status),
                c.condition_out,
                c.condition_in.map(|n| n.to_string()).unwrap_or_default()
            ).map_err(|e| e.to_string())?;
        }
        filenames.push(fname.to_string());
    }

    // 3. quantlib_incidents.csv
    {
        let fname = "quantlib_incidents.csv";
        let mut f = File::create(target_dir.join(fname)).map_err(|e| e.to_string())?;
        writeln!(f, "\"id\",\"type\",\"date\",\"subjectId\",\"bookTitle\",\"condition\",\"comment\",\"reportedBy\",\"responsibleParty\",\"studentClass\",\"actionTaken\"").map_err(|e| e.to_string())?;
        for i in &incidents {
            writeln!(
                f,
                "{},{},{},{},{},{},{},{},{},{},{}",
                i.id,
                escape_csv(&i.incident_type),
                escape_csv(&i.date),
                i.subject_id.map(|n| n.to_string()).unwrap_or_default(),
                escape_csv(&i.book_title),
                escape_csv(i.condition.as_deref().unwrap_or("")),
                escape_csv(i.comment.as_deref().unwrap_or("")),
                escape_csv(i.reported_by.as_deref().unwrap_or("")),
                escape_csv(i.responsible_party.as_deref().unwrap_or("")),
                escape_csv(i.student_class.as_deref().unwrap_or("")),
                escape_csv(i.action_taken.as_deref().unwrap_or(""))
            ).map_err(|e| e.to_string())?;
        }
        filenames.push(fname.to_string());
    }

    // 4. quantlib_borrowing_rules.csv
    {
        let fname = "quantlib_borrowing_rules.csv";
        let mut f = File::create(target_dir.join(fname)).map_err(|e| e.to_string())?;
        writeln!(f, "\"id\",\"roleOrGrade\",\"maxBooksAllowed\",\"borrowDurationDays\",\"finePerDay\"").map_err(|e| e.to_string())?;
        for r in &rules {
            writeln!(
                f,
                "{},{},{},{},{:.2}",
                r.id,
                escape_csv(&r.role_or_grade),
                r.max_books_allowed,
                r.borrow_duration_days,
                r.fine_per_day
            ).map_err(|e| e.to_string())?;
        }
        filenames.push(fname.to_string());
    }

    // 5. quantlib_stock_audits.csv
    {
        let fname = "quantlib_stock_audits.csv";
        let mut f = File::create(target_dir.join(fname)).map_err(|e| e.to_string())?;
        writeln!(f, "\"id\",\"auditDate\",\"auditedBy\",\"notes\",\"status\"").map_err(|e| e.to_string())?;
        for a in &audits {
            writeln!(
                f,
                "{},{},{},{},{}",
                a.id,
                escape_csv(&a.audit_date),
                escape_csv(a.audited_by.as_deref().unwrap_or("")),
                escape_csv(a.notes.as_deref().unwrap_or("")),
                escape_csv(&a.status)
            ).map_err(|e| e.to_string())?;
        }
        filenames.push(fname.to_string());
    }

    // 6. quantlib_audit_logs.csv
    {
        let fname = "quantlib_audit_logs.csv";
        let mut f = File::create(target_dir.join(fname)).map_err(|e| e.to_string())?;
        writeln!(f, "\"id\",\"subjectId\",\"field\",\"oldValue\",\"newValue\",\"changedBy\",\"changedAt\"").map_err(|e| e.to_string())?;
        for l in &audit_logs {
            writeln!(
                f,
                "{},{},{},{},{},{},{}",
                l.id,
                l.subject_id,
                escape_csv(&l.field),
                escape_csv(&l.old_value),
                escape_csv(&l.new_value),
                escape_csv(l.changed_by.as_deref().unwrap_or("")),
                escape_csv(l.changed_at.as_deref().unwrap_or(""))
            ).map_err(|e| e.to_string())?;
        }
        filenames.push(fname.to_string());
    }

    // 7. quantlib_school_info.csv
    {
        let fname = "quantlib_school_info.csv";
        let mut f = File::create(target_dir.join(fname)).map_err(|e| e.to_string())?;
        writeln!(f, "\"name\",\"motto\",\"logoPath\",\"address\",\"contactPhone\",\"academicYear\"").map_err(|e| e.to_string())?;
        for sc in &schools {
            writeln!(
                f,
                "{},{},{},{},{},{}",
                escape_csv(&sc.name),
                escape_csv(sc.motto.as_deref().unwrap_or("")),
                escape_csv(sc.logo_path.as_deref().unwrap_or("")),
                escape_csv(sc.address.as_deref().unwrap_or("")),
                escape_csv(sc.contact_phone.as_deref().unwrap_or("")),
                escape_csv(sc.academic_year.as_deref().unwrap_or(""))
            ).map_err(|e| e.to_string())?;
        }
        filenames.push(fname.to_string());
    }
    let exported_count = filenames.len() as i64;
    Ok(DatabaseExportResult {
        target_dir: target_dir.to_string_lossy().to_string(),
        exported_count,
        filenames,
    })
}

pub fn get_local_ip() -> String {
    // Attempt to discover local network IP address
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}
