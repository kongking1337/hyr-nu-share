import { supabase } from "@/integrations/supabase/client";
import { clearRecentSearches } from "@/lib/search/suggest";

/**
 * Loggar ut på den här enheten. Med scope "local" tas inloggningen bort även om nätet
 * strular (standardvalet "global" loggar ut på alla enheter och ger upp utan nät).
 */
export async function signOut(): Promise<void> {
  clearRecentSearches();
  await supabase.auth.signOut({ scope: "local" });
}
