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

- **Tab icon** (`public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`): the wordmark's "h." in
  Bricolage Grotesque (white h, orange dot) on an ink-grey rounded square. The letters are paths, not
  text. Bump the `?v=` in `src/routes/__root.tsx` when the icon changes, since browsers cache it hard.

## Building blocks

- `Header`: the `hyrkoll.` wordmark, a compact search field (not on `/` and `/sok`), a dark "Hyr ut"
  pill and one account menu. Everything else (bookings, messages, listings, favourites, admin,
  dark mode, log out) lives in that menu, with counts from `useNotificationCounts`.
- `BottomTabs`: the mobile tab bar (Sök, Favoriter, Hyr ut, Meddelanden, Bokningar), below `md`.
- `PriceTag` / `ListingRow` (`src/components/ListingRow.tsx`): the price as an orange hang tag.
  This tag is the site's recognisable element. Use it for prices per day and nowhere else
  decorative, and don't add other loud elements next to it.

- `ListingCard`: photo first, title, place and price tag; the whole card is a link and the heart sits
  on top. `layout="list"` gives a row.
- `src/components/layout.tsx`: `Page` (the page frame: `narrow` / `text` / `default` / `wide`
  widths with the same padding everywhere), `PageHeader` (title, description, buttons),
  `EmptyState` (icon, what's missing, what to do) and `LoadingRows` / `LoadingCards` skeletons.
  Every page uses these instead of its own `mx-auto max-w-* px-4 py-*`.
- shadcn primitives in `src/components/ui/` are restyled: pill buttons (`secondary` is the dark
  ink pill), 44px rounded inputs and selects, borderless-shadow cards.

## Principles

- One loud thing per screen: the orange (search sentence, price tags, main button). Everything
  else stays ink and grey.
- Plain Swedish, sentence case, verbs on buttons ("Visa vad som finns", "Lägg upp annons").
- Loading shows skeletons in the shape of the content. Empty states say what to do next and
  link to it.
- Numbered steps only for real sequences (renting, listing).

## Redesign phases

1. Design system, header, tab bar, footer, home page. Done.
2. Search results, listing cards and the listing page. Done.
3. Bookings, messages, account, my listings, new listing. Done.
4. The rest (profile, auth, legal pages, admin, hidden pages) and the shared page shell. Done.
