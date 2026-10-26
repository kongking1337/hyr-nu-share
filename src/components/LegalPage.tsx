import type { ReactNode } from "react";
import { SITE, SITE_INFO_MISSING } from "@/lib/site";

/** Gemensam layout för villkor, integritetspolicy och kontakt. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted-foreground">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <p>Senast ändrad {SITE.updated}.</p>
      {SITE_INFO_MISSING && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Utkast: uppgifter om vem som driver Hyrkoll och hur du når oss fylls i före lansering.
        </div>
      )}
      {children}
    </article>
  );
}
