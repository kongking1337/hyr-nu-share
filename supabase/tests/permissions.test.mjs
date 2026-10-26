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

const bookingSql = `
  INSERT INTO public.bookings (listing_id, renter_id, owner_id, start_date, end_date, days, total_price, status)
  VALUES ($1, $2, NULL, $3, $4, 99, 1000, 'confirmed')
  RETURNING id, owner_id, status::text, days`;

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

test("users cannot write reviews; everyone can still read them", async () => {
  await rejects(
    u.bob,
    "INSERT INTO public.reviews (listing_id, author_id, rating, body) VALUES ($1, $2, 5, 'Fake')",
    [u.alice.listingId, u.bob.id],
  );
  const [{ n }] = await as(null, "SELECT count(*)::int AS n FROM public.reviews");
  assert.ok(n > 0);
});

// --- Bookings ------------------------------------------------------------------

test("bookings get the right owner, status and length, whatever the browser sends", async () => {
  const [b] = await as(u.bob, bookingSql, [
    u.alice.listingId,
    u.bob.id,
    "2026-11-01",
    "2026-11-03",
  ]);
  assert.deepEqual([b.owner_id, b.status, b.days], [u.alice.id, "requested", 3]);
  u.bob.bookingId = b.id;
});

test("owners see bookings of their listings and can confirm them", async () => {
  const rows = await as(u.alice, "SELECT id FROM public.bookings WHERE id = $1", [u.bob.bookingId]);
  assert.equal(rows.length, 1);
  await as(u.alice, "UPDATE public.bookings SET status = 'confirmed' WHERE id = $1", [
    u.bob.bookingId,
  ]);
});

test("renters cannot confirm their own booking or change the price; they can cancel", async () => {
  const [b] = await as(u.bob, bookingSql, [
    u.alice.listingId,
    u.bob.id,
    "2026-12-01",
    "2026-12-02",
  ]);
  await rejects(u.bob, "UPDATE public.bookings SET status = 'confirmed' WHERE id = $1", [b.id]);
  await as(u.bob, "UPDATE public.bookings SET total_price = 1 WHERE id = $1", [b.id]);
  const [after] = await platform(
    "SELECT total_price::float AS total FROM public.bookings WHERE id = $1",
    [b.id],
  );
  assert.equal(after.total, 1000);
  await as(u.bob, "UPDATE public.bookings SET status = 'cancelled' WHERE id = $1", [b.id]);
});

test("you cannot book your own listing or a demo listing", async () => {
  await rejects(u.alice, bookingSql, [u.alice.listingId, u.alice.id, "2027-01-01", "2027-01-02"]);
  const [demo] = await platform("SELECT id FROM public.listings WHERE owner_id IS NULL LIMIT 1");
  await rejects(u.bob, bookingSql, [demo.id, u.bob.id, "2027-01-01", "2027-01-02"]);
});

test("instant bookings cannot double-book confirmed dates", async () => {
  const id = await createListing(u.alice, "Släpvagn", { instantBook: true });
  u.alice.instantListingId = id;
  const [b] = await as(u.bob, bookingSql, [id, u.bob.id, "2027-02-01", "2027-02-03"]);
  assert.equal(b.status, "confirmed");
  await rejects(u.mallory, bookingSql, [id, u.mallory.id, "2027-02-03", "2027-02-05"]);
});

test("other users and logged-out visitors cannot see or change a booking", async () => {
  assert.deepEqual(
    await as(u.mallory, "SELECT id FROM public.bookings WHERE id = $1", [u.bob.bookingId]),
    [],
  );
  assert.deepEqual(
    await as(
      u.mallory,
      "UPDATE public.bookings SET status = 'cancelled' WHERE id = $1 RETURNING id",
      [u.bob.bookingId],
    ),
    [],
  );
  await rejects(null, "SELECT id FROM public.bookings");
});

// --- Offers --------------------------------------------------------------------

const placeOffer = (who, listingId, start, end, amount) =>
  as(who, "SELECT public.place_offer($1, $2, $3, 1, 1000, $4) AS r", [
    listingId,
    start,
    end,
    amount,
  ]).then((rows) => rows[0].r);

test("offers can only be created and changed through place_offer/respond_offer", async () => {
  await as(u.alice, "UPDATE public.listings SET allow_offers = true WHERE id = $1", [
    u.alice.listingId,
  ]);
  await rejects(
    u.bob,
    `INSERT INTO public.offers (listing_id, renter_id, owner_id, start_date, end_date, amount, status)
     VALUES ($1, $2, $3, '2027-03-01', '2027-03-02', 1, 'accepted')`,
    [u.alice.listingId, u.bob.id, u.alice.id],
  );
  const offer = await placeOffer(u.bob, u.alice.listingId, "2027-03-01", "2027-03-02", 300);
  assert.equal(offer.status, "active");
  await rejects(u.bob, "UPDATE public.offers SET status = 'accepted', amount = 1 WHERE id = $1", [
    offer.offer_id,
  ]);
  u.bob.offerId = offer.offer_id;
});

test("owners can accept an offer, which creates a confirmed booking", async () => {
  const [{ r }] = await as(u.alice, "SELECT public.respond_offer($1, 'accept') AS r", [
    u.bob.offerId,
  ]);
  assert.equal(r.status, "accepted");
  const [b] = await platform("SELECT status::text FROM public.bookings WHERE id = $1", [
    r.booking_id,
  ]);
  assert.equal(b.status, "confirmed");
});

test("auto-accepted offers never double-book dates", async () => {
  // The "Hyr ut" page saves offer settings with an upsert.
  await as(
    u.alice,
    `INSERT INTO public.listing_offer_settings (listing_id, auto_accept_total) VALUES ($1, 100)
     ON CONFLICT (listing_id) DO UPDATE SET auto_accept_total = excluded.auto_accept_total`,
    [u.alice.instantListingId],
  );
  const taken = await placeOffer(
    u.mallory,
    u.alice.instantListingId,
    "2027-02-02",
    "2027-02-04",
    500,
  );
  assert.equal(taken.status, "active");
  const free = await placeOffer(
    u.mallory,
    u.alice.instantListingId,
    "2027-04-01",
    "2027-04-02",
    500,
  );
  assert.equal(free.status, "accepted");
});

test("offers with the end date before the start date are rejected", async () => {
  await assert.rejects(placeOffer(u.bob, u.alice.listingId, "2027-05-05", "2027-05-01", 300));
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
  assert.equal(
    (await as(null, "SELECT * FROM public.booked_dates($1)", [u.alice.instantListingId])).length,
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
