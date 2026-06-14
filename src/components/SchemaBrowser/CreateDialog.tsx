import { useEffect, useState } from "react";
import { Dialog } from "../shared/Dialog";
import { Copy, Check } from "lucide-react";

interface CreateDetail {
  stmt: string;
  object: string;
  type: string;
}

type CreateListener = (e: CustomEvent<CreateDetail>) => void;

export function CreateDialog() {
  const [detail, setDetail] = useState<CreateDetail | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler: CreateListener = (e) => {
      setDetail(e.detail);
    };
    window.addEventListener("litedb:show-create", handler as EventListener);
    return () =>
      window.removeEventListener(
        "litedb:show-create",
        handler as EventListener,
      );
  }, []);

  const handleCopy = () => {
    if (!detail) return;
    navigator.clipboard.writeText(detail.stmt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={detail !== null}
      onClose={() => setDetail(null)}
      title={
        detail
          ? `CREATE ${detail.type.toUpperCase()} \`${detail.object}\``
          : ""
      }
    >
      {detail && (
        <div className="flex flex-col gap-3">
          <div className="max-h-[60vh] overflow-auto rounded-md bg-gray-900 p-3">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
              {detail.stmt}
            </pre>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-green-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={12} />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
