use serde::Serialize;
use sqlx::any::AnyRow;
use sqlx::Column;
use sqlx::Row;

#[derive(Debug, Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: u64,
    pub execution_time_ms: u64,
}

impl QueryResult {
    pub fn from_rows(rows: Vec<AnyRow>, elapsed: std::time::Duration) -> Self {
        let columns = if rows.is_empty() {
            vec![]
        } else {
            row_columns(&rows[0])
        };

        let data: Vec<Vec<serde_json::Value>> = rows
            .iter()
            .map(|row| {
                columns
                    .iter()
                    .enumerate()
                    .map(|(i, _)| row_to_json(row, i))
                    .collect()
            })
            .collect();

        Self {
            columns,
            rows: data,
            rows_affected: 0,
            execution_time_ms: elapsed.as_millis() as u64,
        }
    }

    pub fn from_execution(elapsed: std::time::Duration, rows_affected: u64) -> Self {
        Self {
            columns: vec![],
            rows: vec![],
            rows_affected,
            execution_time_ms: elapsed.as_millis() as u64,
        }
    }
}

fn row_columns(row: &AnyRow) -> Vec<String> {
    row.columns().iter().map(|c| c.name().to_string()).collect()
}

fn row_to_json(row: &AnyRow, idx: usize) -> serde_json::Value {
    if let Ok(val) = row.try_get::<String, _>(idx) {
        return serde_json::Value::String(val);
    }
    if let Ok(val) = row.try_get::<i64, _>(idx) {
        return serde_json::Value::Number(val.into());
    }
    if let Ok(val) = row.try_get::<f64, _>(idx) {
        if let Some(n) = serde_json::Number::from_f64(val) {
            return serde_json::Value::Number(n);
        }
    }
    if let Ok(val) = row.try_get::<bool, _>(idx) {
        return serde_json::Value::Bool(val);
    }
    if let Ok(val) = row.try_get::<i32, _>(idx) {
        return serde_json::Value::Number((val as i64).into());
    }
    serde_json::Value::Null
}
