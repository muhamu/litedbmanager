use tauri::State;
use sqlx::Row;

use crate::db::pool::TypedPool;

use crate::error::AppError;
use crate::db::pool::PoolManager;

// ── Identifier validation ──

fn validate_identifier(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.len() > 128 {
        return Err(AppError {
            code: "INVALID_IDENTIFIER".into(),
            message: "Identifier must be 1-128 characters".into(),
            hint: None,
        });
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$') {
        return Err(AppError {
            code: "INVALID_IDENTIFIER".into(),
            message: "Identifier contains invalid characters".into(),
            hint: Some("Use alphanumeric, underscore, or dollar sign".into()),
        });
    }
    Ok(())
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn qualifed_name(db: &str, obj: &str, db_type: &str) -> Result<String, AppError> {
    validate_identifier(db)?;
    validate_identifier(obj)?;
    match db_type {
        "postgres" => Ok(format!("{}.{}", quote_ident(db), quote_ident(obj))),
        // MySQL and ClickHouse both use backtick
        _ => Ok(format!("`{}`.`{}`", db.replace('`', "``"), obj.replace('`', "``"))),
    }
}

/// Escape a string literal for ClickHouse single-quoted strings.
fn ch_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

fn not_connected() -> AppError {
    AppError { code: "NOT_CONNECTED".into(), message: "Not connected".into(), hint: None }
}

// ── Data structures ──

#[derive(serde::Serialize)]
pub struct SchemaItem {
    pub name: String,
    pub item_type: String,
}

#[derive(serde::Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub col_type: String,
    pub nullable: bool,
    pub key: String,
    pub default: Option<String>,
    pub extra: String,
}

#[derive(serde::Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
    pub index_type: String,
}

#[derive(serde::Serialize)]
pub struct ForeignKeyInfo {
    pub constraint_name: String,
    pub column: String,
    pub ref_database: String,
    pub ref_table: String,
    pub ref_column: String,
    pub update_rule: String,
    pub delete_rule: String,
}

#[derive(serde::Serialize)]
pub struct AutocompleteItem {
    pub name: String,
    pub item_type: String,
    pub table_name: Option<String>,
}

#[derive(serde::Serialize)]
pub struct AutocompleteData {
    pub items: Vec<AutocompleteItem>,
}

// ── Commands ──

#[tauri::command]
pub async fn list_databases(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
) -> Result<Vec<String>, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        let result = ch.query(
            "SELECT name FROM system.databases \
             WHERE name NOT IN ('system','information_schema','INFORMATION_SCHEMA','_temporary_and_external_tables') \
             ORDER BY name"
        ).await?;
        return Ok(result.rows.iter()
            .filter_map(|r| r.first().and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect());
    }

    let pool = entry.pool.as_ref().unwrap();
    if db_type == "postgres" {
        let result = sqlx::query(
            "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres')"
        ).fetch_all(pool).await?;
        Ok(result.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
    } else {
        let result = sqlx::query("SHOW DATABASES").fetch_all(pool).await?;
        Ok(result.iter()
            .filter_map(|r| r.try_get::<String, _>(0).ok())
            .filter(|name| !matches!(
                name.to_lowercase().as_str(),
                "information_schema" | "performance_schema" | "mysql" | "sys"
            ))
            .collect())
    }
}

