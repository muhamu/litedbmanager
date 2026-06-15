use sqlx::any::AnyPoolOptions;
use sqlx::{Pool, Any, MySql, Postgres, Row};
use std::collections::HashMap;
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::db::types::QueryResult;

// AnyPool is Pool<Any> — sqlx exposes this as a public alias only via sqlx_core, not sqlx::any
type AnyPool = Pool<Any>;

/// Reject hosts containing URL-special chars that could shift connection URL parsing.
fn validate_host(host: &str) -> Result<(), AppError> {
    if host.is_empty() || host.len() > 253 {
        return Err(AppError {
            code: "INVALID_HOST".into(),
            message: "Host must be 1-253 characters".into(),
            hint: None,
        });
    }
    let inner = host.strip_prefix('[').and_then(|h| h.strip_suffix(']')).unwrap_or(host);
    if !inner.chars().all(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | ':')) {
        return Err(AppError {
            code: "INVALID_HOST".into(),
            message: "Host contains invalid characters (@ % / ? # are not allowed)".into(),
            hint: Some("Use a valid hostname or IP address".into()),
        });
    }
    Ok(())
}

/// URL-encode a password for safe inclusion in connection strings.
fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'.' | b'-' | b'_' | b'~' => {
                out.push(byte as char);
            }
            b' ' => out.push_str("%20"),
            _ => {
                out.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    out
}

// ── ClickHouse HTTP client ──

/// Lightweight ClickHouse client that uses the HTTP interface (port 8123/8443).
/// reqwest::Client is Arc internally, so clone is cheap.
#[derive(Clone)]
pub struct ClickhouseClient {
    client: reqwest::Client,
    url: String,
    user: String,
    password: String,
    pub database: String,
}

impl ClickhouseClient {
    pub fn new(host: &str, port: u16, user: &str, password: &str, database: &str, ssl: bool) -> Self {
        let scheme = if ssl { "https" } else { "http" };
        ClickhouseClient {
            client: reqwest::Client::new(),
            url: format!("{}://{}:{}/", scheme, host, port),
            user: user.to_string(),
            password: password.to_string(),
            database: if database.is_empty() { "default".to_string() } else { database.to_string() },
        }
    }

    pub async fn ping(&self) -> Result<String, AppError> {
        let ping_url = format!("{}ping", self.url);
        self.client.get(&ping_url).send().await.map_err(|e| AppError {
            code: "CLICKHOUSE_ERROR".into(),
            message: format!("Cannot connect to ClickHouse: {}", e),
            hint: Some("Check host and port (default HTTP port: 8123)".into()),
        })?.error_for_status().map_err(|e| AppError {
            code: "CLICKHOUSE_ERROR".into(),
            message: format!("ClickHouse ping failed: {}", e),
            hint: None,
        })?;

        // Get server version
        let result = self.query("SELECT version()").await?;
        let version = result.rows.first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        Ok(format!("ClickHouse {}", version))
    }

    /// Run a SELECT/SHOW/DESCRIBE query — appends FORMAT JSONCompact automatically.
    pub async fn query(&self, sql: &str) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let body = format!("{} FORMAT JSONCompact", sql.trim_end_matches(';').trim());

        let resp = self.client
            .post(&self.url)
            .query(&[
                ("user", self.user.as_str()),
                ("password", self.password.as_str()),
                ("database", self.database.as_str()),
                ("output_format_json_quote_64bit_integers", "0"),
            ])
            .body(body)
            .send()
            .await
            .map_err(ch_err)?;

        let elapsed = start.elapsed();

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError {
                code: "CLICKHOUSE_QUERY_ERROR".into(),
                message: text.lines().next().unwrap_or(&text).to_string(),
                hint: None,
            });
        }

        let text = resp.text().await.map_err(ch_err)?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| AppError {
            code: "PARSE_ERROR".into(),
            message: format!("Failed to parse ClickHouse response: {}", e),
            hint: None,
        })?;

        let columns: Vec<String> = json["meta"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
            .collect();

        let rows: Vec<Vec<serde_json::Value>> = json["data"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|r| r.as_array().cloned())
            .collect();

        Ok(QueryResult {
            rows_affected: rows.len() as u64,
            columns,
            rows,
            execution_time_ms: elapsed.as_millis() as u64,
        })
    }

    /// Run a DDL/DML statement (no result rows expected).
    pub async fn execute(&self, sql: &str) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let resp = self.client
            .post(&self.url)
            .query(&[
                ("user", self.user.as_str()),
                ("password", self.password.as_str()),
                ("database", self.database.as_str()),
            ])
            .body(sql.to_string())
            .send()
            .await
            .map_err(ch_err)?;

        let elapsed = start.elapsed();

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError {
                code: "CLICKHOUSE_QUERY_ERROR".into(),
                message: text.lines().next().unwrap_or(&text).to_string(),
                hint: None,
            });
        }

        Ok(QueryResult::from_execution(elapsed, 0))
    }

    /// Run any SQL — detects SELECT-like queries and adds FORMAT automatically.
    pub async fn run(&self, sql: &str) -> Result<QueryResult, AppError> {
        let upper = sql.trim_start().to_uppercase();
        let returns_rows = upper.starts_with("SELECT")
            || upper.starts_with("SHOW")
            || upper.starts_with("DESCRIBE")
            || upper.starts_with("DESC")
            || upper.starts_with("EXPLAIN")
            || upper.starts_with("WITH");
        if returns_rows { self.query(sql).await } else { self.execute(sql).await }
    }
}

fn ch_err(e: reqwest::Error) -> AppError {
    AppError {
        code: "CLICKHOUSE_ERROR".into(),
        message: e.to_string(),
        hint: None,
    }
}

