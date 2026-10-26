# Email: login emails and notifications

Hyrkoll sends two kinds of email:

| Email | Sent by | Needs |
|---|---|---|
| Confirm account, reset password | Supabase Auth | Custom SMTP in Supabase (step 1) |
| "You have a new message" | The site's server (`src/lib/notify.functions.ts`) | Resend + own domain + Cloudflare secrets (step 3) |

Supabase's built-in email sender only delivers to members of the Supabase team
(other addresses get the error `email_address_not_authorized`), so ordinary users
can't confirm their account or reset their password until step 1 is done.

## 1. Temporary SMTP without a domain (Gmail), for a closed beta

1. Create a separate Gmail account for the site, e.g. `hyrkoll.info@gmail.com`.
2. Turn on 2-step verification in that Google account, then create an **app password**
   (Google Account → Security → App passwords). Works as long as Google allows app passwords.
3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Sender email: the Gmail address · Sender name: `Hyrkoll`
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: the Gmail address · Password: the app password
4. Gmail sends at most about 500 emails a day. Enough for a closed beta.

**When you have a domain:** switch to Resend in the same place: host `smtp.resend.com`,
port `465`, username `resend`, password = the Resend API key, sender e.g.
`noreply@yourdomain.se`.

## 2. Settings and Swedish templates in Supabase

- **Authentication → Providers → Email**: minimum password length **8** (same as the site).
- **Authentication → URL Configuration**: Redirect URLs must cover `/nytt-losenord`
  (e.g. `https://<site>/**`).
- **Authentication → Emails → Templates**:

**Confirm signup** – subject: `Bekräfta ditt konto på Hyrkoll`
```html
<h2>Välkommen till Hyrkoll!</h2>
<p>Klicka på länken för att bekräfta din e-postadress:</p>
<p><a href="{{ .ConfirmationURL }}">Bekräfta mitt konto</a></p>
<p>Har du inte skapat ett konto kan du bortse från det här mejlet.</p>
```

**Reset password** – subject: `Välj ett nytt lösenord för Hyrkoll`
```html
<h2>Nytt lösenord</h2>
<p>Någon, förhoppningsvis du, har bett om att få byta lösenord för ditt konto på Hyrkoll.</p>
<p><a href="{{ .ConfirmationURL }}">Välj ett nytt lösenord</a></p>
<p>Länken gäller i en timme. Bad du inte om det här kan du bortse från mejlet; ditt lösenord ändras inte.</p>
```

**Change email address** – subject: `Bekräfta din nya e-postadress`
```html
<h2>Bekräfta ny e-postadress</h2>
<p>Klicka på länken för att byta e-postadress från {{ .Email }} till {{ .NewEmail }}:</p>
<p><a href="{{ .ConfirmationURL }}">Bekräfta ny adress</a></p>
```

## 3. Message notifications (needs a domain)

1. Resend: create an account, add and verify your domain (DNS records in Cloudflare),
   create an API key.
2. Cloudflare → Worker `hyrkoll` → Settings → Variables and Secrets:
   - `RESEND_API_KEY` (Secret)
   - `SUPABASE_SERVICE_ROLE_KEY` (Secret): Supabase → Project Settings → API Keys, the secret key
   - `EMAIL_FROM`: e.g. `Hyrkoll <noreply@yourdomain.se>`

Without these, no notifications are sent; messages still show up on the site.