#[tauri::command]
pub async fn list_tables(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
) -> Result<Vec<SchemaItem>, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        validate_identifier(&database)?;
        let result = ch.query(&format!(
            "SELECT name, multiIf(engine IN ('View','MaterializedView','LiveView','WindowView'),'VIEW','BASE TABLE') \
             FROM system.tables WHERE database = '{}' AND is_temporary = 0 ORDER BY name",
            ch_escape(&database)
        )).await?;
        let mut items: Vec<SchemaItem> = result.rows.iter().filter_map(|r| {
            let name = r.first()?.as_str()?.to_string();
            let ttype = r.get(1)?.as_str().unwrap_or("BASE TABLE");
            Some(SchemaItem {
                name,
                item_type: if ttype == "VIEW" { "view".into() } else { "table".into() },
            })
        }).collect();
        items.sort_by(|a, b| a.item_type.cmp(&b.item_type).then(a.name.cmp(&b.name)));
        return Ok(items);
    }

    let pool = entry.pool.as_ref().unwrap();
    let schema_name: String = if db_type == "postgres" {
        if database.is_empty() || database == "public" { "public".to_string() }
        else { validate_identifier(&database)?; database.clone() }
    } else {
        validate_identifier(&database)?;
        database.clone()
    };

    let mut items: Vec<SchemaItem> = vec![];

    let tables_res = if db_type == "postgres" {
        sqlx::query("SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = $1")
            .bind(&schema_name).fetch_all(pool).await
    } else {
        sqlx::query("SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?")
            .bind(&schema_name).fetch_all(pool).await
    };
    if let Ok(tables) = tables_res {
        for r in tables {
            items.push(SchemaItem {
                name: r.get(0),
                item_type: match r.get::<String, _>(1).as_str() { "VIEW" => "view".into(), _ => "table".into() },
            });
        }
    }

    let routines_res = if db_type == "postgres" {
        sqlx::query("SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = $1")
            .bind(&schema_name).fetch_all(pool).await
    } else {
        sqlx::query("SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?")
            .bind(&schema_name).fetch_all(pool).await
    };
    if let Ok(routines) = routines_res {
        for r in routines {
            items.push(SchemaItem { name: r.get(0), item_type: r.get::<String, _>(1).to_lowercase() });
        }
    }

    let triggers_res = if db_type == "postgres" {
        sqlx::query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = $1")
            .bind(&schema_name).fetch_all(pool).await
    } else {
        sqlx::query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?")
            .bind(&schema_name).fetch_all(pool).await
    };
    if let Ok(triggers) = triggers_res {
        for r in triggers {
            items.push(SchemaItem { name: r.get(0), item_type: "trigger".into() });
        }
    }

    let seq_res = if db_type == "postgres" {
        sqlx::query("SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = $1")
            .bind(&schema_name).fetch_all(pool).await
    } else {
        sqlx::query("SELECT SEQUENCE_NAME FROM information_schema.SEQUENCES WHERE SEQUENCE_SCHEMA = ?")
            .bind(&schema_name).fetch_all(pool).await
    };
    if let Ok(seqs) = seq_res {
        for r in seqs {
            items.push(SchemaItem { name: r.get(0), item_type: "sequence".into() });
        }
    }

    items.sort_by(|a, b| a.item_type.cmp(&b.item_type).then(a.name.cmp(&b.name)));
    Ok(items)
}

#[tauri::command]
pub async fn list_columns(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
) -> Result<Vec<ColumnInfo>, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();
    validate_identifier(&table)?;

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        validate_identifier(&database)?;
        let result = ch.query(&format!(
            "SELECT name, type, is_in_primary_key, default_expression \
             FROM system.columns WHERE database = '{}' AND table = '{}' ORDER BY position",
            ch_escape(&database), ch_escape(&table)
        )).await?;
        return Ok(result.rows.iter().map(|r| {
            let col_type = r.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
            ColumnInfo {
                name: r.first().and_then(|v| v.as_str()).unwrap_or("").to_string(),
                nullable: col_type.starts_with("Nullable("),
                col_type,
                key: if r.get(2).and_then(|v| v.as_u64()).unwrap_or(0) == 1 { "PRI".into() } else { "".into() },
                default: {
                    let d = r.get(3).and_then(|v| v.as_str()).unwrap_or("");
                    if d.is_empty() { None } else { Some(d.to_string()) }
                },
                extra: "".into(),
            }
        }).collect());
    }

    let pool = entry.pool.as_ref().unwrap();
    if db_type == "postgres" {
        let schema = if database == "public" || database.is_empty() { "public" } else { &database };
        validate_identifier(schema)?;
        let rows = sqlx::query(
            "SELECT COLUMN_NAME, \
             CASE WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL \
                  THEN DATA_TYPE || '(' || CHARACTER_MAXIMUM_LENGTH::text || ')' \
                  WHEN NUMERIC_PRECISION IS NOT NULL AND NUMERIC_SCALE IS NOT NULL \
                  THEN DATA_TYPE || '(' || NUMERIC_PRECISION::text || ',' || NUMERIC_SCALE::text || ')' \
                  WHEN NUMERIC_PRECISION IS NOT NULL \
                  THEN DATA_TYPE || '(' || NUMERIC_PRECISION::text || ')' \
                  ELSE DATA_TYPE END AS col_type, \
             IS_NULLABLE, '' AS col_key, COLUMN_DEFAULT, '' AS extra \
             FROM information_schema.COLUMNS \
             WHERE TABLE_SCHEMA = $1 AND TABLE_NAME = $2 ORDER BY ORDINAL_POSITION"
        ).bind(schema).bind(&table).fetch_all(pool).await?;
        Ok(rows.iter().map(|r| ColumnInfo {
            name: r.get(0), col_type: r.get(1),
            nullable: r.get::<String, _>(2) == "YES",
            key: r.get(3), default: r.get(4), extra: r.get::<String, _>(5),
        }).collect())
    } else {
        validate_identifier(&database)?;
        // SHOW FULL COLUMNS reads the table definition directly (instant). The
        // information_schema.COLUMNS query is slow on servers with many tables because
        // MariaDB opens every table in the schema to gather metadata.
        let q = format!(
            "SHOW FULL COLUMNS FROM `{}`.`{}`",
            database.replace('`', "``"), table.replace('`', "``")
        );
        let rows = sqlx::query(&q).fetch_all(pool).await?;
        Ok(rows.iter().map(|r| ColumnInfo {
            name: r.try_get::<String, _>("Field").unwrap_or_default(),
            col_type: r.try_get::<String, _>("Type").unwrap_or_default(),
            nullable: r.try_get::<String, _>("Null").unwrap_or_default() == "YES",
            key: r.try_get::<String, _>("Key").unwrap_or_default(),
            default: r.try_get::<String, _>("Default").ok(),
            extra: r.try_get::<String, _>("Extra").unwrap_or_default(),
        }).collect())
    }
}