// ── Typed pool — used for data queries so DECIMAL/DATE types decode correctly ──

#[derive(Clone)]
pub enum TypedPool {
    MySql(Pool<MySql>),
    Postgres(Pool<Postgres>),
}

// ── Pool entry — holds either a sqlx pool or a ClickHouse client ──

#[derive(Clone)]
pub struct PoolEntry {
    pub pool: Option<AnyPool>,    // for schema/DDL queries (information_schema, SHOW, etc.)
    pub typed: Option<TypedPool>, // for data queries (handles DECIMAL, DATE, DATETIME, etc.)
    pub ch: Option<ClickhouseClient>,
    pub db_type: String, // "mysql" | "postgres" | "clickhouse"
}

async fn close_typed(t: Option<TypedPool>) {
    match t {
        Some(TypedPool::MySql(p)) => p.close().await,
        Some(TypedPool::Postgres(p)) => p.close().await,
        None => {}
    }
}

pub struct PoolManager {
    pools: Mutex<HashMap<String, PoolEntry>>,
}

impl PoolManager {
    pub fn new() -> Self {
        Self { pools: Mutex::new(HashMap::new()) }
    }

    pub async fn connect(
        &self,
        id: &str,
        host: &str,
        port: u16,
        user: &str,
        password: &str,
        database: Option<&str>,
        ssl: bool,
        db_type: &str,
    ) -> Result<String, AppError> {
        // ── ClickHouse path ──
        if db_type == "clickhouse" {
            validate_host(host)?;
            let db = database.unwrap_or("default");
            let ch = ClickhouseClient::new(host, port, user, password, db, ssl);
            let version = ch.ping().await?;
            let mut pools = self.pools.lock().await;
            if let Some(old) = pools.remove(id) {
                if let Some(p) = old.pool { p.close().await; }
            }
            pools.insert(id.to_string(), PoolEntry { pool: None, typed: None, ch: Some(ch), db_type: "clickhouse".into() });
            return Ok(version);
        }

        // ── sqlx path (MySQL / PostgreSQL) ──
        validate_host(host)?;
        let encoded_user = url_encode(user);
        let encoded_pass = url_encode(password);
        let db = database.unwrap_or(match db_type {
            "postgres" => "postgres",
            _ => "mysql",
        });
        let ssl_param = match db_type {
            "postgres" => if ssl { "sslmode=require" } else { "sslmode=disable" },
            _ => if ssl { "ssl-mode=PREFERRED" } else { "ssl-mode=DISABLED" },
        };
        let scheme = match db_type { "postgres" => "postgres", _ => "mysql" };
        let conn_string = format!("{}://{}:{}@{}:{}/{}?{}", scheme, encoded_user, encoded_pass, host, port, db, ssl_param);

        let pool = AnyPoolOptions::new().max_connections(5).connect(&conn_string).await?;
        let version_row = sqlx::query(match db_type {
            "postgres" => "SELECT version()",
            _ => "SELECT VERSION()",
        }).fetch_one(&pool).await?;
        let version: String = version_row.get(0);

        // Typed pool for data queries — handles DECIMAL, DATE, DATETIME, etc.
        let typed = if db_type == "postgres" {
            TypedPool::Postgres(sqlx::postgres::PgPoolOptions::new().max_connections(3).connect(&conn_string).await?)
        } else {
            TypedPool::MySql(sqlx::mysql::MySqlPoolOptions::new().max_connections(3).connect(&conn_string).await?)
        };

        let mut pools = self.pools.lock().await;
        if let Some(old) = pools.remove(id) {
            if let Some(p) = old.pool { p.close().await; }
            close_typed(old.typed).await;
        }
        pools.insert(id.to_string(), PoolEntry { pool: Some(pool), typed: Some(typed), ch: None, db_type: db_type.to_string() });
        Ok(version)
    }

    pub async fn disconnect(&self, id: &str) {
        let mut pools = self.pools.lock().await;
        if let Some(entry) = pools.remove(id) {
            if let Some(p) = entry.pool { p.close().await; }
            close_typed(entry.typed).await;
        }
    }

    pub async fn test_connection(
        host: &str,
        port: u16,
        user: &str,
        password: &str,
        database: Option<&str>,
        ssl: bool,
        db_type: &str,
    ) -> Result<String, AppError> {
        // ── ClickHouse path ──
        if db_type == "clickhouse" {
            validate_host(host)?;
            let db = database.unwrap_or("default");
            let ch = ClickhouseClient::new(host, port, user, password, db, ssl);
            return ch.ping().await;
        }

        // ── sqlx path ──
        validate_host(host)?;
        let encoded_user = url_encode(user);
        let encoded_pass = url_encode(password);
        let db = database.unwrap_or(match db_type { "postgres" => "postgres", _ => "mysql" });
        let ssl_param = match db_type {
            "postgres" => if ssl { "sslmode=require" } else { "sslmode=disable" },
            _ => if ssl { "ssl-mode=PREFERRED" } else { "ssl-mode=DISABLED" },
        };
        let scheme = match db_type { "postgres" => "postgres", _ => "mysql" };
        let conn_string = format!("{}://{}:{}@{}:{}/{}?{}", scheme, encoded_user, encoded_pass, host, port, db, ssl_param);

        let pool = AnyPoolOptions::new().max_connections(1).connect(&conn_string).await?;
        let version_row = sqlx::query(match db_type {
            "postgres" => "SELECT version()",
            _ => "SELECT VERSION()",
        }).fetch_one(&pool).await?;
        let version: String = version_row.get(0);
        pool.close().await;
        Ok(version)
    }

    pub async fn get_pool(&self, id: &str) -> Option<PoolEntry> {
        let pools = self.pools.lock().await;
        pools.get(id).cloned()
    }
}
