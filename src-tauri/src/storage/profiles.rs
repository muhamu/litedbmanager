use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::Mutex;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub database: Option<String>,
    pub ssl: bool,
    #[serde(default = "default_db_type")]
    pub db_type: String, // "mysql" or "postgres"
    pub created_at: String,
}

fn default_db_type() -> String {
    "mysql".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileInput {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: Option<String>,
    pub ssl: bool,
    pub db_type: String,
}

pub struct ProfileStore {
    path: PathBuf,
    profiles: Mutex<HashMap<String, ConnectionProfile>>,
}

impl ProfileStore {
    pub fn new() -> Result<Self, AppError> {
        let dir = directories::ProjectDirs::from("com", "litedb", "manager")
            .ok_or_else(|| AppError {
                code: "CONFIG_DIR".into(),
                message: "Cannot determine config directory".into(),
                hint: None,
            })?;

        let config_dir = dir.config_dir().to_path_buf();
        std::fs::create_dir_all(&config_dir)?;

        let path = config_dir.join("profiles.json");

        let profiles = if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            HashMap::new()
        };

        Ok(Self {
            path,
            profiles: Mutex::new(profiles),
        })
    }

    pub async fn list(&self) -> Vec<ConnectionProfile> {
        let guard = self.profiles.lock().await;
        let mut list: Vec<_> = guard.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get(&self, id: &str) -> Option<ConnectionProfile> {
        let guard = self.profiles.lock().await;
        guard.get(id).cloned()
    }

    pub async fn save(
        &self,
        id: String,
        profile: ConnectionProfile,
    ) -> Result<(), AppError> {
        {
            let mut guard = self.profiles.lock().await;
            guard.insert(id, profile);
        }
        self.flush().await
    }

    pub async fn delete(&self, id: &str) -> Result<(), AppError> {
        {
            let mut guard = self.profiles.lock().await;
            guard.remove(id);
        }
        self.flush().await
    }

    async fn flush(&self) -> Result<(), AppError> {
        let guard = self.profiles.lock().await;
        let content = serde_json::to_string_pretty(&*guard)?;
        Ok(std::fs::write(&self.path, content)?)
    }
}
