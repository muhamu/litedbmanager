use tauri::State;
use std::time::Instant;

use crate::error::AppError;
use crate::db::pool::PoolManager;
use crate::db::types::QueryResult;

const MAX_QUERY_LEN: usize = 1_048_576; // 1 MiB — sanity cap, not a security boundary

#[tauri::command]
pub async fn execute_query(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    query: String,
) -> Result<QueryResult, AppError> {
    if query.len() > MAX_QUERY_LEN {
        return Err(AppError {
            code: "QUERY_TOO_LARGE".into(),
            message: "Query exceeds maximum allowed size (1 MiB)".into(),
            hint: Some("Split the query into smaller parts".into()),
        });
    }

    let entry = pool_manager
        .get_pool(&profile_id)
        .await
        .ok_or_else(|| AppError {
            code: "NOT_CONNECTED".into(),
            message: "Not connected to database".into(),
            hint: Some("Connect to a profile first".into()),
        })?;

    let start = Instant::now();
    let trimmed = query.trim();

    // Detect if the query returns rows
    let upper = trimmed.to_uppercase();
    let returns_rows = upper.starts_with("SELECT")
        || upper.starts_with("SHOW")
        || upper.starts_with("DESCRIBE")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("WITH");

    if returns_rows {
        let rows = sqlx::query(trimmed)
            .fetch_all(&entry.pool)
            .await?;
        let elapsed = start.elapsed();
        Ok(QueryResult::from_rows(rows, elapsed))
    } else {
        let result = sqlx::query(trimmed).execute(&entry.pool).await?;
        let elapsed = start.elapsed();
        Ok(QueryResult::from_execution(elapsed, result.rows_affected() as u64))
    }
}
