/**
 * Databasens egna felmeddelanden (gränser, spärrar, regler) är skrivna på svenska för
 * användaren och visas som de är. Tekniska fel ersätts med `fallback`.
 */
const OWN_MESSAGE =
  /^(Du |Kontot är spärrat|Högst \d|Bilder måste|Annonsen |Meddelandet |Exempelannonser|Det här är din|Logga in)/;

export function userMessage(error: unknown, fallback: string): string {
  const message =
    error instanceof Error ? error.message : (error as { message?: string } | null)?.message;
  return message && OWN_MESSAGE.test(message) ? message : fallback;
}
