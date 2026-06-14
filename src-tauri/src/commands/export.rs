use crate::error::AppError;

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