#[tauri::command]
pub async fn list_indexes(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
) -> Result<Vec<IndexInfo>, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();
    validate_identifier(&table)?;

    // ClickHouse has no traditional indexes
    if db_type == "clickhouse" {
        return Ok(vec![]);
    }

    let pool = entry.pool.as_ref().unwrap();
    if db_type == "postgres" {
        let schema = if database == "public" || database.is_empty() { "public" } else { &database };
        validate_identifier(schema)?;
        let rows = sqlx::query(
            "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2"
        ).bind(schema).bind(&table).fetch_all(pool).await?;
        Ok(rows.iter().map(|r| {
            let name: String = r.get(0);
            let def: String = r.get(1);
            let unique = def.to_uppercase().contains("UNIQUE");
            let index_type = if def.to_uppercase().contains("USING BTREE") { "BTREE" } else { "OTHER" };
            IndexInfo { name, columns: vec![], unique, index_type: index_type.to_string() }
        }).collect())
    } else {
        validate_identifier(&database)?;
        let q = format!("SHOW INDEX FROM `{}` FROM `{}`",
            table.replace('`', "``"), database.replace('`', "``"));
        let rows = sqlx::query(&q).fetch_all(pool).await?;
        use std::collections::HashMap;
        let mut index_map: HashMap<String, IndexInfo> = HashMap::new();
        for row in &rows {
            let key_name: String = row.get("Key_name");
            let col_name: String = row.get("Column_name");
            let non_unique: i32 = row.get("Non_unique");
            let index_type: String = row.get("Index_type");
            index_map.entry(key_name.clone())
                .and_modify(|info| info.columns.push(col_name.clone()))
                .or_insert(IndexInfo { name: key_name, columns: vec![col_name], unique: non_unique == 0, index_type });
        }
        let mut result: Vec<IndexInfo> = index_map.into_values().collect();
        result.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(result)
    }
}

#[tauri::command]
pub async fn list_foreign_keys(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
) -> Result<Vec<ForeignKeyInfo>, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();
    validate_identifier(&table)?;

    // ClickHouse has no FK constraints
    if db_type == "clickhouse" {
        return Ok(vec![]);
    }

    let pool = entry.pool.as_ref().unwrap();
    if db_type == "postgres" {
        let schema = if database == "public" || database.is_empty() { "public" } else { &database };
        validate_identifier(schema)?;
        let rows = sqlx::query(
            "SELECT tc.constraint_name, kcu.column_name, ccu.table_schema, \
                    ccu.table_name, ccu.column_name, 'NO ACTION', 'NO ACTION' \
             FROM information_schema.table_constraints tc \
             JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name \
             JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name \
             WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2"
        ).bind(schema).bind(&table).fetch_all(pool).await?;
        Ok(rows.iter().map(|r| ForeignKeyInfo {
            constraint_name: r.get(0), column: r.get(1), ref_database: r.get(2),
            ref_table: r.get(3), ref_column: r.get(4), update_rule: r.get(5), delete_rule: r.get(6),
        }).collect())
    } else {
        validate_identifier(&database)?;
        // No JOIN to REFERENTIAL_CONSTRAINTS — that join forces MariaDB to compute FK
        // metadata across all schemas and can hang. The TABLE_SCHEMA/TABLE_NAME filter
        // on KEY_COLUMN_USAGE alone is fast; we don't show update/delete rules in the tree.
        let rows = sqlx::query(
            "SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, \
                    REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME \
             FROM information_schema.KEY_COLUMN_USAGE \
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL"
        ).bind(&database).bind(&table).fetch_all(pool).await?;
        Ok(rows.iter().map(|r| ForeignKeyInfo {
            constraint_name: r.get(0), column: r.get(1), ref_database: r.get(2),
            ref_table: r.get(3), ref_column: r.get(4),
            update_rule: String::new(), delete_rule: String::new(),
        }).collect())
    }
}

