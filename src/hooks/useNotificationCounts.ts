import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { todayISO } from "@/lib/bookings";

/** Olästa meddelanden, bokningsförfrågningar att svara på och öppna anmälningar (admin). */
export function useNotificationCounts() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();

  const { data: unread = 0 } = useQuery({
    queryKey: ["unread-count", user?.id],
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: async () => (await supabase.rpc("unread_conversation_count")).data ?? 0,
  });

  // Bokningsförfrågningar som väntar på mitt svar.
  const { data: pendingBookings = 0 } = useQuery({
    queryKey: ["pending-bookings", user?.id],
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user!.id)
        .eq("status", "requested")
        .gte("start_date", todayISO());
      return count ?? 0;
    },
  });

  const { data: openReports = 0 } = useQuery({
    queryKey: ["admin-report-count", user?.id],
    enabled: isAdmin,
    refetchInterval: 300_000,
    queryFn: async () => (await supabase.rpc("admin_open_report_count")).data ?? 0,
  });

  return { user, isAdmin, unread, pendingBookings, openReports };
}
