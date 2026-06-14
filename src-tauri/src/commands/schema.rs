use tauri::State;
use sqlx::Row;

use crate::error::AppError;
use crate::db::pool::PoolManager;

// ── Identifier validation (both MySQL and PostgreSQL safe) ──

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
        _ => Ok(format!("`{}`.`{}`", db.replace('`', "``"), obj.replace('`', "``"))),
    }
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
    pub item_type: String, // "table", "view", "function", "column"
    pub table_name: Option<String>, // for columns: the parent table
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
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;

    let (rows, db_type) = (&entry.pool, entry.db_type.clone());

    if db_type == "postgres" {
        let result = sqlx::query(
            "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres')"
        )
        .fetch_all(rows)
        .await?;
        Ok(result.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
    } else {
        let result = sqlx::query("SHOW DATABASES")
            .fetch_all(rows)
            .await?;
        Ok(result
            .iter()
            .filter_map(|r| r.try_get::<String, _>(0).ok())
            .filter(|name| {
                !matches!(
                    name.to_lowercase().as_str(),
                    "information_schema" | "performance_schema" | "mysql" | "sys"
                )
            })
            .collect())
    }
}

#[tauri::command]
pub async fn list_tables(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
) -> Result<Vec<SchemaItem>, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;

    let (pool, db_type) = (&entry.pool, entry.db_type.clone());

    // Determine and validate the schema name up front
    let schema_name: String = if db_type == "postgres" {
        if database.is_empty() || database == "public" {
            "public".to_string()
        } else {
            validate_identifier(&database)?;
            database.clone()
        }
    } else {
        validate_identifier(&database)?;
        database.clone()
    };

    let mut items: Vec<SchemaItem> = vec![];

    // Tables and views
    let tables_res = if db_type == "postgres" {
        sqlx::query(
            "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = $1"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    };

    if let Ok(tables) = tables_res {
        for r in tables {
            items.push(SchemaItem {
                name: r.get(0),
                item_type: match r.get::<String, _>(1).as_str() {
                    "VIEW" => "view".into(),
                    _ => "table".into(),
                },
            });
        }
    }

    // Routines
    let routines_res = if db_type == "postgres" {
        sqlx::query(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = $1"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    };

    if let Ok(routines) = routines_res {
        for r in routines {
            items.push(SchemaItem {
                name: r.get(0),
                item_type: r.get::<String, _>(1).to_lowercase(),
            });
        }
    }

    // Triggers
    let triggers_res = if db_type == "postgres" {
        sqlx::query(
            "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = $1"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    };

    if let Ok(triggers) = triggers_res {
        for r in triggers {
            items.push(SchemaItem {
                name: r.get(0),
                item_type: "trigger".into(),
            });
        }
    }

    // Sequences (PostgreSQL only; MariaDB 10.3+ has them but uses different syntax)
    let seq_res = if db_type == "postgres" {
        sqlx::query(
            "SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = $1"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT SEQUENCE_NAME FROM information_schema.SEQUENCES WHERE SEQUENCE_SCHEMA = ?"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    };

    if let Ok(seqs) = seq_res {
        for r in seqs {
            items.push(SchemaItem {
                name: r.get(0),
                item_type: "sequence".into(),
            });
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
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let (pool, db_type) = (&entry.pool, entry.db_type.clone());
    validate_identifier(&table)?;

    if db_type == "postgres" {
        let schema = if database == "public" || database.is_empty() { "public" } else { &database };
        validate_identifier(schema)?;
        // PostgreSQL information_schema uses DATA_TYPE, not COLUMN_TYPE (which is MySQL-only).
        // Build a friendly type string matching the MySQL COLUMN_TYPE format.
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
             WHERE TABLE_SCHEMA = $1 AND TABLE_NAME = $2 \
             ORDER BY ORDINAL_POSITION"
        )
        .bind(schema)
        .bind(&table)
        .fetch_all(pool)
        .await?;

        Ok(rows.iter().map(|r| ColumnInfo {
            name: r.get(0),
            col_type: r.get(1),
            nullable: r.get::<String, _>(2) == "YES",
            key: r.get(3),
            default: r.get(4),
            extra: r.get::<String, _>(5),
        }).collect())
    } else {
        validate_identifier(&database)?;
        let rows = sqlx::query(
            "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA \
             FROM information_schema.COLUMNS \
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
             ORDER BY ORDINAL_POSITION"
        )
        .bind(&database)
        .bind(&table)
        .fetch_all(pool)
        .await?;

        Ok(rows.iter().map(|r| ColumnInfo {
            name: r.get(0),
            col_type: r.get(1),
            nullable: r.get::<String, _>(2) == "YES",
            key: r.get(3),
            default: r.get(4),
            extra: r.get(5),
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
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let (pool, db_type) = (&entry.pool, entry.db_type.clone());
    validate_identifier(&table)?;

    if db_type == "postgres" {
        let schema = if database == "public" || database.is_empty() { "public" } else { &database };
        validate_identifier(schema)?;
        let rows = sqlx::query(
            "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2"
        )
        .bind(schema)
        .bind(&table)
        .fetch_all(pool)
        .await?;

        let mut indexes: Vec<IndexInfo> = vec![];
        for r in rows {
            let name: String = r.get(0);
            let def: String = r.get(1);
            let unique = def.to_uppercase().contains("UNIQUE");
            let index_type = if def.to_uppercase().contains("USING BTREE") { "BTREE" } else { "OTHER" };
            // Extract column names from indexdef (simplified)
            let columns = vec![];
            indexes.push(IndexInfo { name, columns, unique, index_type: index_type.to_string() });
        }
        Ok(indexes)
    } else {
        validate_identifier(&database)?;
        let q = format!(
            "SHOW INDEX FROM `{}` FROM `{}`",
            table.replace('`', "``"),
            database.replace('`', "``")
        );
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
                .or_insert(IndexInfo {
                    name: key_name,
                    columns: vec![col_name],
                    unique: non_unique == 0,
                    index_type,
                });
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
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let (pool, db_type) = (&entry.pool, entry.db_type.clone());
    validate_identifier(&table)?;

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
        )
        .bind(schema)
        .bind(&table)
        .fetch_all(pool)
        .await?;

        Ok(rows.iter().map(|r| ForeignKeyInfo {
            constraint_name: r.get(0),
            column: r.get(1),
            ref_database: r.get(2),
            ref_table: r.get(3),
            ref_column: r.get(4),
            update_rule: r.get(5),
            delete_rule: r.get(6),
        }).collect())
    } else {
        validate_identifier(&database)?;
        let rows = sqlx::query(
            "SELECT k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA, \
                    k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, \
                    c.UPDATE_RULE, c.DELETE_RULE \
             FROM information_schema.KEY_COLUMN_USAGE k \
             JOIN information_schema.REFERENTIAL_CONSTRAINTS c \
               ON k.CONSTRAINT_NAME = c.CONSTRAINT_NAME \
              AND k.CONSTRAINT_SCHEMA = c.CONSTRAINT_SCHEMA \
             WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? \
               AND k.REFERENCED_TABLE_NAME IS NOT NULL"
        )
        .bind(&database)
        .bind(&table)
        .fetch_all(pool)
        .await?;

        Ok(rows.iter().map(|r| ForeignKeyInfo {
            constraint_name: r.get(0),
            column: r.get(1),
            ref_database: r.get(2),
            ref_table: r.get(3),
            ref_column: r.get(4),
            update_rule: r.get(5),
            delete_rule: r.get(6),
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
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let db_type = entry.db_type.clone();
    let q = format!(
        "SELECT * FROM {} LIMIT {} OFFSET {}",
        qualifed_name(&database, &table, &db_type)?,
        limit,
        offset
    );
    let start = std::time::Instant::now();
    let rows = sqlx::query(&q).fetch_all(&entry.pool).await?;
    let elapsed = start.elapsed();
    Ok(crate::db::types::QueryResult::from_rows(rows, elapsed))
}

#[tauri::command]
pub async fn count_table_rows(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
) -> Result<u64, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let db_type = entry.db_type.clone();
    let q = format!("SELECT COUNT(*) FROM {}", qualifed_name(&database, &table, &db_type)?);
    let row: (i64,) = sqlx::query_as(&q).fetch_one(&entry.pool).await?;
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
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let (pool, db_type) = (&entry.pool, entry.db_type.clone());
    validate_identifier(&object)?;

    if db_type == "postgres" {
        let schema = if database == "public" || database.is_empty() { "public" } else { &database };
        validate_identifier(schema)?;

        match object_type.as_str() {
            "table" => {
                // Reconstruct approximate CREATE TABLE from information_schema.
                // Uses DATA_TYPE (not COLUMN_TYPE which is MySQL-only).
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
                )
                .bind(schema)
                .bind(&object)
                .fetch_all(pool)
                .await?;

                let mut ddl = format!("CREATE TABLE {} (\n", quote_ident(&object));
                let mut parts: Vec<String> = vec![];
                for r in rows {
                    let name: String = r.get(0);
                    let col_type: String = r.get(1);
                    let nullable: String = r.get(2);
                    let default: String = r.get(3);

                    let mut part = format!("    {} {}", quote_ident(&name), col_type);
                    if nullable == "NO" { part.push_str(" NOT NULL"); }
                    if !default.is_empty() && default != "NULL" {
                        part.push_str(&format!(" DEFAULT {}", default));
                    }
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
                    object.replace('\'', "''"),
                    schema.replace('\'', "''")
                );
                if let Ok(row) = sqlx::query(&q).fetch_one(pool).await {
                    let def: String = row.get(0);
                    Ok(def)
                } else {
                    Ok(format!("-- Cannot get CREATE for {} --", object))
                }
            }
            "trigger" => {
                let q = "SELECT pg_get_triggerdef(t.oid) \
                        FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid \
                        WHERE t.tgname = $1 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)"
                    .to_string();
                if let Ok(row) = sqlx::query(&q).bind(&object).bind(schema).fetch_one(pool).await {
                    let def: String = row.get(0);
                    Ok(def)
                } else {
                    Ok(format!("-- Cannot get CREATE for trigger {} --", object))
                }
            }
            "sequence" => {
                Ok(format!("-- Sequence {} (PostgreSQL) --", object))
            }
            _ => Err(AppError {
                code: "UNSUPPORTED".into(),
                message: format!("Cannot get CREATE for type: {}", object_type),
                hint: None,
            }),
        }
    } else {
        // MySQL/MariaDB
        validate_identifier(&database)?;
        let statement_keyword = match object_type.as_str() {
            "table" => "TABLE",
            "view" => "VIEW",
            "procedure" => "PROCEDURE",
            "function" => "FUNCTION",
            "trigger" => "TRIGGER",
            "sequence" => "SEQUENCE",
            _ => return Err(AppError {
                code: "UNSUPPORTED".into(),
                message: format!("Cannot get CREATE for type: {}", object_type),
                hint: None,
            }),
        };

        let q = format!(
            "SHOW CREATE {} `{}`.`{}`",
            statement_keyword,
            database.replace('`', "``"),
            object.replace('`', "``")
        );
        let row = sqlx::query(&q).fetch_one(pool).await?;
        let col_count = row.len();
        let statement: String = row.get(col_count - 1);
        Ok(statement)
    }
}

#[tauri::command]
pub async fn truncate_table(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
    table: String,
) -> Result<(), AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let db_type = entry.db_type.clone();
    let q = format!("TRUNCATE TABLE {}", qualifed_name(&database, &table, &db_type)?);
    sqlx::query(&q).execute(&entry.pool).await?;
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
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let (pool, db_type) = (&entry.pool, entry.db_type.clone());

    validate_identifier(&object)?;

    // PostgreSQL DROP TRIGGER requires knowing the table: DROP TRIGGER name ON schema.table
    if db_type == "postgres" && object_type == "trigger" {
        let schema = if database.is_empty() || database == "public" { "public" } else { &database };
        validate_identifier(schema)?;

        let row = sqlx::query(
            "SELECT event_object_table FROM information_schema.triggers \
             WHERE trigger_name = $1 AND trigger_schema = $2 LIMIT 1"
        )
        .bind(&object)
        .bind(schema)
        .fetch_optional(pool)
        .await?;

        let table_name: String = row
            .ok_or_else(|| AppError {
                code: "NOT_FOUND".into(),
                message: format!("Trigger '{}' not found in schema '{}'", object, schema),
                hint: None,
            })?
            .get(0);

        validate_identifier(&table_name)?;

        let q = format!(
            "DROP TRIGGER {} ON {}.{}",
            quote_ident(&object),
            quote_ident(schema),
            quote_ident(&table_name)
        );
        return Ok(sqlx::query(&q).execute(pool).await.map(|_| ())?);
    }

    let type_keyword = match object_type.as_str() {
        "table" => "TABLE",
        "view" => "VIEW",
        "procedure" => "PROCEDURE",
        "function" => "FUNCTION",
        "trigger" => "TRIGGER",
        "sequence" => "SEQUENCE",
        _ => return Err(AppError {
            code: "UNSUPPORTED".into(),
            message: format!("Cannot drop type: {}", object_type),
            hint: None,
        }),
    };

    let q = format!(
        "DROP {} {}",
        type_keyword,
        qualifed_name(&database, &object, &db_type)?
    );
    sqlx::query(&q).execute(pool).await?;
    Ok(())
}

// ── Autocomplete ──

#[tauri::command]
pub async fn get_autocomplete_data(
    pool_manager: State<'_, PoolManager>,
    profile_id: String,
    database: String,
) -> Result<AutocompleteData, AppError> {
    let entry = pool_manager.get_pool(&profile_id).await.ok_or_else(|| AppError {
        code: "NOT_CONNECTED".into(),
        message: "Not connected".into(),
        hint: None,
    })?;
    let (pool, db_type) = (&entry.pool, entry.db_type.clone());

    // Validate and normalise schema name for both branches up front.
    let schema_name: String = if db_type == "postgres" {
        if database.is_empty() || database == "public" {
            "public".to_string()
        } else {
            validate_identifier(&database)?;
            database.clone()
        }
    } else {
        validate_identifier(&database)?;
        database.clone()
    };

    let mut items: Vec<AutocompleteItem> = vec![];

    // Tables + columns
    let tables_res = if db_type == "postgres" {
        sqlx::query(
            "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = $1"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
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

            // Columns for this table — use parameterised queries throughout
            let cols_res = if db_type == "postgres" {
                sqlx::query(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS \
                     WHERE TABLE_SCHEMA = $1 AND TABLE_NAME = $2 ORDER BY ORDINAL_POSITION"
                )
                .bind(&schema_name)
                .bind(&name)
                .fetch_all(pool)
                .await
            } else {
                sqlx::query(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS \
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION"
                )
                .bind(&schema_name)
                .bind(&name)
                .fetch_all(pool)
                .await
            };

            if let Ok(cols) = cols_res {
                for c in cols {
                    items.push(AutocompleteItem {
                        name: c.get(0),
                        item_type: "column".into(),
                        table_name: Some(name.clone()),
                    });
                }
            }
        }
    }

    // Routines
    let routines_res = if db_type == "postgres" {
        sqlx::query(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = $1"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?"
        )
        .bind(&schema_name)
        .fetch_all(pool)
        .await
    };

    if let Ok(routines) = routines_res {
        for r in routines {
            items.push(AutocompleteItem {
                name: r.get(0),
                item_type: r.get::<String, _>(1).to_lowercase(),
                table_name: None,
            });
        }
    }

    Ok(AutocompleteData { items })
}
