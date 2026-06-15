import { invoke } from "@tauri-apps/api/core";

// --- Types shared with Rust backend ---

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  database: string | null;
  ssl: boolean;
  db_type: string;
  created_at: string;
}

export interface ProfileInput {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string | null;
  ssl: boolean;
  db_type: string;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rows_affected: number;
  execution_time_ms: number;
}

export interface SchemaItem {
  name: string;
  item_type: string;
}

export interface ColumnInfo {
  name: string;
  col_type: string;
  nullable: boolean;
  key: string;
  default: string | null;
  extra: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  index_type: string;
}

export interface ForeignKeyInfo {
  constraint_name: string;
  column: string;
  ref_database: string;
  ref_table: string;
  ref_column: string;
  update_rule: string;
  delete_rule: string;
}

export interface AutocompleteItem {
  name: string;
  item_type: string;
  table_name: string | null;
}

export interface AutocompleteData {
  items: AutocompleteItem[];
}

export interface ExportResult {
  data: string;
  filename: string;
}

export interface AppError {
  code: string;
  message: string;
  hint: string | null;
}

// --- Connection commands ---

export async function listProfiles(): Promise<ConnectionProfile[]> {
  return invoke("list_profiles");
}

export async function saveProfile(
  input: ProfileInput,
): Promise<ConnectionProfile> {
  return invoke("save_profile", { input });
}

export async function deleteProfile(id: string): Promise<void> {
  return invoke("delete_profile", { id });
}

export async function testConnection(
  host: string,
  port: number,
  user: string,
  password: string,
  database: string | null,
  ssl: boolean,
  dbType: string,
): Promise<string> {
  return invoke("test_connection", {
    host,
    port,
    user,
    password,
    database,
    ssl,
    dbType,
  });
}

export async function connectToProfile(id: string): Promise<string> {
  return invoke("connect_to_profile", { id });
}

export async function disconnectProfile(id: string): Promise<void> {
  return invoke("disconnect_profile", { id });
}

// --- Query commands ---

export async function executeQuery(
  profileId: string,
  query: string,
): Promise<QueryResult> {
  return invoke("execute_query", { profileId, query });
}

// --- Schema commands ---

export async function listDatabases(
  profileId: string,
): Promise<string[]> {
  return invoke("list_databases", { profileId });
}

export async function listTables(
  profileId: string,
  database: string,
): Promise<SchemaItem[]> {
  return invoke("list_tables", { profileId, database });
}

export async function listColumns(
  profileId: string,
  database: string,
  table: string,
): Promise<ColumnInfo[]> {
  return invoke("list_columns", { profileId, database, table });
}

export async function listIndexes(
  profileId: string,
  database: string,
  table: string,
): Promise<IndexInfo[]> {
  return invoke("list_indexes", { profileId, database, table });
}

export async function listForeignKeys(
  profileId: string,
  database: string,
  table: string,
): Promise<ForeignKeyInfo[]> {
  return invoke("list_foreign_keys", { profileId, database, table });
}

export async function showTableData(
  profileId: string,
  database: string,
  table: string,
  limit: number,
  offset: number,
): Promise<QueryResult> {
  return invoke("show_table_data", { profileId, database, table, limit, offset });
}

export async function countTableRows(
  profileId: string,
  database: string,
  table: string,
): Promise<number> {
  return invoke("count_table_rows", { profileId, database, table });
}

export async function getCreateStatement(
  profileId: string,
  database: string,
  object: string,
  objectType: string,
): Promise<string> {
  return invoke("get_create_statement", {
    profileId,
    database,
    object,
    objectType,
  });
}

export async function truncateTable(
  profileId: string,
  database: string,
  table: string,
): Promise<void> {
  return invoke("truncate_table", { profileId, database, table });
}

export async function dropObject(
  profileId: string,
  database: string,
  object: string,
  objectType: string,
): Promise<void> {
  return invoke("drop_object", { profileId, database, object, objectType });
}

// --- Autocomplete ---

export async function getAutocompleteData(
  profileId: string,
  database: string,
): Promise<AutocompleteData> {
  return invoke("get_autocomplete_data", { profileId, database });
}

// --- Export commands ---

export async function exportCsv(
  columns: string[],
  rows: unknown[][],
  delimiter: string,
  includeHeaders: boolean,
): Promise<ExportResult> {
  return invoke("export_csv", { columns, rows, delimiter, includeHeaders });
}

export async function exportJson(
  columns: string[],
  rows: unknown[][],
  pretty: boolean,
): Promise<ExportResult> {
  return invoke("export_json", { columns, rows, pretty });
}

/** Open a native OS save dialog and write content to the chosen file.
 *  Returns true if saved, false if the user cancelled. */
export async function saveToFile(
  content: string,
  defaultName: string,
  extension: string,
): Promise<boolean> {
  return invoke("save_to_file", { content, defaultName, extension });
}
