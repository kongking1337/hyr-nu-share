import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_CATEGORIES } from "@/lib/categories";
import { CITIES } from "@/lib/geo";
import { priceLabel } from "@/lib/pricing";
import { rowToUnified } from "@/lib/providers/internal";
import type { UnifiedResult } from "@/lib/providers/types";
import { DEFAULTS, cleanParams } from "@/lib/search/params";
import { interpretQuery } from "@/lib/search/parse-query";
import { pushRecentSearch } from "@/lib/search/suggest";

/**
 * Testversion av startsidan: "Stockholms anslagstavla". En gul lapp med avrivningsflikar
 * (kategorierna) på en trapphusvägg, och de senaste annonserna som en tät lista.
 * Den riktiga startsidan (/) är orörd tills vi bestämt oss.
 */
export const Route = createFileRoute("/test-startsida")({
  head: () => ({
    meta: [{ title: "Test: ny startsida – Hyrkoll" }, { name: "robots", content: "noindex" }],
  }),
  component: NoticeBoardHome,
});

const INK = "#1C2A55";
const DISPLAY = "font-['Archivo_Variable',_sans-serif] [font-stretch:66%]";

function useBoard() {
  return useQuery({
    queryKey: ["notice-board"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
        .in(
          "city",
          CITIES.map((c) => c.name),
        )
        .order("published_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const listings = (data ?? []).map(rowToUnified);
      const byCategory = new Map<string, number>();
      const byCity = new Map<string, number>();
      for (const l of listings) {
        byCategory.set(l.category, (byCategory.get(l.category) ?? 0) + 1);
        byCity.set(l.city, (byCity.get(l.city) ?? 0) + 1);
      }
      return { latest: listings.slice(0, 12), byCategory, byCity };
    },
  });
}

/** "idag", "igår" eller "28 okt". */
function postedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor(
    (new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (days <= 0) return "idag";
  if (days === 1) return "igår";
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" }).replace(".", "");
}

function NoticeBoardHome() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data, isLoading } = useBoard();

  function search(e: FormEvent) {
    e.preventDefault();
    const intent = interpretQuery(q);
    pushRecentSearch(q);
    void navigate({
      to: "/sok",
      search: cleanParams({ ...DEFAULTS, ...intent.patch, q }) as never,
    });
  }

  return (
    <div className="-mb-16 bg-[#DCE3DF] pb-20 pt-10 dark:bg-[#141B18] sm:pt-14">
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-12 px-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-12">
          <Note q={q} setQ={setQ} onSearch={search} counts={data?.byCategory} />
          <Latest listings={data?.latest} loading={isLoading} />
        </div>
        <Areas counts={data?.byCity} />
      </div>
    </div>
  );
}

