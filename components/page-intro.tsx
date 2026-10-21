import Link from "next/link";
import type { ReactNode } from "react";

/** One or two lines under a page title explaining the workflow, with a link to the wiki. */
export function PageIntro({ children, wiki }: { children: ReactNode; wiki: string }) {
  return (
    <p className="mt-1 max-w-3xl text-sm text-muted">
      {children}{" "}
      <Link href={`/wiki/${wiki}`} className="whitespace-nowrap text-accent hover:underline">
        More in the wiki →
      </Link>
    </p>
  );
}
