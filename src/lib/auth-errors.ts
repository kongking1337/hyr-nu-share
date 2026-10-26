import type { AuthError } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 8;

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Fel e-postadress eller lösenord.",
  email_not_confirmed:
    "Bekräfta din e-postadress först. Kolla inkorgen (och skräpposten) efter vårt mejl.",
  user_already_exists: "Det finns redan ett konto med den e-postadressen. Logga in i stället.",
  email_exists: "Det finns redan ett konto med den e-postadressen. Logga in i stället.",
  weak_password: `Lösenordet är för svagt. Använd minst ${MIN_PASSWORD_LENGTH} tecken och gärna en blandning av bokstäver och siffror.`,
  same_password: "Det nya lösenordet måste skilja sig från det gamla.",
  email_address_invalid: "E-postadressen ser inte giltig ut.",
  email_address_not_authorized:
    "Vi kan inte skicka e-post till den adressen just nu. Försök igen senare.",
  over_email_send_rate_limit:
    "Vi har skickat för många mejl på kort tid. Vänta en stund och försök igen.",
  over_request_rate_limit: "För många försök. Vänta en stund och försök igen.",
  signup_disabled: "Det går inte att skapa nya konton just nu.",
  user_banned: "Kontot är spärrat.",
  session_expired: "Du har blivit utloggad. Logga in igen.",
  session_not_found: "Du har blivit utloggad. Logga in igen.",
  otp_expired: "Länken har gått ut eller redan använts. Begär en ny.",
  flow_state_expired: "Länken har gått ut. Börja om.",
  reauthentication_needed: "Logga in igen och försök sedan på nytt.",
  captcha_failed: "Säkerhetskontrollen misslyckades. Försök igen.",
  provider_disabled: "Den inloggningsmetoden är inte aktiverad.",
  validation_failed: "Kontrollera uppgifterna och försök igen.",
};

/** Svenskt felmeddelande för fel från Supabase Auth. */
export function authErrorMessage(
  error: Pick<AuthError, "code" | "message"> | null | undefined,
): string {
  if (!error) return "Något gick fel. Försök igen.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  // Äldre svar saknar ibland kod.
  if (/invalid login credentials/i.test(error.message)) return MESSAGES["invalid_credentials"]!;
  if (/email not confirmed/i.test(error.message)) return MESSAGES["email_not_confirmed"]!;
  if (/password should be at least/i.test(error.message)) return MESSAGES["weak_password"]!;
  if (/rate limit/i.test(error.message)) return MESSAGES["over_request_rate_limit"]!;
  return "Något gick fel. Försök igen om en stund.";
}
