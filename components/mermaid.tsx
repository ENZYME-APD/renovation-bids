"use client";

import { useEffect, useId, useState } from "react";

/** Renders a Mermaid diagram, in the light or dark palette to match the app. */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const isDark = () => {
      const t = document.documentElement.dataset.theme;
      return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark() ? "dark" : "neutral",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          themeVariables: { fontSize: "16px" },
          flowchart: { curve: "basis", htmlLabels: true },
        });
        const { svg } = await mermaid.render(`m${id}${Date.now()}`, chart);
        if (alive) setSvg(svg);
      } catch {
        if (alive) setFailed(true);
      }
    };
    render();
    // Re-render when the theme changes (system setting or the header toggle).
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const obs = new MutationObserver(render);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    mq.addEventListener("change", render);
    return () => {
      alive = false;
      obs.disconnect();
      mq.removeEventListener("change", render);
    };
  }, [chart, id]);

  if (failed) return <pre className="overflow-x-auto rounded-md border border-line p-3 text-xs">{chart}</pre>;
  return (
    <figure className="my-6 overflow-x-auto rounded-lg border border-line bg-surface p-4">
      {svg ? <div className="mx-auto w-full max-w-[760px] [&_svg]:!h-auto [&_svg]:!w-full [&_svg]:!max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-40 animate-pulse rounded bg-paper" />}
    </figure>
  );
}
