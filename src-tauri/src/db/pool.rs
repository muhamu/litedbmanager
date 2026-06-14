use sqlx::any::AnyPoolOptions;
use sqlx::{Pool, Any, Row};
use std::collections::HashMap;
use tokio::sync::Mutex;

use crate::error::AppError;

// AnyPool is Pool<Any> — sqlx exposes this as a public alias only via sqlx_core, not sqlx::any
type AnyPool = Pool<Any>;

/// Reject hosts containing URL-special chars that could shift connection URL parsing.
/// Allows: alphanumeric, dots, hyphens (hostnames), colons and brackets (IPv6).
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

#[derive(Clone)]
pub struct PoolEntry {
    pub pool: AnyPool,
    pub db_type: String, // "mysql" or "postgres"
}

pub struct PoolManager {
    pools: Mutex<HashMap<String, PoolEntry>>,
}

impl PoolManager {
    pub fn new() -> Self {
        Self {
            pools: Mutex::new(HashMap::new()),
        }
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
        validate_host(host)?;
        let encoded_user = url_encode(user);
        let encoded_pass = url_encode(password);
        let db = database.unwrap_or(match db_type {
            "postgres" => "postgres",
            _ => "mysql",
        });

        let ssl_param = match db_type {
            "postgres" => {
                if ssl { "sslmode=require" } else { "sslmode=disable" }
            }
            _ => {
                if ssl { "ssl-mode=PREFERRED" } else { "ssl-mode=DISABLED" }
            }
        };

        let scheme = match db_type {
            "postgres" => "postgres",
            _ => "mysql",
        };

        let conn_string = format!(
            "{}://{}:{}@{}:{}/{}?{}",
            scheme, encoded_user, encoded_pass, host, port, db, ssl_param
        );

        let pool = AnyPoolOptions::new()
            .max_connections(5)
            .connect(&conn_string)
            .await?;

        // Get version
        let version_row = sqlx::query(
            match db_type {
                "postgres" => "SELECT version()",
                _ => "SELECT VERSION()",
            }
        )
        .fetch_one(&pool)
        .await?;
        let version: String = version_row.get(0);

        let mut pools = self.pools.lock().await;
        if let Some(old) = pools.remove(id) {
            old.pool.close().await;
        }
        pools.insert(
            id.to_string(),
            PoolEntry {
                pool,
                db_type: db_type.to_string(),
            },
        );
        Ok(version)
    }

    pub async fn disconnect(&self, id: &str) {
        let mut pools = self.pools.lock().await;
        if let Some(entry) = pools.remove(id) {
            entry.pool.close().await;
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
        validate_host(host)?;
        let encoded_user = url_encode(user);
        let encoded_pass = url_encode(password);
        let db = database.unwrap_or(match db_type {
            "postgres" => "postgres",
            _ => "mysql",
        });

        let ssl_param = match db_type {
            "postgres" => {
                if ssl { "sslmode=require" } else { "sslmode=disable" }
            }
            _ => {
                if ssl { "ssl-mode=PREFERRED" } else { "ssl-mode=DISABLED" }
            }
        };

        let scheme = match db_type {
            "postgres" => "postgres",
            _ => "mysql",
        };

        let conn_string = format!(
            "{}://{}:{}@{}:{}/{}?{}",
            scheme, encoded_user, encoded_pass, host, port, db, ssl_param
        );

        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect(&conn_string)
            .await?;

        let version_row = sqlx::query(
            match db_type {
                "postgres" => "SELECT version()",
                _ => "SELECT VERSION()",
            }
        )
        .fetch_one(&pool)
        .await?;
        let version: String = version_row.get(0);

        pool.close().await;
        Ok(version)
    }

    pub async fn get_pool(&self, id: &str) -> Option<PoolEntry> {
        let pools = self.pools.lock().await;
        pools.get(id).cloned()
    }
}