#[tauri::command]
pub async fn show_table_data(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
    limit: u32,
    offset: u32,
) -> Result<crate::db::types::QueryResult, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        let fqn = qualifed_name(&database, &table, &db_type)?;
        return ch.query(&format!("SELECT * FROM {} LIMIT {} OFFSET {}", fqn, limit, offset)).await;
    }

    let fqn = qualifed_name(&database, &table, &db_type)?;
    let q = format!("SELECT * FROM {} LIMIT {} OFFSET {}", fqn, limit, offset);
    let start = std::time::Instant::now();
    let typed = entry.typed.as_ref().ok_or_else(not_connected)?;
    // raw_sql (text protocol) so DECIMAL/DATE/DATETIME decode as text instead of NULL
    match typed {
        TypedPool::MySql(p) => {
            let rows = sqlx::raw_sql(&q).fetch_all(p).await?;
            Ok(crate::db::types::QueryResult::from_mysql_rows(rows, start.elapsed()))
        }
        TypedPool::Postgres(p) => {
            let rows = sqlx::raw_sql(&q).fetch_all(p).await?;
            Ok(crate::db::types::QueryResult::from_pg_rows(rows, start.elapsed()))
        }
    }
}

#[tauri::command]
pub async fn count_table_rows(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
) -> Result<u64, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        let fqn = qualifed_name(&database, &table, &db_type)?;
        let result = ch.query(&format!("SELECT count() FROM {}", fqn)).await?;
        return Ok(result.rows.first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_u64())
            .unwrap_or(0));
    }

    let fqn = qualifed_name(&database, &table, &db_type)?;
    let q = format!("SELECT COUNT(*) FROM {}", fqn);
    let row: (i64,) = sqlx::query_as(&q).fetch_one(entry.pool.as_ref().unwrap()).await?;
    Ok(row.0 as u64)
}

