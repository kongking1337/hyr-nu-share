import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

/** "Logga in för att …" med en knapp som leder till inloggningen och sedan tillbaka hit. */
export function useLoginPrompt() {
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  return (message: string) =>
    toast.info(message, {
      action: {
        label: "Logga in",
        onClick: () => void navigate({ to: "/auth", search: { redirect: href } }),
      },
    });
}
