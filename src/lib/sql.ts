export function escapeIdentifier(name: string): string {
  return "`" + name.replace(/`/g, "``") + "`";
}

export function escapeString(value: string): string {
  return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
