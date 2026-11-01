// Tests the database rules (row level security, grants and triggers) locally,
// without touching the live Supabase project. All migrations in
// supabase/migrations/ are replayed in PGlite (real Postgres running in Node) on top
// of a small stand-in for what Supabase sets up: the API roles, auth.users,
// auth.uid() and Supabase's default "grant everything" privileges.
//
// Run: npm run test:db
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

const SUPABASE_BASE = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    phone text,
    phone_confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;

  -- Supabase Storage: buckets, objects (with row level security) and foldername().
  CREATE SCHEMA storage;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL,
    public boolean NOT NULL DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text REFERENCES storage.buckets (id),
    name text NOT NULL,
    owner uuid DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  -- Supabase grants every new table and function to the API roles, so the
  -- migrations' own rules are what actually protects the data.
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`;

let db;
const u = {}; // test users: alice (seller), bob (buyer), mallory (attacker), admin

/** Runs one statement as a logged-in user (or as a logged-out visitor when `who` is null). */
async function as(who, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${who ? "authenticated" : "anon"}`);
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(who ? { sub: who.id, role: "authenticated" } : { role: "anon" }),
    ]);
    return (await tx.query(sql, params)).rows;
  });
}

/** Runs SQL as the platform itself (like the Supabase SQL editor). */
async function platform(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

const rejects = (who, sql, params) => assert.rejects(as(who, sql, params));

/** Runs one statement as the site's server (service role key). */
async function asService(sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE service_role");
    return (await tx.query(sql, params)).rows;
  });
}

async function createUser(name, fullName) {
  const [row] = await platform(
    "INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) RETURNING id",
    [`${name}@example.com`, JSON.stringify({ full_name: fullName, account_type: "private" })],
  );
  u[name] = { id: row.id };
}

// A listing as the "Hyr ut" page sends it.
const listingSql = `
  INSERT INTO public.listings (owner_id, owner_name, title, description, category_slug, city,
                               price_day, instant_book, allow_offers, status, images)
  VALUES ($1, 'Uthyrare', $2, 'Beskrivning', 'verktyg', 'Stockholm', 199, $3, true, 'published', '{}')
  RETURNING id`;

