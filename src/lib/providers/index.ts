import { externalProviders } from "./mock-external";
import { internalProvider } from "./internal";
import type { ProviderQuery, RentalProvider, UnifiedResult } from "./types";

export { BRAND } from "./internal";
export type { UnifiedResult, ProviderQuery } from "./types";

export const providers: RentalProvider[] = [internalProvider, ...externalProviders];

export type SourceFilter = "all" | "internal" | "external";

export async function searchAll(
  q: ProviderQuery,
  sources: SourceFilter = "all",
): Promise<{ results: UnifiedResult[]; failed: string[] }> {
  const selected = providers.filter((p) =>
    sources === "all" ? true : sources === "internal" ? p.kind === "internal" : p.kind === "external",
  );
  const settled = await Promise.allSettled(selected.map((p) => p.search(q)));
  const results: UnifiedResult[] = [];
  const failed: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") results.push(...s.value);
    else failed.push(selected[i]!.name);
  });
  return { results, failed };
}