function Note({
  q,
  setQ,
  onSearch,
  counts,
}: {
  q: string;
  setQ: (v: string) => void;
  onSearch: (e: FormEvent) => void;
  counts: Map<string, number> | undefined;
}) {
  return (
    <section
      aria-labelledby="note-title"
      className="relative bg-[#FFEF9F] text-[#1C2A55] shadow-[0_1px_0_rgb(28_42_85/0.08),0_18px_28px_-18px_rgb(28_42_85/0.55)] md:origin-top-left md:-rotate-[0.35deg]"
    >
      {/* Häftstiftet som håller lappen */}
      <span
        aria-hidden
        className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-[#C8102E] shadow-[inset_-2px_-2px_0_rgb(0_0_0/0.25),0_2px_3px_rgb(28_42_85/0.4)]"
      />
      <div className="px-6 pb-7 pt-9 sm:px-10 sm:pt-11">
        <h1
          id="note-title"
          className={`${DISPLAY} text-[clamp(2.9rem,9vw,5.75rem)] font-[850] leading-[0.9] tracking-[-0.01em]`}
        >
          Anslagstavlan
          <br />
          för hela Stockholm
        </h1>
        <p className="mt-5 max-w-[42ch] text-[1.0625rem] leading-relaxed">
          Köp, sälj och hyr av grannar i Stockholms län. Gratis att lägga upp, gratis att svara.
        </p>

        <form onSubmit={onSearch} role="search" className="mt-6 flex max-w-xl gap-2">
          <label htmlFor="note-search" className="sr-only">
            Vad letar du efter?
          </label>
          <input
            id="note-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Vad letar du efter?"
            className="h-12 min-w-0 flex-1 rounded-md border-2 border-[#1C2A55] bg-white px-4 text-base text-[#1C2A55] placeholder:text-[#1C2A55]/55 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1C2A55]/25"
          />
          <button
            type="submit"
            className="h-12 rounded-md bg-[#1C2A55] px-5 font-semibold text-[#FFEF9F] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1C2A55]/35"
          >
            Sök
          </button>
        </form>

        <p className="mt-5 text-[0.9375rem]">
          Har du något över?{" "}
          <Link
            to="/ny-annons"
            className="font-semibold underline decoration-2 underline-offset-4 hover:decoration-[#046948] focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#1C2A55]"
          >
            Lägg upp annons
          </Link>
        </p>
      </div>

      {/* Avrivningsflikarna: en per kategori */}
      <nav
        aria-label="Kategorier"
        className="grid border-t-2 border-dashed"
        style={{
          gridTemplateColumns: `repeat(${ACTIVE_CATEGORIES.length}, minmax(0, 1fr))`,
          borderColor: `${INK}66`,
        }}
      >
        {ACTIVE_CATEGORIES.map((c, i) => (
          <Link
            key={c.slug}
            to="/sok"
            search={{ ...DEFAULTS, category: c.slug }}
            className={`group flex h-32 items-center justify-center focus:outline-none focus-visible:bg-[#FBE37A] hover:bg-[#FBE37A] motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:translate-y-1 motion-safe:hover:rotate-[1.5deg] motion-safe:focus-visible:translate-y-1 ${
              i > 0 ? "border-l-2 border-dashed" : ""
            }`}
            style={{ borderColor: `${INK}66` }}
          >
            <span
              className={`${DISPLAY} rotate-180 text-[0.95rem] font-semibold [writing-mode:vertical-rl] group-focus-visible:underline`}
            >
              {c.name}
              {counts?.get(c.slug) ? (
                <span className="font-normal opacity-60"> {counts.get(c.slug)}</span>
              ) : null}
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}

function Latest({
  listings,
  loading,
}: {
  listings: UnifiedResult[] | undefined;
  loading: boolean;
}) {
  return (
    <section
      aria-labelledby="latest-title"
      className="rounded-[3px] bg-white text-[#1C2A55] shadow-[0_1px_0_rgb(28_42_85/0.06),0_12px_22px_-18px_rgb(28_42_85/0.5)] dark:bg-[#1D2622] dark:text-foreground"
    >
      <div className="flex items-baseline justify-between gap-4 px-5 pb-2 pt-5 sm:px-8">
        <h2 id="latest-title" className={`${DISPLAY} text-[1.75rem] font-bold leading-none`}>
          Nyss uppsatta
        </h2>
        <Link
          to="/sok"
          search={DEFAULTS}
          className="text-sm font-semibold text-[#046948] underline-offset-4 hover:underline dark:text-primary"
        >
          Visa alla annonser
        </Link>
      </div>

      <ol className="px-5 pb-3 sm:px-8">
        {loading &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="border-t border-[#1C2A55]/10 py-3.5 dark:border-white/10">
              <div className="h-4 w-2/3 rounded bg-[#1C2A55]/10 dark:bg-white/10" />
            </li>
          ))}
        {listings?.map((l) => (
          <li
            key={l.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-[#1C2A55]/10 py-2.5 dark:border-white/10 sm:grid-cols-[3.75rem_minmax(0,1fr)_auto]"
          >
            <span className="hidden text-[0.8125rem] tabular-nums opacity-60 sm:block">
              {postedLabel(l.publishedAt)}
            </span>
            <span className="min-w-0">
              <Link
                to="/annons/$id"
                params={{ id: l.id }}
                className="font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
              >
                {l.title}
              </Link>
              <span className="block text-[0.8125rem] opacity-60">
                {l.listingType === "sale" ? "Säljes" : "Uthyres"} i{" "}
                {l.area ? `${l.city}, ${l.area}` : l.city}
                {l.example && " (exempel)"}
              </span>
            </span>
            <span className="text-right">
              <span className="block whitespace-nowrap text-[0.9375rem] font-semibold tabular-nums">
                {priceLabel(l)}
              </span>
              <span className="block text-[0.8125rem] tabular-nums opacity-60 sm:hidden">
                {postedLabel(l.publishedAt)}
              </span>
            </span>
          </li>
        ))}
        {!loading && listings?.length === 0 && (
          <li className="border-t border-[#1C2A55]/10 py-6 text-[0.9375rem] dark:border-white/10">
            Inga annonser ännu.{" "}
            <Link to="/ny-annons" className="font-semibold underline underline-offset-4">
              Lägg upp den första
            </Link>
            .
          </li>
        )}
      </ol>
    </section>
  );
}

function Areas({ counts }: { counts: Map<string, number> | undefined }) {
  const withListings = CITIES.filter((c) => counts?.get(c.name));
  const others = CITIES.filter((c) => !counts?.get(c.name));

  return (
    <aside aria-labelledby="areas-title" className="text-[#1C2A55] dark:text-foreground lg:pt-2">
      <h2 id="areas-title" className={`${DISPLAY} text-[1.75rem] font-bold leading-none`}>
        Var i Stockholm?
      </h2>
      <ul className="mt-4 space-y-1.5">
        {withListings.map((c) => (
          <li key={c.slug}>
            <Link
              to="/sok"
              search={{ ...DEFAULTS, location: c.slug, radius: 10 }}
              className="flex justify-between gap-3 font-medium underline-offset-4 hover:underline"
            >
              {c.name}
              <span className="tabular-nums opacity-60">{counts?.get(c.name)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <>
          <p className="mt-6 text-[0.8125rem] opacity-70">Inga annonser än i</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.9375rem]">
            {others.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/sok"
                  search={{ ...DEFAULTS, location: c.slug, radius: 10 }}
                  className="opacity-75 underline-offset-4 hover:underline hover:opacity-100"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
