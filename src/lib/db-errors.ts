/**
 * Databasens egna felmeddelanden (gränser, spärrar, regler) är skrivna på svenska för
 * användaren och visas som de är. Tekniska fel ersätts med `fallback`.
 */
const OWN_MESSAGE =
  /^(Du |Kontot är spärrat|Högst \d|Bilder|Priset |Bara |Omdöme|Tiden |Avtalet|Annonsen |Meddelandet |Exempelannonser|Det här är din|Logga in|Den här saken|Välj |Startdatumet|Datumen |Förfrågan |Bokningen |Markera först|Hyran |Neka förfrågan|Uthyraren )/;

export function userMessage(error: unknown, fallback: string): string {
  const message =
    error instanceof Error ? error.message : (error as { message?: string } | null)?.message;
  return message && OWN_MESSAGE.test(message) ? message : fallback;
}
