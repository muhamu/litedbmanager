use crate::error::AppError;
use tauri_plugin_dialog::DialogExt;

/// Open a native OS save dialog then write content to the chosen path.
/// Returns true if saved, false if the user cancelled.
#[tauri::command]
pub async fn save_to_file(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
    extension: String,
) -> Result<bool, AppError> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<std::path::PathBuf>>();
    let filter_label = extension.to_uppercase();
    let ext = extension.clone();

    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(filter_label, &[ext.as_str()])
        .save_file(move |path| {
            let pb = path.and_then(|p| p.into_path().ok());
            let _ = tx.send(pb);
        });

    let chosen = rx.await.map_err(|_| AppError {
        code: "DIALOG_ERROR".to_string(),
        message: "Save dialog closed unexpectedly".to_string(),
        hint: None,
    })?;

    match chosen {
        None => Ok(false),
        Some(path) => {
            std::fs::write(&path, content.as_bytes()).map_err(|e| AppError {
                code: "FILE_WRITE_ERROR".to_string(),
                message: e.to_string(),
                hint: None,
            })?;
            Ok(true)
        }
    }
}

#[derive(serde::Serialize)]
pub struct ExportResult {
    pub data: String,
    pub filename: String,
}

#[tauri::command]
pub async fn export_csv(
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
    delimiter: String,
    include_headers: bool,
) -> Result<ExportResult, AppError> {
    let delim = if delimiter.is_empty() {
        ",".to_string()
    } else {
        delimiter
    };

    let mut output = String::new();

    if include_headers {
        output.push_str(&columns.join(&delim));
        output.push('\n');
    }

    for row in rows {
        let line: Vec<String> = row
            .iter()
            .map(|v| match v {
                serde_json::Value::String(s) => {
                    if s.contains(&delim) || s.contains('"') || s.contains('\n') {
                        format!("\"{}\"", s.replace('"', "\"\""))
                    } else {
                        s.clone()
                    }
                }
                serde_json::Value::Null => String::new(),
                other => other.to_string(),
            })
            .collect();
        output.push_str(&line.join(&delim));
        output.push('\n');
    }

    Ok(ExportResult {
        data: output,
        filename: "export.csv".to_string(),
    })
}

#[tauri::command]
pub async fn export_json(
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
    pretty: bool,
) -> Result<ExportResult, AppError> {
    let records: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|row| {
            let obj: serde_json::Map<String, serde_json::Value> = columns
                .iter()
                .enumerate()
                .map(|(i, col)| (col.clone(), row[i].clone()))
                .collect();
            serde_json::Value::Object(obj)
        })
        .collect();

    let data = if pretty {
        serde_json::to_string_pretty(&records)?
    } else {
        serde_json::to_string(&records)?
    };

    Ok(ExportResult {
        data,
        filename: "export.json".to_string(),
    })
}
