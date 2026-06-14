use serde::Serialize;
use std::fmt;

/// Sanitize a potentially sensitive message by removing content between
/// `://` and the next `@` (which would be `user:password@` in a URL).
fn sanitize(msg: &str) -> String {
    // Remove common patterns like "mysql://user:pass@host" from error messages
    let s = msg.to_string();
    if let Some(start) = s.find("://") {
        if let Some(end) = s[start..].find('@') {
            let prefix = &s[..start + 3]; // keep "://"
            let suffix = &s[start + 3 + end..];
            return format!("{}<credentials-hidden>{}", prefix, suffix);
        }
    }
    s
}

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub hint: Option<String>,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::Database(db) => AppError {
                code: "DB_ERROR".into(),
                // Database errors from MySQL are user-facing SQL errors — safe to show
                message: db.message().into(),
                hint: Some(db.code().unwrap_or_default().into()),
            },
            sqlx::Error::PoolClosed => AppError {
                code: "POOL_CLOSED".into(),
                message: "Connection pool is closed".into(),
                hint: Some("Reconnect to the database".into()),
            },
            sqlx::Error::PoolTimedOut => AppError {
                code: "POOL_TIMEOUT".into(),
                message: "Connection pool timed out".into(),
                hint: Some("Check database load or increase pool size".into()),
            },
            sqlx::Error::Io(_) => AppError {
                code: "IO_ERROR".into(),
                message: "Network error connecting to database".into(),
                hint: Some("Check if the database server is running and reachable".into()),
            },
            sqlx::Error::Protocol(p) => AppError {
                code: "PROTOCOL_ERROR".into(),
                message: format!("Protocol error: {}", sanitize(&p.to_string())),
                hint: Some("Check database compatibility".into()),
            },
            sqlx::Error::Tls(_) => AppError {
                code: "TLS_ERROR".into(),
                message: "TLS/SSL connection error".into(),
                hint: Some("Check SSL configuration".into()),
            },
            sqlx::Error::Configuration(c) => AppError {
                code: "CONFIG_ERROR".into(),
                message: sanitize(&c.to_string()),
                hint: None,
            },
            _ => AppError {
                code: "SQLX_ERROR".into(),
                message: sanitize(&e.to_string()),
                hint: None,
            },
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError {
            code: "SERIALIZE_ERROR".into(),
            message: e.to_string(),
            hint: None,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError {
            code: "IO_ERROR".into(),
            message: e.to_string(),
            hint: None,
        }
    }
}
