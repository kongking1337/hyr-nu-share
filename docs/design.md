# Design: "Hyrlapp"

Chosen on 2026-11-01 from three prototypes of the home page (A "Grannskap", B "Tunnelbana",
C "Hyrlapp"; Marcus picked C). All three variants are kept on the local git branch
`prototype/home-redesign` (commit `0aa615f`, also in main's history).

## Tokens (`src/styles.css`)

- **Colours:** signal orange `--primary` (like a rental tag), ink grey `--foreground` on near-white
  `--background`, neutral grey `--muted` for surfaces. `--accent` is a pale orange tint for hovers.
  Dark mode uses the same roles (`.dark`).
- **Type:** Bricolage Grotesque for headings (`h1`–`h3`, `.font-display`), bold and tight;
  Instrument Sans for everything else. Both are self-hosted through Fontsource.
- **Shapes:** buttons are pills (`rounded-full`), photos and tiles `rounded-2xl`, big bands `rounded-3xl`.

## Building blocks

- `Header`: the `hyrkoll.` wordmark, a compact search field (not on `/` and `/sok`), a dark "Hyr ut"
  pill and one account menu. Everything else (bookings, messages, listings, favourites, admin,
  dark mode, log out) lives in that menu, with counts from `useNotificationCounts`.
- `BottomTabs`: the mobile tab bar (Sök, Favoriter, Hyr ut, Meddelanden, Bokningar), below `md`.
- `PriceTag` / `ListingRow` (`src/components/ListingRow.tsx`): the price as an orange hang tag.
  This tag is the site's recognisable element. Use it for prices per day and nowhere else
  decorative, and don't add other loud elements next to it.

## Principles

- One loud thing per screen: the orange (search sentence, price tags, main button). Everything
  else stays ink and grey.
- Plain Swedish, sentence case, verbs on buttons ("Visa vad som finns", "Lägg upp annons").
- Loading shows skeletons in the shape of the content. Empty states say what to do next and
  link to it.
- Numbered steps only for real sequences (renting, listing).

## Redesign phases

1. Design system, header, tab bar, footer, home page. Done.
2. Search results, listing cards and the listing page.
3. Bookings, messages, account, my listings, new listing.
4. The rest (profile, auth, legal pages, admin), plus a shared page shell for widths and spacing.
