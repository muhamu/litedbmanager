use tauri::State;
use std::time::Instant;

use crate::error::AppError;
use crate::db::pool::{PoolManager, TypedPool};
use crate::db::types::QueryResult;

const MAX_QUERY_LEN: usize = 1_048_576; // 1 MiB

/// First SQL keyword, skipping leading whitespace and comments (-- , # , /* */).
/// Used to decide whether the statement returns rows. Comment-aware so a query
/// like "-- note\nSELECT ..." is still recognised as a SELECT.
fn leading_keyword(sql: &str) -> String {
    let mut s = sql.trim_start();
    loop {
        if let Some(rest) = s.strip_prefix("--").or_else(|| s.strip_prefix('#')) {
            s = rest.find('\n').map(|i| &rest[i + 1..]).unwrap_or("").trim_start();
        } else if let Some(rest) = s.strip_prefix("/*") {
            s = rest.find("*/").map(|i| &rest[i + 2..]).unwrap_or("").trim_start();
        } else {
            break;
        }
    }
    s.split(|c: char| c.is_whitespace() || c == '(')
        .next().unwrap_or("").to_uppercase()
}

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

    // ── ClickHouse path ──
    if entry.db_type == "clickhouse" {
        let ch = entry.ch.as_ref().ok_or_else(|| AppError {
            code: "NOT_CONNECTED".into(),
            message: "ClickHouse client not found".into(),
            hint: None,
        })?;
        return ch.run(trimmed).await;
    }

    // ── MySQL / PostgreSQL via raw_sql (text/simple protocol) ──
    // raw_sql does NOT prepare, so it tolerates comments, multiple statements,
    // SET/USE, etc. — and returns every value as text, which decodes DECIMAL,
    // DATE, DATETIME and BIGINT correctly (the binary `Any` path could not).
    let typed = entry.typed.as_ref().ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected to database".into(),
        hint: None,
    })?;

    let kw = leading_keyword(trimmed);
    let returns_rows = matches!(
        kw.as_str(),
        "SELECT" | "SHOW" | "DESCRIBE" | "DESC" | "EXPLAIN" | "WITH" | "TABLE" | "VALUES" | "CALL"
    );

    if returns_rows {
        match typed {
            TypedPool::MySql(p) => {
                let rows = sqlx::raw_sql(trimmed).fetch_all(p).await?;
                Ok(QueryResult::from_mysql_rows(rows, start.elapsed()))
            }
            TypedPool::Postgres(p) => {
                let rows = sqlx::raw_sql(trimmed).fetch_all(p).await?;
                Ok(QueryResult::from_pg_rows(rows, start.elapsed()))
            }
        }
    } else {
        let affected = match typed {
            TypedPool::MySql(p) => sqlx::raw_sql(trimmed).execute(p).await?.rows_affected(),
            TypedPool::Postgres(p) => sqlx::raw_sql(trimmed).execute(p).await?.rows_affected(),
        };
        Ok(QueryResult::from_execution(start.elapsed(), affected))
    }
}