#[tauri::command]
pub async fn get_create_statement(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    object: String,
    object_type: String,
) -> Result<String, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();
    validate_identifier(&object)?;

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        validate_identifier(&database)?;
        let fqn = qualifed_name(&database, &object, &db_type)?;
        match object_type.as_str() {
            "table" | "view" => {
                let result = ch.query(&format!("SHOW CREATE TABLE {}", fqn)).await?;
                return Ok(result.rows.first()
                    .and_then(|r| r.first())
                    .and_then(|v| v.as_str())
                    .unwrap_or("-- Cannot get DDL --")
                    .to_string());
            }
            _ => return Ok(format!("-- {} objects not supported in ClickHouse DDL viewer --", object_type)),
        }
    }

    let pool = entry.pool.as_ref().unwrap();

    if db_type == "postgres" {
        let schema = if database == "public" || database.is_empty() { "public" } else { &database };
        validate_identifier(schema)?;
        match object_type.as_str() {
            "table" => {
                let rows = sqlx::query(
                    "SELECT COLUMN_NAME, \
                     CASE WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL \
                          THEN DATA_TYPE || '(' || CHARACTER_MAXIMUM_LENGTH::text || ')' \
                          WHEN NUMERIC_PRECISION IS NOT NULL AND NUMERIC_SCALE IS NOT NULL \
                          THEN DATA_TYPE || '(' || NUMERIC_PRECISION::text || ',' || NUMERIC_SCALE::text || ')' \
                          WHEN NUMERIC_PRECISION IS NOT NULL \
                          THEN DATA_TYPE || '(' || NUMERIC_PRECISION::text || ')' \
                          ELSE DATA_TYPE END, \
                     IS_NULLABLE, COALESCE(COLUMN_DEFAULT, '') \
                     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = $1 AND TABLE_NAME = $2 \
                     ORDER BY ORDINAL_POSITION"
                ).bind(schema).bind(&object).fetch_all(pool).await?;
                let mut ddl = format!("CREATE TABLE {} (\n", quote_ident(&object));
                let mut parts: Vec<String> = vec![];
                for r in rows {
                    let name: String = r.get(0); let col_type: String = r.get(1);
                    let nullable: String = r.get(2); let default: String = r.get(3);
                    let mut part = format!("    {} {}", quote_ident(&name), col_type);
                    if nullable == "NO" { part.push_str(" NOT NULL"); }
                    if !default.is_empty() && default != "NULL" { part.push_str(&format!(" DEFAULT {}", default)); }
                    parts.push(part);
                }
                ddl.push_str(&parts.join(",\n"));
                ddl.push_str("\n);");
                Ok(ddl)
            }
            "view" => {
                let q = format!("SELECT pg_get_viewdef('{}'::regclass, true)", quote_ident(&object));
                if let Ok(row) = sqlx::query(&q).fetch_one(pool).await {
                    let def: String = row.get(0);
                    Ok(format!("CREATE OR REPLACE VIEW {} AS\n{}", quote_ident(&object), def))
                } else {
                    Ok(format!("-- Cannot get CREATE VIEW for {} --", object))
                }
            }
            "function" | "procedure" => {
                let q = format!(
                    "SELECT pg_get_functiondef(p.oid) \
                     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid \
                     WHERE p.proname = '{}' AND n.nspname = '{}'",
                    object.replace('\'', "''"), schema.replace('\'', "''")
                );
                if let Ok(row) = sqlx::query(&q).fetch_one(pool).await {
                    Ok(row.get(0))
                } else {
                    Ok(format!("-- Cannot get CREATE for {} --", object))
                }
            }
            "trigger" => {
                let q = "SELECT pg_get_triggerdef(t.oid) \
                        FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid \
                        WHERE t.tgname = $1 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)";
                if let Ok(row) = sqlx::query(q).bind(&object).bind(schema).fetch_one(pool).await {
                    Ok(row.get(0))
                } else {
                    Ok(format!("-- Cannot get CREATE for trigger {} --", object))
                }
            }
            "sequence" => Ok(format!("-- Sequence {} (PostgreSQL) --", object)),
            _ => Err(AppError { code: "UNSUPPORTED".into(), message: format!("Cannot get CREATE for type: {}", object_type), hint: None }),
        }
    } else {
        validate_identifier(&database)?;
        let keyword = match object_type.as_str() {
            "table" => "TABLE", "view" => "VIEW", "procedure" => "PROCEDURE",
            "function" => "FUNCTION", "trigger" => "TRIGGER", "sequence" => "SEQUENCE",
            _ => return Err(AppError { code: "UNSUPPORTED".into(), message: format!("Cannot get CREATE for type: {}", object_type), hint: None }),
        };
        let q = format!("SHOW CREATE {} `{}`.`{}`", keyword, database.replace('`', "``"), object.replace('`', "``"));
        let row = sqlx::query(&q).fetch_one(pool).await?;
        let col_count = row.len();
        Ok(row.get(col_count - 1))
    }
}

