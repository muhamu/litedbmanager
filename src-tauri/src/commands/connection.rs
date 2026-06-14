use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::storage::keychain;
use crate::storage::profiles::{ConnectionProfile, ProfileInput, ProfileStore};
use crate::db::pool::PoolManager;

#[tauri::command]
pub async fn list_profiles(
    store: State<'_, ProfileStore>,
) -> Result<Vec<ConnectionProfile>, AppError> {
    Ok(store.list().await)
}

#[tauri::command]
pub async fn save_profile(
    store: State<'_, ProfileStore>,
    input: ProfileInput,
) -> Result<ConnectionProfile, AppError> {
    let id = Uuid::new_v4().to_string();
    let password = input.password.clone();
    let now = chrono_now();

    // Validate db_type
    if input.db_type != "mysql" && input.db_type != "postgres" {
        return Err(AppError {
            code: "INVALID_DB_TYPE".into(),
            message: "Database type must be 'mysql' or 'postgres'".into(),
            hint: None,
        });
    }

    let profile = ConnectionProfile {
        id: id.clone(),
        name: input.name,
        host: input.host,
        port: input.port,
        user: input.user,
        database: input.database,
        ssl: input.ssl,
        db_type: input.db_type,
        created_at: now,
    };

    // Save password to macOS Keychain (not plaintext)
    keychain::set_password(&id, &password).map_err(|e| AppError {
        code: "KEYCHAIN_ERROR".into(),
        message: format!("Failed to save password: {}", e),
        hint: Some("Check your Keychain access".into()),
    })?;

    store.save(id, profile.clone()).await?;
    Ok(profile)
}

#[tauri::command]
pub async fn delete_profile(
    store: State<'_, ProfileStore>,
    pool_manager: State<'_, PoolManager>,
    id: String,
) -> Result<(), AppError> {
    pool_manager.disconnect(&id).await;
    let _ = keychain::delete_password(&id);
    store.delete(&id).await?;
    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    host: String,
    port: u16,
    user: String,
    password: String,
    database: Option<String>,
    ssl: bool,
    db_type: String,
) -> Result<String, AppError> {
    if db_type != "mysql" && db_type != "postgres" {
        return Err(AppError {
            code: "INVALID_DB_TYPE".into(),
            message: "Database type must be 'mysql' or 'postgres'".into(),
            hint: None,
        });
    }
    PoolManager::test_connection(&host, port, &user, &password, database.as_deref(), ssl, &db_type).await
}

#[tauri::command]
pub async fn connect_to_profile(
    store: State<'_, ProfileStore>,
    pool_manager: State<'_, PoolManager>,
    id: String,
) -> Result<String, AppError> {
    let profile = store
        .get(&id)
        .await
        .ok_or_else(|| AppError {
            code: "NOT_FOUND".into(),
            message: "Profile not found".into(),
            hint: None,
        })?;

    let password = keychain::get_password(&id).map_err(|e| AppError {
        code: "KEYCHAIN_ERROR".into(),
        message: format!("Failed to get password: {}", e),
        hint: Some("Check your Keychain access".into()),
    })?;

    let version = pool_manager
        .connect(
            &id,
            &profile.host,
            profile.port,
            &profile.user,
            &password,
            profile.database.as_deref(),
            profile.ssl,
            &profile.db_type,
        )
        .await?;

    Ok(version)
}

#[tauri::command]
pub async fn disconnect_profile(
    pool_manager: State<'_, PoolManager>,
    id: String,
) -> Result<(), AppError> {
    pool_manager.disconnect(&id).await;
    Ok(())
}

fn chrono_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining < md {
            m = i + 1;
            break;
        }
        remaining -= md;
    }
    if m == 0 {
        m = 12;
    }
    let d = remaining + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, hours, minutes, seconds
    )
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}
