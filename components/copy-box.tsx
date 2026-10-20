"use client";

import { useState } from "react";

export function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <code className="input flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{value}</code>
        <button
          type="button"
          className="btn-quiet"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
