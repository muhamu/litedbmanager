mod commands;
mod db;
mod error;
mod storage;

use commands::connection;
use commands::export;
use commands::query;
use commands::schema;

use tauri::Manager;
pub use error::AppError;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Register MySQL and PostgreSQL with sqlx's runtime-generic Any driver.
            // Without this, Pool<Any> panics on first connection attempt.
            sqlx::any::install_default_drivers();

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let profile_store = storage::profiles::ProfileStore::new()
                .expect("Failed to initialize profile store");
            app.manage(profile_store);

            let pool_manager = db::pool::PoolManager::new();
            app.manage(pool_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connection::list_profiles,
            connection::save_profile,
            connection::delete_profile,
            connection::test_connection,
            connection::connect_to_profile,
            connection::disconnect_profile,
            query::execute_query,
            schema::list_databases,
            schema::list_tables,
            schema::list_columns,
            schema::list_indexes,
            schema::list_foreign_keys,
            schema::show_table_data,
            schema::count_table_rows,
            schema::get_create_statement,
            schema::truncate_table,
            schema::drop_object,
            schema::get_autocomplete_data,
            export::export_csv,
            export::export_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
