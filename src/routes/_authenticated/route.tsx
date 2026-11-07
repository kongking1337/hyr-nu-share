import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // getSession läser inloggningen lokalt (getUser frågar servern vid varje sidbyte). Det räcker
  // här: det är databasens regler som skyddar uppgifterna.
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user };
  },
  component: () => <Outlet />,
});