#[tauri::command]
pub async fn truncate_table(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
) -> Result<(), AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();
    let q = format!("TRUNCATE TABLE {}", qualifed_name(&database, &table, &db_type)?);

    if db_type == "clickhouse" {
        entry.ch.as_ref().unwrap().execute(&q).await?;
    } else {
        sqlx::query(&q).execute(entry.pool.as_ref().unwrap()).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn drop_object(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    object: String,
    object_type: String,
) -> Result<(), AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();
    validate_identifier(&object)?;

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        let fqn = qualifed_name(&database, &object, &db_type)?;
        let keyword = match object_type.as_str() {
            "table" => "TABLE", "view" => "VIEW",
            _ => return Err(AppError { code: "UNSUPPORTED".into(), message: format!("Cannot drop {} in ClickHouse", object_type), hint: None }),
        };
        ch.execute(&format!("DROP {} {}", keyword, fqn)).await?;
        return Ok(());
    }

    let pool = entry.pool.as_ref().unwrap();

    // PostgreSQL DROP TRIGGER requires knowing the table
    if db_type == "postgres" && object_type == "trigger" {
        let schema = if database.is_empty() || database == "public" { "public" } else { &database };
        validate_identifier(schema)?;
        let row = sqlx::query(
            "SELECT event_object_table FROM information_schema.triggers \
             WHERE trigger_name = $1 AND trigger_schema = $2 LIMIT 1"
        ).bind(&object).bind(schema).fetch_optional(pool).await?;
        let table_name: String = row.ok_or_else(|| AppError {
            code: "NOT_FOUND".into(),
            message: format!("Trigger '{}' not found", object),
            hint: None,
        })?.get(0);
        validate_identifier(&table_name)?;
        let q = format!("DROP TRIGGER {} ON {}.{}", quote_ident(&object), quote_ident(schema), quote_ident(&table_name));
        return Ok(sqlx::query(&q).execute(pool).await.map(|_| ())?);
    }

    let keyword = match object_type.as_str() {
        "table" => "TABLE", "view" => "VIEW", "procedure" => "PROCEDURE",
        "function" => "FUNCTION", "trigger" => "TRIGGER", "sequence" => "SEQUENCE",
        _ => return Err(AppError { code: "UNSUPPORTED".into(), message: format!("Cannot drop type: {}", object_type), hint: None }),
    };
    sqlx::query(&format!("DROP {} {}", keyword, qualifed_name(&database, &object, &db_type)?))
        .execute(pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_autocomplete_data(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
) -> Result<AutocompleteData, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(not_connected)?;
    let db_type = entry.db_type.clone();

    let schema_name: String = if db_type == "postgres" {
        if database.is_empty() || database == "public" { "public".to_string() }
        else { validate_identifier(&database)?; database.clone() }
    } else if db_type == "clickhouse" {
        validate_identifier(&database)?;
        database.clone()
    } else {
        validate_identifier(&database)?;
        database.clone()
    };

    let mut items: Vec<AutocompleteItem> = vec![];

    if db_type == "clickhouse" {
        let ch = entry.ch.as_ref().unwrap();
        let tables = ch.query(&format!(
            "SELECT name, multiIf(engine IN ('View','MaterializedView'),'VIEW','TABLE') \
             FROM system.tables WHERE database = '{}' AND is_temporary = 0",
            ch_escape(&schema_name)
        )).await?;
        for r in &tables.rows {
            let name = r.first().and_then(|v| v.as_str()).unwrap_or("").to_string();
            let ttype = r.get(1).and_then(|v| v.as_str()).unwrap_or("TABLE");
            items.push(AutocompleteItem {
                name: name.clone(),
                item_type: if ttype == "VIEW" { "view".into() } else { "table".into() },
                table_name: None,
            });
            let cols = ch.query(&format!(
                "SELECT name FROM system.columns WHERE database = '{}' AND table = '{}' ORDER BY position",
                ch_escape(&schema_name), ch_escape(&name)
            )).await?;
            for c in &cols.rows {
                items.push(AutocompleteItem {
                    name: c.first().and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    item_type: "column".into(),
                    table_name: Some(name.clone()),
                });
            }
        }
        return Ok(AutocompleteData { items });
    }

    let pool = entry.pool.as_ref().unwrap();

    let tables_res = if db_type == "postgres" {
        sqlx::query("SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = $1")
            .bind(&schema_name).fetch_all(pool).await
    } else {
        sqlx::query("SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?")
            .bind(&schema_name).fetch_all(pool).await
    };

    if let Ok(tables) = tables_res {
        for r in tables {
            let name: String = r.get(0);
            let ttype: String = r.get(1);
            items.push(AutocompleteItem {
                name: name.clone(),
                item_type: if ttype == "VIEW" { "view".into() } else { "table".into() },
                table_name: None,
            });
            let cols_res = if db_type == "postgres" {
                sqlx::query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = $1 AND TABLE_NAME = $2 ORDER BY ORDINAL_POSITION")
                    .bind(&schema_name).bind(&name).fetch_all(pool).await
            } else {
                sqlx::query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION")
                    .bind(&schema_name).bind(&name).fetch_all(pool).await
            };
            if let Ok(cols) = cols_res {
                for c in cols {
                    items.push(AutocompleteItem { name: c.get(0), item_type: "column".into(), table_name: Some(name.clone()) });
                }
            }
        }
    }

    let routines_res = if db_type == "postgres" {
        sqlx::query("SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = $1")
            .bind(&schema_name).fetch_all(pool).await
    } else {
        sqlx::query("SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?")
            .bind(&schema_name).fetch_all(pool).await
    };
    if let Ok(routines) = routines_res {
        for r in routines {
            items.push(AutocompleteItem { name: r.get(0), item_type: r.get::<String, _>(1).to_lowercase(), table_name: None });
        }
    }

    Ok(AutocompleteData { items })
}