async function createListing(owner, title, { instantBook = false } = {}) {
  const [row] = await as(owner, listingSql, [owner.id, title, instantBook]);
  return row.id;
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_BASE);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${e.message}`);
    }
  }
  await createUser("alice", "Alice Andersson");
  await createUser("bob", "Bob Berg");
  await createUser("mallory", "Mallory");
  await createUser("admin", "Admin");
  await platform("INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')", [
    u.admin.id,
  ]);
  await platform("UPDATE public.profiles SET phone = '0701234567' WHERE id = $1", [u.alice.id]);
});

// --- Profiles ------------------------------------------------------------------

test("logged-out visitors cannot read profiles", async () => {
  await rejects(null, "SELECT phone FROM public.profiles");
});

test("users cannot read other users' profiles or phone numbers", async () => {
  const rows = await as(u.bob, "SELECT phone FROM public.profiles WHERE id = $1", [u.alice.id]);
  assert.deepEqual(rows, []);
});

test("users can read and edit their own name and city", async () => {
  await as(
    u.alice,
    "UPDATE public.profiles SET full_name = 'Alice Andersson', city = 'Solna' WHERE id = $1",
    [u.alice.id],
  );
  const [me] = await as(u.alice, "SELECT city, phone FROM public.profiles WHERE id = $1", [
    u.alice.id,
  ]);
  assert.equal(me.city, "Solna");
  assert.equal(me.phone, "0701234567");
});

test("users cannot mark themselves verified or change their rating", async () => {
  await as(
    u.alice,
    `UPDATE public.profiles SET email_verified = true, phone_verified = true, id_verified = true,
            rating = 5, review_count = 99 WHERE id = $1`,
    [u.alice.id],
  );
  const [p] = await platform(
    "SELECT email_verified, phone_verified, id_verified, rating::float AS rating, review_count FROM public.profiles WHERE id = $1",
    [u.alice.id],
  );
  assert.deepEqual(p, {
    email_verified: false,
    phone_verified: false,
    id_verified: false,
    rating: 0,
    review_count: 0,
  });
});

test("users cannot create or delete profiles", async () => {
  await rejects(
    u.mallory,
    "INSERT INTO public.profiles (id, full_name) VALUES (gen_random_uuid(), 'Fake')",
  );
  await rejects(u.mallory, "DELETE FROM public.profiles WHERE id = $1", [u.mallory.id]);
});

test("admins can read all profiles (admin page)", async () => {
  const [{ n }] = await as(u.admin, "SELECT count(*)::int AS n FROM public.profiles");
  assert.equal(n, 4);
});

// --- Companies -----------------------------------------------------------------

test("companies cannot verify themselves", async () => {
  const [c] = await as(
    u.bob,
    "INSERT INTO public.companies (owner_id, name, verified) VALUES ($1, 'Bobs Bygg AB', true) RETURNING id, verified",
    [u.bob.id],
  );
  assert.equal(c.verified, false);
  u.bob.companyId = c.id;
  await as(u.bob, "UPDATE public.companies SET verified = true WHERE id = $1", [c.id]);
  const [after] = await platform("SELECT verified FROM public.companies WHERE id = $1", [c.id]);
  assert.equal(after.verified, false);
});

test("users cannot see who administers other companies", async () => {
  await as(u.bob, "INSERT INTO public.company_admins (company_id, user_id) VALUES ($1, $2)", [
    u.bob.companyId,
    u.bob.id,
  ]);
  assert.deepEqual(await as(u.mallory, "SELECT * FROM public.company_admins"), []);
  assert.equal((await as(u.bob, "SELECT * FROM public.company_admins")).length, 1);
});

// --- Listings ------------------------------------------------------------------

test("new listings get platform-controlled fields, whatever the browser sends", async () => {
  const [l] = await as(
    u.alice,
    `INSERT INTO public.listings (owner_id, owner_name, owner_type, company_id, title, category_slug, city,
                                  price_day, rating, review_count, booking_count, views_count, service_fee_pct)
     VALUES ($1, 'Hyrkoll Support', 'company', $2, 'Borrmaskin', 'verktyg', 'Stockholm', 99, 5, 999, 500, 100000, 0)
     RETURNING id, owner_name, owner_type::text, company_id, rating::float AS rating, review_count,
               booking_count, views_count, service_fee_pct::float AS fee`,
    [u.alice.id, u.bob.companyId],
  );
  assert.equal(l.owner_name, "Alice A.");
  assert.equal(l.owner_type, "private");
  assert.equal(l.company_id, null);
  assert.deepEqual(
    [l.rating, l.review_count, l.booking_count, l.views_count, l.fee],
    [0, 0, 0, 0, 10],
  );
  u.alice.listingId = l.id;
});

test("owners can edit content but not protected fields", async () => {
  await as(
    u.alice,
    `UPDATE public.listings SET title = 'Borrmaskin Bosch', price_day = 149, rating = 5,
            owner_name = 'Hyrkoll Support', owner_id = $2, booking_count = 7 WHERE id = $1`,
    [u.alice.listingId, u.bob.id],
  );
  const [l] = await platform(
    "SELECT title, price_day::float AS price, rating::float AS rating, owner_name, owner_id, booking_count FROM public.listings WHERE id = $1",
    [u.alice.listingId],
  );
  assert.deepEqual(l, {
    title: "Borrmaskin Bosch",
    price: 149,
    rating: 0,
    owner_name: "Alice A.",
    owner_id: u.alice.id,
    booking_count: 0,
  });
});

test("nobody can edit or delete someone else's listing", async () => {
  assert.deepEqual(
    await as(u.mallory, "UPDATE public.listings SET title = 'Hackad' WHERE id = $1 RETURNING id", [
      u.alice.listingId,
    ]),
    [],
  );
  assert.deepEqual(
    await as(u.mallory, "DELETE FROM public.listings WHERE id = $1 RETURNING id", [
      u.alice.listingId,
    ]),
    [],
  );
  const [l] = await platform("SELECT title FROM public.listings WHERE id = $1", [
    u.alice.listingId,
  ]);
  assert.equal(l.title, "Borrmaskin Bosch");
});

test("logged-out visitors cannot create listings", async () => {
  await rejects(null, listingSql, [u.alice.id, "Anonym", false]);
});

test("only admins can remove listings, and owners cannot undo a removal", async () => {
  await rejects(u.alice, "UPDATE public.listings SET status = 'removed' WHERE id = $1", [
    u.alice.listingId,
  ]);
  await rejects(u.alice, "UPDATE public.listings SET status = 'nonsense' WHERE id = $1", [
    u.alice.listingId,
  ]);
  const id = await createListing(u.alice, "Tas bort");
  await platform("UPDATE public.listings SET status = 'removed' WHERE id = $1", [id]);
  await rejects(u.alice, "UPDATE public.listings SET status = 'published' WHERE id = $1", [id]);
});

test("existing app flows still work: pause, duplicate, delete", async () => {
  await as(u.alice, "UPDATE public.listings SET status = 'paused' WHERE id = $1", [
    u.alice.listingId,
  ]);
  await as(u.alice, "UPDATE public.listings SET status = 'published' WHERE id = $1", [
    u.alice.listingId,
  ]);
  // "Duplicera" sends the whole row back, including counters.
  const [copy] = await as(
    u.alice,
    `INSERT INTO public.listings (owner_id, owner_name, title, category_slug, city, price_day, rating, review_count, status)
     SELECT owner_id, owner_name, title || ' (kopia)', category_slug, city, price_day, 4.9, 42, 'draft'
       FROM public.listings WHERE id = $1
     RETURNING id, rating::float AS rating, review_count`,
    [u.alice.listingId],
  );
  assert.deepEqual([copy.rating, copy.review_count], [0, 0]);
  assert.equal(
    (await as(u.alice, "DELETE FROM public.listings WHERE id = $1 RETURNING id", [copy.id])).length,
    1,
  );
});

test("the seller name follows profile changes", async () => {
  await as(u.alice, "UPDATE public.profiles SET full_name = 'Alice  Maria Lind' WHERE id = $1", [
    u.alice.id,
  ]);
  const [l] = await platform("SELECT owner_name FROM public.listings WHERE id = $1", [
    u.alice.listingId,
  ]);
  assert.equal(l.owner_name, "Alice L.");
});

test("listings can be published under the user's own company", async () => {
  const [c] = await as(
    u.alice,
    "INSERT INTO public.companies (owner_id, name) VALUES ($1, 'Alices Verktyg AB') RETURNING id",
    [u.alice.id],
  );
  const [l] = await as(
    u.alice,
    "UPDATE public.listings SET company_id = $2 WHERE id = $1 RETURNING owner_name, owner_type::text",
    [u.alice.listingId, c.id],
  );
  assert.deepEqual(l, { owner_name: "Alices Verktyg AB", owner_type: "company" });
  await as(u.alice, "UPDATE public.listings SET company_id = NULL WHERE id = $1", [
    u.alice.listingId,
  ]);
});

// --- Sell and rent ---------------------------------------------------------------

const saleSql = `
  INSERT INTO public.listings (owner_id, listing_type, title, category_slug, city, price, status)
  VALUES ($1, 'sale', $2, 'verktyg', 'Solna', $3, 'published')
  RETURNING id, price::float AS price, price_day`;

test("sale listings need a price, rentals a day price; 0 kr means given away", async () => {
  await rejects(u.alice, saleSql, [u.alice.id, "Utan pris", null]);
  await rejects(u.alice, saleSql, [u.alice.id, "Negativt pris", -5]);
  await rejects(
    u.alice,
    `INSERT INTO public.listings (owner_id, listing_type, title, category_slug, city, price)
     VALUES ($1, 'rent', 'Uthyres utan dygnspris', 'verktyg', 'Solna', 100)`,
    [u.alice.id],
  );
  await rejects(
    u.alice,
    `INSERT INTO public.listings (owner_id, listing_type, title, category_slug, city, price)
     VALUES ($1, 'swap', 'Byte', 'verktyg', 'Solna', 100)`,
    [u.alice.id],
  );
  const [free] = await as(u.alice, saleSql, [u.alice.id, "Skänkes", 0]);
  assert.deepEqual([free.price, free.price_day], [0, null]);
});

test("only sale listings can be marked sold, and sold listings disappear from search", async () => {
  await rejects(u.alice, "UPDATE public.listings SET status = 'sold' WHERE id = $1", [
    u.alice.listingId,
  ]);
  const [sale] = await as(u.alice, saleSql, [u.alice.id, "Skruvdragare", 450]);
  await as(u.alice, "UPDATE public.listings SET status = 'sold' WHERE id = $1", [sale.id]);
  assert.deepEqual(await as(null, "SELECT id FROM public.listings WHERE id = $1", [sale.id]), []);
  assert.deepEqual(await as(u.bob, "SELECT id FROM public.listings WHERE id = $1", [sale.id]), []);
  assert.equal(
    (await as(u.alice, "SELECT id FROM public.listings WHERE id = $1", [sale.id])).length,
    1,
  );
});

// --- Reviews -------------------------------------------------------------------

test("the fake demo reviews are gone, and reviews can't be written or read directly", async () => {
  await rejects(
    u.bob,
    "INSERT INTO public.reviews (listing_id, author_id, rating, body) VALUES ($1, $2, 5, 'Fake')",
    [u.alice.listingId, u.bob.id],
  );
  await rejects(null, "SELECT id FROM public.reviews");
  const [{ n }] = await platform("SELECT count(*)::int AS n FROM public.reviews");
  assert.equal(n, 0);
  const [{ rated }] = await platform(
    "SELECT count(*)::int AS rated FROM public.listings WHERE rating <> 0 OR review_count <> 0",
  );
  assert.equal(rated, 0);
});

// --- Bookings ------------------------------------------------------------------

/** The date `n` days from today, as YYYY-MM-DD. */
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const requestBooking = (who, listingId, start, end, { delivery = false, message = null } = {}) =>
  as(who, "SELECT public.request_booking($1, $2, $3, $4, $5) AS r", [
    listingId,
    start,
    end,
    delivery,
    message,
  ]).then((rows) => rows[0].r);

const respond = (who, bookingId, action) =>
  as(who, "SELECT public.respond_booking($1, $2) AS r", [bookingId, action]).then(
    (rows) => rows[0].r,
  );

const setPhotos = (who, bookingId, stage, paths) =>
  as(who, "SELECT public.set_booking_photos($1, $2, $3::text[])", [bookingId, stage, paths]);

const photoOf = (who) => `${who.id}/${crypto.randomUUID()}.webp`;

const bookingRow = async (id) =>
  (
    await platform(
      `SELECT status::text, days, base_price::float AS base, delivery_fee::float AS fee,
              deposit::float AS deposit, total_price::float AS total, owner_id,
              pickup_photos, picked_up_at IS NOT NULL AS picked_up, returned_at IS NOT NULL AS returned
         FROM public.bookings WHERE id = $1`,
      [id],
    )
  )[0];

test("bookings can only be written through the booking functions", async () => {
  // Own users, so the message and inbox tests below keep their exact counts.
  await createUser("olle", "Olle Ek");
  await createUser("rut", "Rut Ros");
  await createUser("carl", "Carl Cox");
  await rejects(
    u.rut,
    `INSERT INTO public.bookings (listing_id, renter_id, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, 'confirmed')`,
    [u.alice.listingId, u.rut.id, day(5), day(6)],
  );
});

test("a request gets the listing's prices and owner, and shows up in the conversation", async () => {
  const id = await createListing(u.olle, "Släpvagn"); // 199 kr per day
  await as(
    u.olle,
    `UPDATE public.listings SET price_week = 900, deposit = 500, delivery_available = true,
            delivery_fee = 150 WHERE id = $1`,
    [id],
  );
  u.olle.trailerId = id;
  const r = await requestBooking(u.rut, id, day(10), day(17), {
    delivery: true,
    message: "Hämtar på morgonen",
  });
  const b = await bookingRow(r.booking_id);
  // 8 days: one week (900 kr) + one day (199 kr), plus delivery.
  assert.deepEqual(
    [b.status, b.days, b.base, b.fee, b.deposit, b.total, b.owner_id],
    ["requested", 8, 1099, 150, 500, 1249, u.olle.id],
  );
  const msgs = await as(
    u.olle,
    "SELECT kind, body, booking_id FROM public.messages WHERE conversation_id = $1",
    [r.conversation_id],
  );
  assert.equal(msgs.length, 1);
  assert.deepEqual([msgs[0].kind, msgs[0].booking_id], ["booking", r.booking_id]);
  assert.match(msgs[0].body, /^Bokningsförfrågan: .* \(8 dygn\), 1249 kr inkl\. leverans\.\n\nHämtar på morgonen$/);
  u.rut.trailerBooking = r.booking_id;
});

test("requests are checked: dates, length, own and demo listings, one open request each", async () => {
  const id = u.olle.trailerId;
  await assert.rejects(requestBooking(u.rut, id, day(40), day(41)), /redan en förfrågan/);
  await assert.rejects(requestBooking(u.carl, id, day(-1), day(2)), /redan varit/);
  await assert.rejects(requestBooking(u.carl, id, day(5), day(4)), /Välj start/);
  await assert.rejects(requestBooking(u.carl, id, day(5), day(100)), /90 dygn/);
  await assert.rejects(requestBooking(u.carl, id, day(400), day(401)), /ett år/);
  await assert.rejects(requestBooking(u.olle, id, day(5), day(6)), /egen annons/);
  const [demo] = await platform("SELECT id FROM public.listings WHERE owner_id IS NULL LIMIT 1");
  await assert.rejects(requestBooking(u.rut, demo.id, day(5), day(6)), /Exempelannonser/);
  await as(u.olle, "UPDATE public.listings SET min_days = 2 WHERE id = $1", [id]);
  await assert.rejects(requestBooking(u.carl, id, day(5), day(5)), /minst 2 dygn/);
  await as(u.olle, "UPDATE public.listings SET min_days = 1 WHERE id = $1", [id]);
  const noDelivery = await createListing(u.olle, "Skruvdragare");
  await assert.rejects(
    requestBooking(u.carl, noDelivery, day(5), day(6), { delivery: true }),
    /leverans/,
  );
  await rejects(null, "SELECT public.request_booking($1, $2, $3)", [id, day(5), day(6)]);
  // The price the renter saw must still be right (2 days × 199 kr = 398 kr).
  await assert.rejects(
    as(u.carl, "SELECT public.request_booking($1, $2, $3, false, NULL, 300)", [id, day(5), day(6)]),
    /Priset har ändrats till 398 kr/,
  );
  await as(u.olle, "UPDATE public.listings SET status = 'paused' WHERE id = $1", [noDelivery]);
  await assert.rejects(requestBooking(u.carl, noDelivery, day(5), day(6)), /går inte att boka/);
  await rejects(u.olle, "UPDATE public.listings SET min_days = 0 WHERE id = $1", [id]);
  await rejects(u.olle, "UPDATE public.listings SET cancellation_policy = 'never' WHERE id = $1", [id]);
});

test("only the owner accepts or declines; accepting declines overlapping requests", async () => {
  const id = u.olle.trailerId;
  const m = await requestBooking(u.carl, id, day(15), day(16));
  await assert.rejects(respond(u.rut, u.rut.trailerBooking, "accept"), /kan inte godkännas/);
  await assert.rejects(respond(u.mallory, u.rut.trailerBooking, "decline"), /finns inte/);
  await respond(u.olle, u.rut.trailerBooking, "accept");
  assert.equal((await bookingRow(u.rut.trailerBooking)).status, "confirmed");
  assert.equal((await bookingRow(m.booking_id)).status, "declined");
  const msgs = await as(
    u.carl,
    "SELECT body FROM public.messages WHERE conversation_id = $1 ORDER BY created_at",
    [m.conversation_id],
  );
  assert.match(msgs.at(-1).body, /nekades automatiskt/);
  await assert.rejects(requestBooking(u.carl, id, day(12), day(13)), /inte lediga/);
});

test("owners block days; taken days are public, but not who booked them", async () => {
  const id = u.olle.trailerId;
  const block = "INSERT INTO public.listing_blocked_dates (listing_id, start_date, end_date) VALUES ($1, $2, $3)";
  await as(u.olle, block, [id, day(30), day(32)]);
  await rejects(u.rut, block, [id, day(40), day(41)]);
  await rejects(u.olle, block, [id, day(40), day(39)]);
  assert.deepEqual(await as(u.rut, "SELECT id FROM public.listing_blocked_dates"), []);
  await rejects(null, "SELECT id FROM public.listing_blocked_dates");
  assert.deepEqual(
    await as(
      null,
      "SELECT start_date::text AS s, end_date::text AS e FROM public.booked_dates($1) ORDER BY 1",
      [id],
    ),
    [
      { s: day(10), e: day(17) },
      { s: day(30), e: day(32) },
    ],
  );
  await assert.rejects(requestBooking(u.carl, id, day(31), day(33)), /inte lediga/);
  const taken = async (from, to) =>
    (await as(null, "SELECT * FROM public.unavailable_listings($1, $2) AS id", [from, to])).map(
      (r) => r.id,
    );
  assert.ok((await taken(day(31), day(31))).includes(id));
  assert.ok((await taken(day(11), day(11))).includes(id));
  assert.ok(!(await taken(day(50), day(51))).includes(id));
});

test("pickup and return with condition photos; then the rental is completed", async () => {
  await assert.rejects(respond(u.rut, u.rut.trailerBooking, "picked_up"), /inte börjat/);
  await assert.rejects(respond(u.olle, u.rut.trailerBooking, "returned"), /Markera först/);

  const listing = await createListing(u.olle, "Högtryckstvätt");
  const r = await requestBooking(u.rut, listing, day(1), day(2));
  await assert.rejects(setPhotos(u.rut, r.booking_id, "pickup", [photoOf(u.rut)]), /godkända/);
  await respond(u.olle, r.booking_id, "accept");

  const alicePhoto = photoOf(u.olle);
  await setPhotos(u.rut, r.booking_id, "pickup", [photoOf(u.rut)]);
  await setPhotos(u.olle, r.booking_id, "pickup", [alicePhoto]);
  await assert.rejects(setPhotos(u.rut, r.booking_id, "pickup", [photoOf(u.olle)]), /Hyrkoll/);
  await assert.rejects(setPhotos(u.rut, r.booking_id, "pickup", ["https://evil.example/x.jpg"]));
  await assert.rejects(setPhotos(u.mallory, r.booking_id, "pickup", [photoOf(u.mallory)]), /finns inte/);
  await assert.rejects(
    setPhotos(u.rut, r.booking_id, "pickup", Array.from({ length: 9 }, () => photoOf(u.rut))),
    /Högst 8/,
  );
  // Bob removes his own photo; Alice's stays.
  await setPhotos(u.rut, r.booking_id, "pickup", []);
  assert.deepEqual((await bookingRow(r.booking_id)).pickup_photos, [alicePhoto]);

  await respond(u.rut, r.booking_id, "picked_up");
  await assert.rejects(respond(u.rut, r.booking_id, "cancel"), /kan inte avbokas/);
  await assert.rejects(respond(u.rut, r.booking_id, "returned"), /Bara uthyraren/);
  await respond(u.olle, r.booking_id, "returned");
  const done = await bookingRow(r.booking_id);
  assert.deepEqual([done.status, done.picked_up, done.returned], ["completed", true, true]);
  // Returned before the planned end: the remaining days are free again.
  assert.deepEqual(await as(null, "SELECT * FROM public.booked_dates($1)", [listing]), []);
});

test("renters withdraw requests, owners decline, and either side cancels before pickup", async () => {
  const listing = await createListing(u.olle, "Tält");
  const a = await requestBooking(u.rut, listing, day(5), day(6));
  await assert.rejects(respond(u.olle, a.booking_id, "cancel"), /Neka/);
  await respond(u.rut, a.booking_id, "cancel");
  const b = await requestBooking(u.rut, listing, day(5), day(6));
  await respond(u.olle, b.booking_id, "decline");
  const c = await requestBooking(u.rut, listing, day(5), day(6));
  await respond(u.olle, c.booking_id, "accept");
  await respond(u.olle, c.booking_id, "cancel");
  assert.deepEqual(
    [(await bookingRow(a.booking_id)).status, (await bookingRow(b.booking_id)).status, (await bookingRow(c.booking_id)).status],
    ["cancelled", "declined", "cancelled"],
  );
  await assert.rejects(respond(u.olle, b.booking_id, "accept"), /kan inte godkännas/);
  // Cancelled days are free again.
  await requestBooking(u.carl, listing, day(5), day(6));
});

test("accepting needs a listing that is still up and days that are still free", async () => {
  const id = await createListing(u.olle, "Kajak");
  const a = await requestBooking(u.rut, id, day(20), day(21));
  await as(u.olle, "UPDATE public.listings SET status = 'draft' WHERE id = $1", [id]);
  await assert.rejects(respond(u.olle, a.booking_id, "accept"), /inte att boka längre/);
  await as(u.olle, "UPDATE public.listings SET status = 'published' WHERE id = $1", [id]);
  await as(
    u.olle,
    "INSERT INTO public.listing_blocked_dates (listing_id, start_date, end_date) VALUES ($1, $2, $2)",
    [id, day(21)],
  );
  await assert.rejects(respond(u.olle, a.booking_id, "accept"), /redan bokade eller blockerade/);
});

test("when moderators remove a listing, its open requests and coming bookings end", async () => {
  const id = await createListing(u.olle, "Partytält");
  const open = await requestBooking(u.rut, id, day(20), day(21));
  const accepted = await requestBooking(u.carl, id, day(25), day(26));
  await respond(u.olle, accepted.booking_id, "accept");
  await as(u.admin, "SELECT public.admin_set_listing_hidden($1, true, 'Bedrägeri')", [id]);
  assert.equal((await bookingRow(open.booking_id)).status, "declined");
  assert.equal((await bookingRow(accepted.booking_id)).status, "cancelled");
  const [last] = await as(
    u.carl,
    "SELECT body, sender_id FROM public.messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1",
    [accepted.conversation_id],
  );
  assert.deepEqual([last.sender_id, /moderatorer/.test(last.body)], [null, true]);
  const taken = await as(null, "SELECT * FROM public.unavailable_listings($1, $1) AS id", [day(25)]);
  assert.ok(!taken.some((r) => r.id === id));
});

test("bookings without an owner can't be changed", async () => {
  const [demo] = await platform("SELECT id FROM public.listings WHERE owner_id IS NULL LIMIT 1");
  const [b] = await platform(
    `INSERT INTO public.bookings (listing_id, renter_id, owner_id, start_date, end_date, status)
     VALUES ($1, $2, NULL, $3, $4, 'requested') RETURNING id`,
    [demo.id, u.rut.id, day(5), day(6)],
  );
  for (const action of ["accept", "cancel", "picked_up"]) {
    await assert.rejects(respond(u.rut, b.id, action), /finns inte/);
  }
  await assert.rejects(setPhotos(u.rut, b.id, "pickup", [photoOf(u.rut)]), /finns inte/);
  assert.equal((await bookingRow(b.id)).status, "requested");
});

test("photos only on accepted bookings, at a known step", async () => {
  const id = await createListing(u.olle, "Stege");
  const r = await requestBooking(u.rut, id, day(5), day(6));
  await respond(u.olle, r.booking_id, "decline");
  await assert.rejects(setPhotos(u.rut, r.booking_id, "pickup", [photoOf(u.rut)]), /godkända/);
  await assert.rejects(setPhotos(u.olle, u.rut.trailerBooking, "during", [photoOf(u.olle)]), /Okänt steg/);
});

test("public availability hides requests and unpublished listings", async () => {
  const id = await createListing(u.olle, "Cykelkärra");
  await requestBooking(u.rut, id, day(5), day(6));
  assert.deepEqual(await as(null, "SELECT * FROM public.booked_dates($1)", [id]), []);
  await as(
    u.olle,
    "INSERT INTO public.listing_blocked_dates (listing_id, start_date, end_date) VALUES ($1, $2, $2)",
    [id, day(8)],
  );
  const takenOn = async (d) =>
    (await as(null, "SELECT * FROM public.unavailable_listings($1, $1) AS id", [d])).map((r) => r.id);
  assert.ok((await takenOn(day(8))).includes(id));
  await as(u.olle, "UPDATE public.listings SET status = 'draft' WHERE id = $1", [id]);
  assert.ok(!(await takenOn(day(8))).includes(id));
  assert.deepEqual(await as(null, "SELECT * FROM public.booked_dates($1)", [id]), []);
});

test("old blocked periods don't count towards the limit of 50", async () => {
  const id = await createListing(u.olle, "Släpkärra");
  for (let i = 0; i < 50; i++) {
    await platform(
      "INSERT INTO public.listing_blocked_dates (listing_id, start_date, end_date) VALUES ($1, $2, $2)",
      [id, day(-100 + i)],
    );
  }
  const block = "INSERT INTO public.listing_blocked_dates (listing_id, start_date, end_date) VALUES ($1, $2, $2)";
  await as(u.olle, block, [id, day(10)]);
});

test("at most 10 booking requests a day", async () => {
  await createUser("dora", "Dora Dag");
  const ids = await platform(
    `INSERT INTO public.listings (owner_id, owner_name, title, category_slug, city, price_day, status)
     SELECT $1, 'Olle E.', 'Borrmaskin ' || g, 'verktyg', 'Stockholm', 99, 'published'
       FROM generate_series(1, 11) g
     RETURNING id`,
    [u.olle.id],
  );
  for (const { id } of ids.slice(0, 10)) await requestBooking(u.dora, id, day(5), day(6));
  await assert.rejects(requestBooking(u.dora, ids[10].id, day(5), day(6)), /många förfrågningar/);
});

test("accounts can't be deleted in the middle of a rental", async () => {
  await assert.rejects(as(u.rut, "SELECT public.delete_my_account()"), /inte är avslutade/);
  await assert.rejects(as(u.olle, "SELECT public.delete_my_account()"), /inte är avslutade/);
});

test("my bookings show both sides with public names only", async () => {
  const sql = "SELECT counterpart_name, i_am_owner, listing_title FROM public.my_bookings() WHERE id = $1";
  assert.deepEqual(await as(u.rut, sql, [u.rut.trailerBooking]), [
    { counterpart_name: "Olle E.", i_am_owner: false, listing_title: "Släpvagn" },
  ]);
  assert.deepEqual(await as(u.olle, sql, [u.rut.trailerBooking]), [
    { counterpart_name: "Rut R.", i_am_owner: true, listing_title: "Släpvagn" },
  ]);
});

test("other users and logged-out visitors cannot see or change a booking", async () => {
  assert.deepEqual(
    await as(u.mallory, "SELECT id FROM public.bookings WHERE id = $1", [u.rut.trailerBooking]),
    [],
  );
  assert.deepEqual(
    await as(u.mallory, "SELECT id FROM public.my_bookings() WHERE id = $1", [u.rut.trailerBooking]),
    [],
  );
  await assert.rejects(respond(u.mallory, u.rut.trailerBooking, "cancel"), /finns inte/);
  await rejects(u.rut, "UPDATE public.bookings SET status = 'completed' WHERE id = $1", [
    u.rut.trailerBooking,
  ]);
  await rejects(null, "SELECT id FROM public.bookings");
  await rejects(null, "SELECT * FROM public.my_bookings()");
  await rejects(null, "SELECT public.respond_booking($1, 'cancel')", [u.rut.trailerBooking]);
});

test("users cannot fake booking messages", async () => {
  const [conv] = await as(
    u.rut,
    "SELECT id FROM public.conversations WHERE listing_id = $1 AND renter_id = $2",
    [u.olle.trailerId, u.rut.id],
  );
  const fake = `INSERT INTO public.messages (conversation_id, sender_id, body, kind, booking_id)
                VALUES ($1, $2, 'Bokningen är godkänd', $3, $4)`;
  await rejects(u.rut, fake, [conv.id, u.rut.id, "booking", u.rut.trailerBooking]);
  await rejects(u.rut, fake, [conv.id, u.rut.id, "text", u.rut.trailerBooking]);
});

test("blocked users can't ask for dates", async () => {
  await createUser("ivar", "Ivar Is");
  await platform("UPDATE public.profiles SET blocked_at = now() WHERE id = $1", [u.ivar.id]);
  await assert.rejects(requestBooking(u.ivar, u.olle.trailerId, day(60), day(61)), /spärrat/);
  await assert.rejects(respond(u.ivar, u.rut.trailerBooking, "cancel"), /spärrat/);
  await platform("UPDATE public.profiles SET blocked_at = NULL WHERE id = $1", [u.ivar.id]);
});

// --- Offers --------------------------------------------------------------------

const placeOffer = (who, listingId, start, end, amount) =>
  as(who, "SELECT public.place_offer($1, $2, $3, 1, 1000, $4) AS r", [
    listingId,
    start,
    end,
    amount,
  ]).then((rows) => rows[0].r);

test("bidding is switched off: offers can't be created or answered", async () => {
  await rejects(
    u.bob,
    `INSERT INTO public.offers (listing_id, renter_id, owner_id, start_date, end_date, amount, status)
     VALUES ($1, $2, $3, $4, $5, 1, 'accepted')`,
    [u.alice.listingId, u.bob.id, u.alice.id, day(5), day(6)],
  );
  await assert.rejects(placeOffer(u.bob, u.alice.listingId, day(5), day(6), 300));
  await rejects(u.alice, "SELECT public.respond_offer(gen_random_uuid(), 'accept')");
});

// --- Conversations and messages --------------------------------------------------

const startConversation = (who, listingId, renterId, ownerId) =>
  as(
    who,
    "INSERT INTO public.conversations (listing_id, renter_id, owner_id) VALUES ($1, $2, $3) RETURNING id",
    [listingId, renterId, ownerId],
  );

test("buyers can start a conversation with the listing's owner", async () => {
  const [c] = await startConversation(u.bob, u.alice.listingId, u.bob.id, u.alice.id);
  u.bob.conversationId = c.id;
});

test("conversations cannot be started in someone else's name or with the wrong owner", async () => {
  await rejects(
    u.bob,
    "INSERT INTO public.conversations (listing_id, renter_id, owner_id) VALUES ($1, $2, $3)",
    [u.alice.listingId, u.alice.id, u.bob.id],
  );
  await assert.rejects(startConversation(u.bob, u.alice.listingId, u.bob.id, u.mallory.id));
  await assert.rejects(startConversation(u.alice, u.alice.listingId, u.alice.id, u.alice.id));
});

test("only the two parties can read and write messages", async () => {
  await as(
    u.bob,
    "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Hej! Finns den kvar?')",
    [u.bob.conversationId, u.bob.id],
  );
  assert.equal(
    (
      await as(u.alice, "SELECT id FROM public.messages WHERE conversation_id = $1", [
        u.bob.conversationId,
      ])
    ).length,
    1,
  );
  assert.deepEqual(await as(u.mallory, "SELECT id FROM public.messages"), []);
  await rejects(
    u.mallory,
    "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Spam')",
    [u.bob.conversationId, u.mallory.id],
  );
});

test("users cannot fake system messages, edit messages or delete conversations", async () => {
  await rejects(
    u.bob,
    "INSERT INTO public.messages (conversation_id, sender_id, body, kind) VALUES ($1, $2, 'Betalning mottagen', 'system')",
    [u.bob.conversationId, u.bob.id],
  );
  await rejects(
    u.bob,
    "INSERT INTO public.messages (conversation_id, sender_id, body, image_url) VALUES ($1, $2, 'Bild', 'https://evil.example/x.png')",
    [u.bob.conversationId, u.bob.id],
  );
  await rejects(u.bob, "UPDATE public.messages SET body = 'Ändrat' WHERE conversation_id = $1", [
    u.bob.conversationId,
  ]);
  await rejects(u.bob, "DELETE FROM public.conversations WHERE id = $1", [u.bob.conversationId]);
  assert.equal(
    (await platform("SELECT id FROM public.conversations WHERE id = $1", [u.bob.conversationId]))
      .length,
    1,
  );
});

// --- Contacting the seller -----------------------------------------------------

const startSql = "SELECT public.start_conversation($1, $2) AS id";
const inbox = (who) =>
  as(
    who,
    "SELECT id, counterpart_name, i_am_seller, last_message, unread FROM public.my_conversations()",
  );
const claim = (conversationId, senderId) =>
  asService("SELECT * FROM public.claim_message_notification($1, $2)", [conversationId, senderId]);

test("buyers contact the seller from a listing; the same conversation is reused", async () => {
  const id = await createListing(u.alice, "Cykel att hyra");
  u.alice.contactListingId = id;
  const [{ id: first }] = await as(u.bob, startSql, [id, "  Hej! Finns den kvar?  "]);
  const [{ id: again }] = await as(u.bob, startSql, [id, "Kan jag hämta i morgon?"]);
  assert.equal(again, first);
  u.bob.contactConversationId = first;
  const bodies = await as(
    u.alice,
    "SELECT body FROM public.messages WHERE conversation_id = $1 ORDER BY created_at",
    [first],
  );
  assert.deepEqual(
    bodies.map((m) => m.body),
    ["Hej! Finns den kvar?", "Kan jag hämta i morgon?"],
  );
});

test("you cannot contact yourself, demo listings or listings that are not published", async () => {
  await rejects(u.alice, startSql, [u.alice.contactListingId, "Hej"]);
  const [demo] = await platform("SELECT id FROM public.listings WHERE owner_id IS NULL LIMIT 1");
  await rejects(u.bob, startSql, [demo.id, "Hej"]);
  const paused = await createListing(u.alice, "Pausad");
  await as(u.alice, "UPDATE public.listings SET status = 'paused' WHERE id = $1", [paused]);
  await rejects(u.bob, startSql, [paused, "Hej"]);
  await rejects(null, startSql, [u.alice.contactListingId, "Hej"]);
});

test("messages must be 1–2000 characters", async () => {
  await rejects(u.bob, startSql, [u.alice.contactListingId, "   "]);
  await rejects(u.bob, startSql, [u.alice.contactListingId, "x".repeat(2001)]);
  await rejects(
    u.bob,
    "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, '')",
    [u.bob.contactConversationId, u.bob.id],
  );
});

test("the inbox shows public names only, and unread status per person", async () => {
  const [forAlice] = (await inbox(u.alice)).filter((c) => c.id === u.bob.contactConversationId);
  assert.deepEqual(
    [forAlice.counterpart_name, forAlice.i_am_seller, forAlice.unread, forAlice.last_message],
    ["Bob B.", true, true, "Kan jag hämta i morgon?"],
  );
  const [forBob] = (await inbox(u.bob)).filter((c) => c.id === u.bob.contactConversationId);
  assert.deepEqual(
    [forBob.counterpart_name, forBob.i_am_seller, forBob.unread],
    ["Alice L.", false, false],
  );
  assert.ok(!JSON.stringify(await inbox(u.bob)).includes("@"));
  assert.deepEqual(await inbox(u.mallory), []);
});

test("reading clears unread; a reply makes it unread for the other person", async () => {
  const unread = async (who) =>
    (await as(who, "SELECT public.unread_conversation_count() AS n"))[0].n;
  const before = await unread(u.alice);
  assert.ok(before >= 1);
  await as(u.mallory, "SELECT public.mark_conversation_read($1)", [u.bob.contactConversationId]);
  assert.equal(await unread(u.alice), before);
  await as(u.alice, "SELECT public.mark_conversation_read($1)", [u.bob.contactConversationId]);
  assert.equal(await unread(u.alice), before - 1);
  await as(
    u.alice,
    "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Ja, välkommen!')",
    [u.bob.contactConversationId, u.alice.id],
  );
  const [forBob] = (await inbox(u.bob)).filter((c) => c.id === u.bob.contactConversationId);
  assert.equal(forBob.unread, true);
});

test("nobody can change read or notification state directly", async () => {
  await rejects(
    u.alice,
    "UPDATE public.conversations SET owner_last_read_at = now(), owner_notified_at = now() WHERE id = $1",
    [u.bob.contactConversationId],
  );
});

test("email notifications: never from the browser, at most one per unread streak", async () => {
  await rejects(u.bob, "SELECT * FROM public.claim_message_notification($1, $2)", [
    u.bob.contactConversationId,
    u.bob.id,
  ]);
  await rejects(null, "SELECT * FROM public.claim_message_notification($1, $2)", [
    u.bob.contactConversationId,
    u.bob.id,
  ]);
  // Bob writes again; Alice has not read it yet -> one email to Alice, then nothing until she reads.
  await as(u.bob, startSql, [u.alice.contactListingId, "Hallå?"]);
  assert.deepEqual(await claim(u.bob.contactConversationId, u.bob.id), [
    { email: "alice@example.com", listing_title: "Cykel att hyra" },
  ]);
  assert.deepEqual(await claim(u.bob.contactConversationId, u.bob.id), []);
  await as(u.bob, startSql, [u.alice.contactListingId, "Hallå igen?"]);
  assert.deepEqual(await claim(u.bob.contactConversationId, u.bob.id), []);
  // Alice reads; nothing new from Bob -> no email. Bob writes -> email again.
  await as(u.alice, "SELECT public.mark_conversation_read($1)", [u.bob.contactConversationId]);
  assert.deepEqual(await claim(u.bob.contactConversationId, u.bob.id), []);
  await as(u.bob, startSql, [u.alice.contactListingId, "En sista fråga"]);
  assert.equal((await claim(u.bob.contactConversationId, u.bob.id)).length, 1);
  // Someone outside the conversation gets nothing.
  assert.deepEqual(await claim(u.bob.contactConversationId, u.mallory.id), []);
});

// --- Reports -------------------------------------------------------------------

const reportSql = `INSERT INTO public.reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4)`;

test("users can report, but not in someone else's name or with made-up types", async () => {
  await as(u.bob, reportSql, [
    u.bob.id,
    "listing",
    u.alice.listingId,
    "Rapporterad från annonssidan",
  ]);
  await rejects(u.bob, reportSql, [u.alice.id, "listing", u.alice.listingId, "Falsk"]);
  await rejects(u.bob, reportSql, [u.bob.id, "anything", u.alice.listingId, "Fel typ"]);
  await rejects(u.bob, reportSql, [u.bob.id, "listing", u.alice.listingId, ""]);
});

test("only the reporter and admins can read a report", async () => {
  assert.deepEqual(await as(u.alice, "SELECT id FROM public.reports"), []);
  assert.equal((await as(u.bob, "SELECT id FROM public.reports")).length, 1);
  assert.equal((await as(u.admin, "SELECT id FROM public.reports")).length, 1);
});

// --- Roles, favourites, saved searches -------------------------------------------

test("users cannot make themselves admin or look up who is admin", async () => {
  await rejects(u.mallory, "INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')", [
    u.mallory.id,
  ]);
  await rejects(u.mallory, "SELECT public.has_role($1, 'admin')", [u.admin.id]);
  await rejects(null, "SELECT private.is_admin()");
});

test("favourites and saved searches stay private", async () => {
  await as(u.bob, "INSERT INTO public.favorites (user_id, listing_id) VALUES ($1, $2)", [
    u.bob.id,
    u.alice.listingId,
  ]);
  await as(u.bob, "INSERT INTO public.saved_searches (user_id, label) VALUES ($1, 'Borrmaskin')", [
    u.bob.id,
  ]);
  assert.deepEqual(await as(u.alice, "SELECT id FROM public.favorites"), []);
  assert.deepEqual(await as(u.alice, "SELECT id FROM public.saved_searches"), []);
  await rejects(u.bob, "INSERT INTO public.favorites (user_id, listing_id) VALUES ($1, $2)", [
    u.alice.id,
    u.alice.listingId,
  ]);
});

// --- Logged-out browsing ----------------------------------------------------------

test("logged-out visitors can still browse listings, categories and booked dates", async () => {
  const [{ n }] = await as(null, "SELECT count(*)::int AS n FROM public.listings");
  assert.ok(n >= 24);
  assert.ok((await as(null, "SELECT slug FROM public.categories")).length >= 8);
  // The trailer: Rut's booking and the blocked days.
  assert.equal(
    (await as(null, "SELECT * FROM public.booked_dates($1)", [u.olle.trailerId])).length,
    2,
  );
  assert.deepEqual(
    await as(null, "SELECT id FROM public.listings WHERE status <> 'published'"),
    [],
  );
});

test("logged-out visitors cannot write anything", async () => {
  await rejects(null, reportSql, [null, "listing", u.alice.listingId, "Anonym"]);
  await rejects(null, "INSERT INTO public.favorites (user_id, listing_id) VALUES ($1, $2)", [
    u.bob.id,
    u.alice.listingId,
  ]);
  await rejects(null, "UPDATE public.listings SET title = 'x'");
  await rejects(null, "DELETE FROM public.categories");
});

// --- Photos ---------------------------------------------------------------------

const photo = (who, ext = "webp") => `${who.id}/${crypto.randomUUID()}.${ext}`;
const upload = (who, path) =>
  as(
    who,
    "INSERT INTO storage.objects (bucket_id, name) VALUES ('listing-images', $1) RETURNING name",
    [path],
  );

test("photos go in a public bucket that only takes WebP and JPEG", async () => {
  const [b] = await platform(
    "SELECT public, file_size_limit::int AS max, allowed_mime_types FROM storage.buckets WHERE id = 'listing-images'",
  );
  assert.deepEqual(b, {
    public: true,
    max: 2097152,
    allowed_mime_types: ["image/webp", "image/jpeg"],
  });
});

test("users upload and delete photos only in their own folder", async () => {
  const mine = photo(u.bob);
  await upload(u.bob, mine);
  await assert.rejects(upload(u.bob, photo(u.alice)));
  await assert.rejects(upload(null, photo(u.bob)));
  assert.deepEqual(
    await as(u.alice, "DELETE FROM storage.objects WHERE name = $1 RETURNING name", [mine]),
    [],
  );
  assert.equal(
    (await as(u.bob, "DELETE FROM storage.objects WHERE name = $1 RETURNING name", [mine])).length,
    1,
  );
});

test("listings only use the owner's own uploaded photos, at most 8", async () => {
  const own = [photo(u.alice), photo(u.alice, "jpg")];
  const [l] = await as(
    u.alice,
    `INSERT INTO public.listings (owner_id, title, category_slug, city, price_day, images)
     VALUES ($1, 'Med bilder', 'verktyg', 'Solna', 100, $2) RETURNING id`,
    [u.alice.id, own],
  );
  const insertWith = (images) =>
    as(
      u.alice,
      `INSERT INTO public.listings (owner_id, title, category_slug, city, price_day, images)
       VALUES ($1, 'Fel bilder', 'verktyg', 'Solna', 100, $2)`,
      [u.alice.id, images],
    );
  await assert.rejects(insertWith([photo(u.bob)]));
  await assert.rejects(insertWith(["https://evil.example/stolen.jpg"]));
  await assert.rejects(insertWith([`${u.alice.id}/../${u.bob.id}/x.jpg`]));
  await assert.rejects(insertWith([photo(u.alice, "png")]));
  await assert.rejects(insertWith(Array.from({ length: 9 }, () => photo(u.alice))));
  // Older listings keep their full image URLs when edited, but new URLs are not allowed.
  await platform(
    "UPDATE public.listings SET images = ARRAY['https://images.example/old.jpg'] WHERE id = $1",
    [l.id],
  );
  await as(
    u.alice,
    "UPDATE public.listings SET title = 'Ny titel', images = images || $2::text[] WHERE id = $1",
    [l.id, [photo(u.alice)]],
  );
  await rejects(
    u.alice,
    "UPDATE public.listings SET images = images || ARRAY['https://evil.example/x.jpg'] WHERE id = $1",
    [l.id],
  );
});

// --- Deleting your account ------------------------------------------------------

test("users can delete their own account, which removes their data but nobody else's", async () => {
  await createUser("dave", "Dave Dahl");
  const listingId = await createListing(u.dave, "Daves borrmaskin");
  await as(u.dave, "INSERT INTO public.favorites (user_id, listing_id) VALUES ($1, $2)", [
    u.dave.id,
    u.alice.listingId,
  ]);
  const [{ id: conversationId }] = await as(
    u.dave,
    "SELECT public.start_conversation($1, 'Hej Alice') AS id",
    [u.alice.listingId],
  );
  await as(u.dave, reportSql, [u.dave.id, "listing", u.alice.listingId, "Testrapport"]);
  const aliceListingsBefore = await platform(
    "SELECT count(*)::int AS n FROM public.listings WHERE owner_id = $1",
    [u.alice.id],
  );

  await rejects(null, "SELECT public.delete_my_account()");
  await as(u.dave, "SELECT public.delete_my_account()");

  const left = await platform(
    `SELECT (SELECT count(*)::int FROM auth.users WHERE id = $1) AS users,
            (SELECT count(*)::int FROM public.profiles WHERE id = $1) AS profiles,
            (SELECT count(*)::int FROM public.listings WHERE id = $2) AS listings,
            (SELECT count(*)::int FROM public.favorites WHERE user_id = $1) AS favorites,
            (SELECT count(*)::int FROM public.conversations WHERE id = $3) AS conversations,
            (SELECT count(*)::int FROM public.reports WHERE reason = 'Testrapport' AND reporter_id IS NULL) AS anonymous_reports`,
    [u.dave.id, listingId, conversationId],
  );
  assert.deepEqual(left, [
    { users: 0, profiles: 0, listings: 0, favorites: 0, conversations: 0, anonymous_reports: 1 },
  ]);
  assert.deepEqual(
    await platform("SELECT count(*)::int AS n FROM public.listings WHERE owner_id = $1", [
      u.alice.id,
    ]),
    aliceListingsBefore,
  );
});

// --- Moderation -------------------------------------------------------------------

const reportAs = (who, type, target, reason = "Bedrägeri") =>
  as(
    who,
    "INSERT INTO public.reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4) RETURNING id",
    [who.id, type, target, reason],
  );

test("one open report per person and target; conversations only by their participants", async () => {
  await assert.rejects(reportAs(u.bob, "listing", u.alice.listingId));
  await assert.rejects(reportAs(u.mallory, "conversation", u.bob.contactConversationId));
  const [r] = await reportAs(
    u.bob,
    "conversation",
    u.bob.contactConversationId,
    "Ber om förskottsbetalning",
  );
  u.bob.conversationReportId = r.id;
});

test("only admins see reports, all listings and reported conversations", async () => {
  for (const sql of [
    "SELECT * FROM public.admin_reports()",
    "SELECT * FROM public.admin_listings()",
    "SELECT * FROM public.admin_blocked_users()",
  ]) {
    assert.deepEqual(await as(u.bob, sql), []);
  }
  assert.deepEqual(await as(u.bob, "SELECT public.admin_open_report_count() AS n"), [{ n: 0 }]);
  assert.deepEqual(
    await as(u.bob, "SELECT * FROM public.admin_reported_conversation($1)", [
      u.bob.contactConversationId,
    ]),
    [],
  );
  await rejects(null, "SELECT * FROM public.admin_reports()");

  const open = await as(u.admin, "SELECT * FROM public.admin_reports()");
  const conv = open.find((r) => r.id === u.bob.conversationReportId);
  assert.deepEqual([conv.reported_user_name, conv.reporter_name], ["Alice L.", "Bob B."]);
  const listing = open.find(
    (r) => r.target_type === "listing" && r.target_id === u.alice.listingId,
  );
  assert.equal(listing.listing_title, "Borrmaskin Bosch");
  assert.ok((await as(u.admin, "SELECT public.admin_open_report_count() AS n"))[0].n >= 2);

  const msgs = await as(u.admin, "SELECT * FROM public.admin_reported_conversation($1)", [
    u.bob.contactConversationId,
  ]);
  assert.ok(msgs.length > 0);
  const [{ id: unreported }] = await as(
    u.mallory,
    "SELECT public.start_conversation($1, 'Hej') AS id",
    [u.alice.contactListingId],
  );
  u.mallory.conversationId = unreported;
  assert.deepEqual(
    await as(u.admin, "SELECT * FROM public.admin_reported_conversation($1)", [unreported]),
    [],
  );
});

test("ordinary users can't moderate", async () => {
  await rejects(u.bob, "SELECT public.admin_set_listing_hidden($1, true, 'x')", [
    u.alice.listingId,
  ]);
  await rejects(u.bob, "SELECT public.admin_dismiss_report($1)", [u.bob.conversationReportId]);
  await rejects(u.bob, "SELECT public.admin_set_user_blocked($1, true)", [u.alice.id]);
});

test("admins hide a listing with a reason the owner sees; it leaves search and its reports close", async () => {
  await rejects(u.admin, "SELECT public.admin_set_listing_hidden($1, true, '  ')", [
    u.alice.listingId,
  ]);
  await as(u.admin, "SELECT public.admin_set_listing_hidden($1, true, 'Förbjuden vara')", [
    u.alice.listingId,
  ]);
  assert.deepEqual(
    await as(null, "SELECT id FROM public.listings WHERE id = $1", [u.alice.listingId]),
    [],
  );
  const [own] = await as(
    u.alice,
    "SELECT status, moderation_reason FROM public.listings WHERE id = $1",
    [u.alice.listingId],
  );
  assert.deepEqual(own, { status: "removed", moderation_reason: "Förbjuden vara" });
  await rejects(u.alice, "UPDATE public.listings SET status = 'published' WHERE id = $1", [
    u.alice.listingId,
  ]);
  await as(
    u.alice,
    "UPDATE public.listings SET moderation_reason = NULL, title = title WHERE id = $1 AND status = 'removed'",
    [u.alice.listingId],
  ).catch(() => {});
  const [still] = await platform("SELECT moderation_reason FROM public.listings WHERE id = $1", [
    u.alice.listingId,
  ]);
  assert.equal(still.moderation_reason, "Förbjuden vara");
  const open = await as(u.admin, "SELECT target_id FROM public.admin_reports()");
  assert.ok(!open.some((r) => r.target_id === u.alice.listingId));

  await as(u.admin, "SELECT public.admin_set_listing_hidden($1, false)", [u.alice.listingId]);
  const [back] = await platform(
    "SELECT status, moderation_reason FROM public.listings WHERE id = $1",
    [u.alice.listingId],
  );
  assert.deepEqual(back, { status: "published", moderation_reason: null });
});

test("admins dismiss reports", async () => {
  await as(u.admin, "SELECT public.admin_dismiss_report($1)", [u.bob.conversationReportId]);
  assert.ok(
    !(await as(u.admin, "SELECT id FROM public.admin_reports(true)")).some(
      (r) => r.id === u.bob.conversationReportId,
    ),
  );
  const done = (await as(u.admin, "SELECT id, resolution FROM public.admin_reports(false)")).find(
    (r) => r.id === u.bob.conversationReportId,
  );
  assert.equal(done.resolution, "Ingen åtgärd");
});

test("blocked users can't publish, edit or send messages, and their listings are hidden", async () => {
  const listingId = await createListing(u.mallory, "Mallorys släp");
  await rejects(u.admin, "SELECT public.admin_set_user_blocked($1, true)", [u.admin.id]);
  await as(u.admin, "SELECT public.admin_set_user_blocked($1, true)", [u.mallory.id]);

  await assert.rejects(createListing(u.mallory, "Ny annons"));
  await rejects(u.mallory, "UPDATE public.listings SET title = 'x' WHERE id = $1", [listingId]);
  await rejects(
    u.mallory,
    "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Hej')",
    [u.mallory.conversationId, u.mallory.id],
  );
  await rejects(u.mallory, "SELECT public.start_conversation($1, 'Hej igen')", [
    u.alice.contactListingId,
  ]);
  const [hidden] = await platform(
    "SELECT status, moderation_reason FROM public.listings WHERE id = $1",
    [listingId],
  );
  assert.deepEqual(hidden, { status: "removed", moderation_reason: "Kontot är spärrat" });

  await as(u.mallory, "UPDATE public.profiles SET blocked_at = NULL WHERE id = $1", [u.mallory.id]);
  assert.equal((await as(u.admin, "SELECT id FROM public.admin_blocked_users()")).length, 1);

  await as(u.admin, "SELECT public.admin_set_user_blocked($1, false)", [u.mallory.id]);
  assert.deepEqual(await as(u.admin, "SELECT id FROM public.admin_blocked_users()"), []);
  await createListing(u.mallory, "Tillbaka igen");
});

test("the admin gets at most one email per reported target, never via the browser", async () => {
  const listingId = await createListing(u.alice, "Misstänkt annons");
  const [first] = await reportAs(u.bob, "listing", listingId, "Spam");
  const [second] = await reportAs(u.mallory, "listing", listingId, "Spam");
  const claimReport = (id, reporter) =>
    asService("SELECT * FROM public.claim_report_notification($1, $2)", [id, reporter]);

  await rejects(u.bob, "SELECT * FROM public.claim_report_notification($1, $2)", [
    first.id,
    u.bob.id,
  ]);
  assert.deepEqual(await claimReport(first.id, u.mallory.id), []);
  const [mail] = await claimReport(first.id, u.bob.id);
  assert.deepEqual([mail.reason, mail.target_type], ["Spam", "listing"]);
  assert.deepEqual(await claimReport(first.id, u.bob.id), []);
  assert.deepEqual(await claimReport(second.id, u.mallory.id), []);
});

// --- Spam limits ----------------------------------------------------------------------

const listingFor = (who, title = "Annons", extra = {}) =>
  as(
    who,
    `INSERT INTO public.listings (owner_id, title, category_slug, city, price_day, description, area, status)
     VALUES ($1, $2, 'verktyg', 'Solna', $3, $4, $5, 'draft') RETURNING id`,
    [who.id, title, extra.priceDay ?? 100, extra.description ?? "", extra.area ?? null],
  );

test("listings have text and price limits", async () => {
  await createUser("tina", "Tina Text");
  await assert.rejects(listingFor(u.tina, "Hi"));
  await assert.rejects(listingFor(u.tina, "x".repeat(101)));
  await assert.rejects(listingFor(u.tina, "Lång beskrivning", { description: "x".repeat(5001) }));
  await assert.rejects(listingFor(u.tina, "Långt område", { area: "x".repeat(61) }));
  await assert.rejects(listingFor(u.tina, "För dyr", { priceDay: 2000000 }));
  await listingFor(u.tina, "Helt okej annons", { description: "x".repeat(5000) });
  await rejects(u.tina, "UPDATE public.profiles SET full_name = $2 WHERE id = $1", [
    u.tina.id,
    "x".repeat(81),
  ]);
});

test("at most 20 new listings a day and 50 active listings per user", async () => {
  await createUser("frank", "Frank Flod");
  for (let i = 1; i <= 20; i++) await listingFor(u.frank, `Annons nummer ${i}`);
  await assert.rejects(listingFor(u.frank, "Annons nummer 21"));

  await createUser("gina", "Gina Gran");
  await platform(
    `INSERT INTO public.listings (owner_id, title, category_slug, city, price_day, status, created_at)
     SELECT $1, 'Gammal annons ' || n, 'verktyg', 'Solna', 100, 'published', now() - interval '3 days'
       FROM generate_series(1, 50) n`,
    [u.gina.id],
  );
  await assert.rejects(listingFor(u.gina, "En till"));
  await platform(
    "UPDATE public.listings SET status = 'removed' WHERE owner_id = $1 AND title = 'Gammal annons 1'",
    [u.gina.id],
  );
  await listingFor(u.gina, "Nu går det");
});

test("at most 10 new conversations an hour", async () => {
  await createUser("hans", "Hans Hav");
  const ids = (
    await platform(
      `INSERT INTO public.listings (owner_id, title, category_slug, city, price_day, status)
       SELECT $1, 'Att kontakta ' || n, 'verktyg', 'Solna', 100, 'published' FROM generate_series(1, 11) n
       RETURNING id`,
      [u.alice.id],
    )
  ).map((r) => r.id);
  for (const id of ids.slice(0, 10))
    await as(u.hans, "SELECT public.start_conversation($1, 'Hej!')", [id]);
  await rejects(u.hans, "SELECT public.start_conversation($1, 'Hej!')", [ids[10]]);
  u.hans.listingIds = ids;
});

test("at most 30 messages per 10 minutes", async () => {
  await createUser("ivy", "Ivy Ilska");
  const [{ id: conversationId }] = await as(
    u.ivy,
    "SELECT public.start_conversation($1, 'Första') AS id",
    [u.hans.listingIds[10]],
  );
  const send = () =>
    as(
      u.ivy,
      "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Spam')",
      [conversationId, u.ivy.id],
    );
  for (let i = 2; i <= 30; i++) await send();
  await assert.rejects(send());
});

test("at most 20 reports a day", async () => {
  await createUser("jon", "Jon Jakt");
  const targets = (
    await platform("SELECT id FROM public.listings WHERE status = 'published' LIMIT 21")
  ).map((r) => r.id);
  for (const id of targets.slice(0, 20)) await reportAs(u.jon, "listing", id, "Spam");
  await assert.rejects(reportAs(u.jon, "listing", targets[20], "Spam"));
});

// --- Trust: reviews, profiles, rental agreement, blocking, phone, trust score -------------

const review = (who, bookingId, rating, body = "") =>
  as(who, "SELECT public.leave_review($1, $2, $3)", [bookingId, rating, body]);

const publicReviews = (id) =>
  as(null, "SELECT rating, body, author_name, subject_role FROM public.public_reviews($1)", [id]);

const profileOf = async (id) =>
  (await as(null, "SELECT * FROM public.public_profile($1)", [id]))[0];

/** Moves a booking's dates back so it looks like it ran over the last few days. */
const backdate = (bookingId) =>
  platform(
    `UPDATE public.bookings SET start_date = private.today() - 3, end_date = private.today() - 1
      WHERE id = $1`,
    [bookingId],
  );

/** A rental that has been picked up and returned. */
async function finishedRental(owner, renter, title) {
  const listing = await createListing(owner, title);
  const r = await requestBooking(renter, listing, day(1), day(2));
  await respond(owner, r.booking_id, "accept");
  await respond(renter, r.booking_id, "picked_up");
  await respond(owner, r.booking_id, "returned");
  await backdate(r.booking_id);
  return r.booking_id;
}

test("reviews: only after a finished rental, one each, hidden until both have written", async () => {
  await createUser("tor", "Tor Tall");
  await createUser("una", "Una Ulf");
  await createUser("vic", "Vic Vik");
  const listing = await createListing(u.tor, "Borrhammare");
  const r = await requestBooking(u.una, listing, day(1), day(2));
  await assert.rejects(review(u.una, r.booking_id, 5), /avslutad/);
  await respond(u.tor, r.booking_id, "accept");
  await respond(u.una, r.booking_id, "picked_up");
  await respond(u.tor, r.booking_id, "returned");
  // Returned before the first booked day: the rental didn't really happen.
  await assert.rejects(review(u.una, r.booking_id, 5), /avslutad/);
  await backdate(r.booking_id);

  await assert.rejects(review(u.vic, r.booking_id, 1), /finns inte/);
  await assert.rejects(review(u.una, r.booking_id, 6), /1–5/);
  await review(u.una, r.booking_id, 5, "Smidig upphämtning!");
  await assert.rejects(review(u.una, r.booking_id, 4), /redan/);
  // Hidden from everyone but its author until Tor has written his.
  assert.deepEqual(await publicReviews(u.tor.id), []);
  const own = "SELECT id FROM public.reviews WHERE booking_id = $1";
  assert.equal((await as(u.una, own, [r.booking_id])).length, 1);
  assert.equal((await as(u.tor, own, [r.booking_id])).length, 0);

  await review(u.tor, r.booking_id, 4, "Lämnade tillbaka i tid.");
  assert.deepEqual(await publicReviews(u.tor.id), [
    { rating: 5, body: "Smidig upphämtning!", author_name: "Una U.", subject_role: "owner" },
  ]);
  assert.deepEqual(
    (await publicReviews(u.una.id)).map((x) => [x.rating, x.author_name, x.subject_role]),
    [[4, "Tor T.", "renter"]],
  );
});

test("a single review is shown 14 days after the return; then no more reviews", async () => {
  const bookingId = await finishedRental(u.tor, u.vic, "Tältkök");
  await review(u.vic, bookingId, 2, "Saknade delar");
  assert.equal((await publicReviews(u.tor.id)).length, 1);
  // Two weeks later:
  await platform(
    `UPDATE public.bookings SET start_date = private.today() - 20, end_date = private.today() - 17,
            returned_at = now() - interval '15 days' WHERE id = $1`,
    [bookingId],
  );
  await platform("UPDATE public.reviews SET published_at = now() - interval '1 day' WHERE booking_id = $1", [
    bookingId,
  ]);
  assert.equal((await publicReviews(u.tor.id)).length, 2);
  await assert.rejects(review(u.tor, bookingId, 3), /gått ut/);
});

test("public profiles show public facts only; admins can delete reviews", async () => {
  await as(u.tor, "UPDATE public.profiles SET bio = $2 WHERE id = $1", [u.tor.id, "Hyr ut verktyg i Solna."]);
  await rejects(u.tor, "UPDATE public.profiles SET bio = repeat('x', 501) WHERE id = $1", [u.tor.id]);
  const p = await profileOf(u.tor.id);
  assert.deepEqual(
    [p.name, p.bio, p.rentals_as_owner, Number(p.rating), p.review_count, p.phone_verified],
    ["Tor T.", "Hyr ut verktyg i Solna.", 2, 3.5, 2, false],
  );
  for (const key of ["full_name", "phone", "email", "blocked_at"]) assert.ok(!(key in p), key);

  const [{ id }] = await platform(
    "SELECT r.id FROM public.reviews r WHERE r.subject_id = $1 AND r.rating = 2",
    [u.tor.id],
  );
  await rejects(u.una, "SELECT public.admin_delete_review($1)", [id]);
  await as(u.admin, "SELECT public.admin_delete_review($1)", [id]);
  assert.equal((await profileOf(u.tor.id)).review_count, 1);

  await createUser("wes", "Wes West");
  await platform("UPDATE public.profiles SET blocked_at = now() WHERE id = $1", [u.wes.id]);
  assert.equal(await profileOf(u.wes.id), undefined);
  await platform("UPDATE public.profiles SET blocked_at = NULL WHERE id = $1", [u.wes.id]);
});

test("the rental agreement: only the two parties, full names, terms kept when accepted", async () => {
  const listing = await createListing(u.tor, "Släpkärra med kåpa");
  await as(u.tor, "UPDATE public.listings SET rental_rules = 'Rengjord' WHERE id = $1", [listing]);
  const r = await requestBooking(u.una, listing, day(3), day(4));
  const agreement = async (who) =>
    (await as(who, "SELECT public.booking_agreement($1) AS a", [r.booking_id]))[0].a;
  await assert.rejects(agreement(u.una), /godkänt bokningen/);
  await respond(u.tor, r.booking_id, "accept");

  const a = await agreement(u.una);
  assert.deepEqual([a.owner_name, a.renter_name, a.terms.rental_rules], ["Tor Tall", "Una Ulf", "Rengjord"]);
  await assert.rejects(agreement(u.vic), /finns inte/);
  await rejects(null, "SELECT public.booking_agreement($1)", [r.booking_id]);

  await as(u.una, "SELECT public.accept_agreement($1)", [r.booking_id]);
  await assert.rejects(as(u.una, "SELECT public.accept_agreement($1)", [r.booking_id]), /redan/);
  await assert.rejects(as(u.vic, "SELECT public.accept_agreement($1)", [r.booking_id]), /finns inte/);
  // Changing the listing afterwards doesn't change the agreement.
  await as(u.tor, "UPDATE public.listings SET rental_rules = 'Ändrat' WHERE id = $1", [listing]);
  await as(u.tor, "SELECT public.accept_agreement($1)", [r.booking_id]);
  const b = await agreement(u.tor);
  assert.equal(b.terms.rental_rules, "Rengjord");
  assert.ok(b.owner_agreed_at && b.renter_agreed_at);
  await rejects(u.una, "UPDATE public.bookings SET renter_agreed_at = NULL WHERE id = $1", [r.booking_id]);
});

test("blocking stops messages and requests both ways; only the blocker sees it", async () => {
  const listing = await createListing(u.tor, "Kanot");
  const open = await requestBooking(u.vic, listing, day(5), day(6));
  const blockSql = "INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ($1, $2)";
  await as(u.tor, blockSql, [u.tor.id, u.vic.id]);
  assert.equal((await bookingRow(open.booking_id)).status, "declined");

  const send = (who) =>
    as(who, "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Hej')", [
      open.conversation_id,
      who.id,
    ]);
  await assert.rejects(send(u.vic), /kan inte skicka/);
  await assert.rejects(send(u.tor), /kan inte skicka/);
  await assert.rejects(as(u.vic, "SELECT public.start_conversation($1, 'Hej igen')", [listing]), /kan inte skicka/);
  await assert.rejects(requestBooking(u.vic, listing, day(8), day(9)), /kan inte boka/);

  assert.deepEqual(await as(u.vic, "SELECT * FROM public.user_blocks"), []);
  assert.deepEqual(
    (await as(u.tor, "SELECT name FROM public.my_blocked_users()")).map((r) => r.name),
    ["Vic V."],
  );
  await rejects(u.vic, blockSql, [u.tor.id, u.una.id]);
  await rejects(u.vic, blockSql, [u.vic.id, u.vic.id]);
  await rejects(null, "SELECT * FROM public.user_blocks");

  await as(u.tor, "DELETE FROM public.user_blocks WHERE blocked_id = $1", [u.vic.id]);
  await send(u.vic);
});

test("phone numbers are verified by Supabase Auth, never by the user", async () => {
  await as(u.una, "UPDATE public.profiles SET phone_verified = true WHERE id = $1", [u.una.id]);
  assert.equal((await profileOf(u.una.id)).phone_verified, false);
  await platform("UPDATE auth.users SET phone = '46701234567', phone_confirmed_at = now() WHERE id = $1", [
    u.una.id,
  ]);
  assert.equal((await profileOf(u.una.id)).phone_verified, true);
  await platform("UPDATE auth.users SET phone = '46709999999', phone_confirmed_at = NULL WHERE id = $1", [
    u.una.id,
  ]);
  assert.equal((await profileOf(u.una.id)).phone_verified, false);
});

test("only admins see trust scores, and reports lower them", async () => {
  assert.deepEqual(await as(u.tor, "SELECT * FROM public.admin_trust_scores()"), []);
  await rejects(null, "SELECT * FROM public.admin_trust_scores()");
  const scoreOf = async (who) =>
    (await as(u.admin, "SELECT score FROM public.admin_trust_scores() WHERE user_id = $1", [who.id]))[0].score;
  const before = await scoreOf(u.vic);
  await as(
    u.una,
    "INSERT INTO public.reports (reporter_id, target_type, target_id, reason) VALUES ($1, 'user', $2, 'Bedrägeri')",
    [u.una.id, u.vic.id],
  );
  assert.equal(await scoreOf(u.vic), before - 5);
});

test("reviews can't be changed or deleted, and need a rental that happened", async () => {
  const [mine] = await platform("SELECT id FROM public.reviews WHERE author_id = $1 LIMIT 1", [u.una.id]);
  await rejects(u.una, "UPDATE public.reviews SET rating = 1 WHERE id = $1", [mine.id]);
  await rejects(u.una, "DELETE FROM public.reviews WHERE id = $1", [mine.id]);
  const listing = await createListing(u.tor, "Snöslunga");
  const r = await requestBooking(u.una, listing, day(1), day(2));
  await respond(u.tor, r.booking_id, "accept");
  await respond(u.una, r.booking_id, "cancel");
  await assert.rejects(review(u.una, r.booking_id, 1), /avslutad/);
});

test("if the item is never marked returned, both can still review three days after the end", async () => {
  const listing = await createListing(u.tor, "Motorsåg");
  const r = await requestBooking(u.una, listing, day(1), day(2));
  await respond(u.tor, r.booking_id, "accept");
  await respond(u.una, r.booking_id, "picked_up");
  await assert.rejects(review(u.una, r.booking_id, 1), /avslutad/);
  await platform(
    "UPDATE public.bookings SET start_date = private.today() - 8, end_date = private.today() - 5 WHERE id = $1",
    [r.booking_id],
  );
  await review(u.una, r.booking_id, 1, "Uthyraren svarade aldrig om återlämningen.");
});

test("listings with bookings can't be deleted, and reviews outlive their listing", async () => {
  const bookingId = await finishedRental(u.tor, u.una, "Vattenpump");
  const [{ listing_id: listing }] = await platform("SELECT listing_id FROM public.bookings WHERE id = $1", [
    bookingId,
  ]);
  await review(u.una, bookingId, 5);
  await assert.rejects(as(u.tor, "DELETE FROM public.listings WHERE id = $1", [listing]), /Pausa den/);
  // When the whole account goes (here: the platform), the reviews stay.
  await platform("DELETE FROM public.listings WHERE id = $1", [listing]);
  const [{ n }] = await platform("SELECT count(*)::int AS n FROM public.reviews WHERE booking_id IS NULL OR booking_id = $1", [bookingId]);
  assert.ok(n >= 1);
  assert.ok((await profileOf(u.tor.id)).review_count >= 1);
});

test("a block doesn't stop messages during an ongoing rental; renters' own requests are withdrawn", async () => {
  const listing = await createListing(u.tor, "Tältpaket");
  const r = await requestBooking(u.vic, listing, day(1), day(2));
  await respond(u.tor, r.booking_id, "accept");
  const other = await createListing(u.tor, "Sovsäck");
  const open = await requestBooking(u.vic, other, day(5), day(6));
  await as(u.vic, "INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ($1, $2)", [u.vic.id, u.tor.id]);
  assert.equal((await bookingRow(open.booking_id)).status, "cancelled");
  // The accepted rental goes on: both can still write, and booking steps still work.
  await as(u.tor, "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Hämtar du i morgon?')", [
    r.conversation_id,
    u.tor.id,
  ]);
  await respond(u.vic, r.booking_id, "picked_up");
  // Tor can't remove Vic's block.
  await as(u.tor, "DELETE FROM public.user_blocks WHERE blocker_id = $1", [u.vic.id]);
  assert.equal((await platform("SELECT 1 FROM public.user_blocks WHERE blocker_id = $1", [u.vic.id])).length, 1);
  await respond(u.tor, r.booking_id, "returned");
  // Rental over: now the block holds.
  await assert.rejects(
    as(u.tor, "INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ($1, $2, 'Hej')", [
      r.conversation_id,
      u.tor.id,
    ]),
    /kan inte skicka/,
  );
  await platform("DELETE FROM public.user_blocks WHERE blocker_id = $1", [u.vic.id]);
});

test("the agreement keeps the terms from when the owner accepted", async () => {
  const listing = await createListing(u.tor, "Projektor");
  await as(u.tor, "UPDATE public.listings SET rental_rules = 'Före' WHERE id = $1", [listing]);
  const r = await requestBooking(u.una, listing, day(3), day(4));
  await respond(u.tor, r.booking_id, "accept");
  await as(u.tor, "UPDATE public.listings SET rental_rules = 'Efter' WHERE id = $1", [listing]);
  const [{ a }] = await as(u.una, "SELECT public.booking_agreement($1) AS a", [r.booking_id]);
  assert.deepEqual([a.terms.rental_rules, a.terms.terms_version], ["Före", 1]);
});

test("only Supabase Auth sets the phone number on a profile", async () => {
  await as(u.una, "UPDATE public.profiles SET phone = '0700000000' WHERE id = $1", [u.una.id]);
  const [p] = await platform("SELECT phone FROM public.profiles WHERE id = $1", [u.una.id]);
  assert.equal(p.phone, "46709999999");
});

test("response time needs three conversations; reports in conversations count against the other person", async () => {
  assert.equal((await profileOf(u.wes.id)).response_hours, null);
  const [conv] = await platform(
    "SELECT id FROM public.conversations WHERE renter_id = $1 AND owner_id = $2 LIMIT 1",
    [u.una.id, u.tor.id],
  );
  const scoreOf = async (who) =>
    (await as(u.admin, "SELECT score FROM public.admin_trust_scores() WHERE user_id = $1", [who.id]))[0].score;
  const tor = await scoreOf(u.tor);
  const una = await scoreOf(u.una);
  await as(
    u.una,
    "INSERT INTO public.reports (reporter_id, target_type, target_id, reason) VALUES ($1, 'conversation', $2, 'Hot')",
    [u.una.id, conv.id],
  );
  assert.deepEqual([await scoreOf(u.tor), await scoreOf(u.una)], [tor - 5, una]);
});
