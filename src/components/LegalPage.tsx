import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Page } from "@/components/layout";
import { SITE, SITE_INFO_MISSING } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Gemensam layout för villkor, integritetspolicy och kontakt: en läsbar spalt (högst ~70 tecken
 * per rad), rubriker i Bricolage och vanliga länkar i bläckfärg som blir orange vid hover.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  /** Valfri ingress under rubriken, före själva texten. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page width="text">
      <article className="max-w-[70ch]">
        <header className="border-b border-border pb-6">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Senast ändrad {SITE.updated}</p>
          {intro && <div className="mt-4 text-lg leading-relaxed">{intro}</div>}
        </header>

        {SITE_INFO_MISSING && (
          <div
            role="note"
            className="mt-6 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">Utkast:</span> uppgifter om vem som driver Hyrkoll och hur
              du når oss fylls i före lansering.
            </p>
          </div>
        )}

        <div className={cn("mt-2 leading-relaxed", PROSE)}>{children}</div>
      </article>
    </Page>
  );
}

/** Typografi för brödtexten. Samlad här så att sidorna bara behöver skriva vanlig HTML. */
const PROSE = cn(
  "[&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-snug sm:[&_h2]:text-2xl",
  "[&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold",
  "[&_p]:mt-4 [&_p]:text-foreground/85",
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-foreground/85 [&_li]:pl-1 [&_li]:marker:text-muted-foreground",
  "[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:decoration-2 [&_a]:underline-offset-4 [&_a:hover]:decoration-primary",
  "[&_a]:rounded-sm [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-ring",
);
