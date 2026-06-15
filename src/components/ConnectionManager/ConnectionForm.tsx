import { useState } from "react";
import { Loader2, Database, Server as ServerIcon } from "lucide-react";
import type { ProfileInput } from "../../lib/tauri";
import { Button } from "../shared/Button";
import { Input } from "../shared/Input";

interface ConnectionFormProps {
  onSave: (input: ProfileInput) => Promise<void>;
}

const defaults: ProfileInput = {
  name: "",
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: null,
  ssl: false,
  db_type: "mysql",
};

const DB_TYPES = [
  { value: "mysql", label: "MySQL / MariaDB", defaultPort: 3306 },
  { value: "postgres", label: "PostgreSQL", defaultPort: 5432 },
  { value: "clickhouse", label: "ClickHouse", defaultPort: 8123 },
];

export function ConnectionForm({ onSave }: ConnectionFormProps) {
  const [form, setForm] = useState<ProfileInput>({ ...defaults });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (field: keyof ProfileInput, value: string | number | boolean | null) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleDbTypeChange = (dbType: string) => {
    const dbInfo = DB_TYPES.find((d) => d.value === dbType);
    setForm((prev) => ({
      ...prev,
      db_type: dbType,
      port: dbInfo?.defaultPort ?? prev.port,
      host: "",
      user: "",
      database: null,
    }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { testConnection } = await import("../../lib/tauri");
      const version = await testConnection(
        form.host,
        form.port,
        form.user,
        form.password,
        form.database,
        form.ssl,
        form.db_type,
      );
      setTestResult({ ok: true, msg: `Connected! ${version}` });
    } catch (e) {
      const err = e as { message?: string };
      setTestResult({ ok: false, msg: err.message ?? "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      setForm({ ...defaults });
      setTestResult(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* DB Type selector */}
      <div className="flex gap-2">
        {DB_TYPES.map((db) => (
          <button
            key={db.value}
            type="button"
            onClick={() => handleDbTypeChange(db.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              form.db_type === db.value
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {db.value === "mysql" ? (
              <Database size={14} />
            ) : (
              <ServerIcon size={14} />
            )}
            {db.label}
          </button>
        ))}
      </div>

      <Input
        label="Connection Name"
        placeholder="Local Database"
        value={form.name}
        onChange={(e) => update("name", e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Input
            label="Host"
            placeholder={form.db_type === "postgres" ? "localhost" : "127.0.0.1"}
            value={form.host}
            onChange={(e) => update("host", e.target.value)}
          />
        </div>
        <Input
          label="Port"
          type="number"
          value={form.port}
          onChange={(e) => update("port", Number(e.target.value))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Username"
          placeholder={form.db_type === "postgres" ? "postgres" : "root"}
          value={form.user}
          onChange={(e) => update("user", e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
        />
      </div>
      <Input
        label={form.db_type === "postgres" ? "Database (required)" : form.db_type === "clickhouse" ? "Database (default: default)" : "Database (optional)"}
        placeholder={form.db_type === "clickhouse" ? "default" : "my_database"}
        value={form.database ?? ""}
        onChange={(e) => update("database", e.target.value || null)}
      />
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={form.ssl}
          onChange={(e) => update("ssl", e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        Use SSL / TLS
      </label>

      {testResult && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            testResult.ok
              ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {testResult.msg}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing}>
          {testing ? <Loader2 size={12} className="animate-spin" /> : null}
          Test
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : null}
          Save Connection
        </Button>
      </div>
    </div>
  );
}
