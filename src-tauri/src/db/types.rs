use serde::Serialize;
use sqlx::{Row, Column};

#[derive(Debug, Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: u64,
    pub execution_time_ms: u64,
}

impl QueryResult {
    pub fn from_mysql_rows(rows: Vec<sqlx::mysql::MySqlRow>, elapsed: std::time::Duration) -> Self {
        let columns: Vec<String> = if rows.is_empty() { vec![] } else {
            rows[0].columns().iter().map(|c| c.name().to_string()).collect()
        };
        let data = rows.iter().map(|row|
            (0..columns.len()).map(|i| mysql_to_json(row, i)).collect()
        ).collect();
        Self { columns, rows: data, rows_affected: 0, execution_time_ms: elapsed.as_millis() as u64 }
    }

    pub fn from_pg_rows(rows: Vec<sqlx::postgres::PgRow>, elapsed: std::time::Duration) -> Self {
        let columns: Vec<String> = if rows.is_empty() { vec![] } else {
            rows[0].columns().iter().map(|c| c.name().to_string()).collect()
        };
        let data = rows.iter().map(|row|
            (0..columns.len()).map(|i| pg_to_json(row, i)).collect()
        ).collect();
        Self { columns, rows: data, rows_affected: 0, execution_time_ms: elapsed.as_millis() as u64 }
    }

    pub fn from_execution(elapsed: std::time::Duration, rows_affected: u64) -> Self {
        Self { columns: vec![], rows: vec![], rows_affected, execution_time_ms: elapsed.as_millis() as u64 }
    }
}

fn mysql_to_json(row: &sqlx::mysql::MySqlRow, idx: usize) -> serde_json::Value {
    // String covers VARCHAR, TEXT, CHAR, ENUM, JSON, and DECIMAL (MySQL sends DECIMAL as text in binary protocol)
    if let Ok(v) = row.try_get::<String, _>(idx) { return serde_json::Value::String(v); }
    if let Ok(v) = row.try_get::<i64, _>(idx) { return serde_json::Value::Number(v.into()); }
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        if let Some(n) = serde_json::Number::from_f64(v) { return serde_json::Value::Number(n); }
    }
    if let Ok(v) = row.try_get::<bool, _>(idx) { return serde_json::Value::Bool(v); }
    if let Ok(v) = row.try_get::<i32, _>(idx) { return serde_json::Value::Number((v as i64).into()); }
    if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(idx) { return serde_json::Value::String(v.to_string()); }
    if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(idx) { return serde_json::Value::String(v.to_string()); }
    if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(idx) { return serde_json::Value::String(v.to_string()); }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        return serde_json::Value::String(
            v.iter().fold(String::with_capacity(v.len() * 2), |mut s, b| {
                use std::fmt::Write; let _ = write!(s, "{:02x}", b); s
            })
        );
    }
    serde_json::Value::Null
}

fn pg_to_json(row: &sqlx::postgres::PgRow, idx: usize) -> serde_json::Value {
    if let Ok(v) = row.try_get::<String, _>(idx) { return serde_json::Value::String(v); }
    if let Ok(v) = row.try_get::<i64, _>(idx) { return serde_json::Value::Number(v.into()); }
    if let Ok(v) = row.try_get::<i32, _>(idx) { return serde_json::Value::Number((v as i64).into()); }
    if let Ok(v) = row.try_get::<i16, _>(idx) { return serde_json::Value::Number((v as i64).into()); }
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        if let Some(n) = serde_json::Number::from_f64(v) { return serde_json::Value::Number(n); }
    }
    if let Ok(v) = row.try_get::<f32, _>(idx) {
        if let Some(n) = serde_json::Number::from_f64(v as f64) { return serde_json::Value::Number(n); }
    }
    if let Ok(v) = row.try_get::<bool, _>(idx) { return serde_json::Value::Bool(v); }
    if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(idx) { return serde_json::Value::String(v.to_string()); }
    if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(idx) { return serde_json::Value::String(v.to_rfc3339()); }
    if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(idx) { return serde_json::Value::String(v.to_string()); }
    if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(idx) { return serde_json::Value::String(v.to_string()); }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        return serde_json::Value::String(
            v.iter().fold(String::with_capacity(v.len() * 2), |mut s, b| {
                use std::fmt::Write; let _ = write!(s, "{:02x}", b); s
            })
        );
    }
    serde_json::Value::Null
}
