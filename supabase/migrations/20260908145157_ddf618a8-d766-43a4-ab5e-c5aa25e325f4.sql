
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
CREATE TYPE public.account_type AS ENUM ('private','company');
CREATE TYPE public.booking_status AS ENUM ('requested','confirmed','declined','cancelled','completed');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  account_type public.account_type NOT NULL DEFAULT 'private',
  city text,
  bio text,
  phone text,
  email_verified boolean NOT NULL DEFAULT false,
  phone_verified boolean NOT NULL DEFAULT false,
  id_verified boolean NOT NULL DEFAULT false,
  rating numeric(2,1) NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_self_write" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, account_type)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          COALESCE((NEW.raw_user_meta_data->>'account_type')::public.account_type,'private'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  org_number text,
  logo_url text,
  description text,
  city text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT ON public.companies TO anon;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_public_read" ON public.companies FOR SELECT USING (true);
CREATE POLICY "companies_owner_write" ON public.companies FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.company_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  UNIQUE (company_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_admins TO authenticated;
GRANT ALL ON public.company_admins TO service_role;
ALTER TABLE public.company_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_admins_read" ON public.company_admins FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_admins_owner_write" ON public.company_admins FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()));

CREATE TABLE public.categories (
  slug text PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'package',
  synonyms text[] NOT NULL DEFAULT '{}',
  sort int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (true);

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  owner_name text NOT NULL DEFAULT 'Demoanvändare',
  owner_type public.account_type NOT NULL DEFAULT 'private',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category_slug text NOT NULL REFERENCES public.categories(slug),
  city text NOT NULL,
  area text,
  lat double precision NOT NULL DEFAULT 59.3293,
  lng double precision NOT NULL DEFAULT 18.0686,
  price_hour numeric,
  price_day numeric NOT NULL,
  price_week numeric,
  price_month numeric,
  deposit numeric NOT NULL DEFAULT 0,
  service_fee_pct numeric NOT NULL DEFAULT 10,
  insurance_fee numeric NOT NULL DEFAULT 0,
  delivery_available boolean NOT NULL DEFAULT false,
  delivery_fee numeric NOT NULL DEFAULT 0,
  pickup_available boolean NOT NULL DEFAULT true,
  instant_book boolean NOT NULL DEFAULT false,
  images text[] NOT NULL DEFAULT '{}',
  rating numeric(2,1) NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  booking_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT SELECT ON public.listings TO anon;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_public_read" ON public.listings FOR SELECT USING (status = 'published');
CREATE POLICY "listings_owner_read" ON public.listings FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "listings_owner_write" ON public.listings FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  renter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days int NOT NULL DEFAULT 1,
  base_price numeric NOT NULL DEFAULT 0,
  service_fee numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  insurance_fee numeric NOT NULL DEFAULT 0,
  deposit numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  delivery boolean NOT NULL DEFAULT false,
  status public.booking_status NOT NULL DEFAULT 'requested',
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT SELECT ON public.bookings TO anon;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_party_read" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = renter_id OR auth.uid() = owner_id);
CREATE POLICY "bookings_renter_insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = renter_id);
CREATE POLICY "bookings_party_update" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = renter_id OR auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.booked_dates(_listing_id uuid)
RETURNS TABLE (start_date date, end_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.start_date, b.end_date FROM public.bookings b
  WHERE b.listing_id = _listing_id AND b.status = 'confirmed'
$$;
GRANT EXECUTE ON FUNCTION public.booked_dates(uuid) TO anon, authenticated;

CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites_self" ON public.favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  query text NOT NULL DEFAULT '',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_searches_self" ON public.saved_searches FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  renter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_party" ON public.conversations FOR ALL TO authenticated
  USING (auth.uid() = renter_id OR auth.uid() = owner_id)
  WITH CHECK (auth.uid() = renter_id OR auth.uid() = owner_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL DEFAULT '',
  image_url text,
  kind text NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_party_read" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())));
CREATE POLICY "messages_party_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())));

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'Verifierad hyresgäst',
  rating int NOT NULL DEFAULT 5,
  body text NOT NULL DEFAULT '',
  verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews_author_write" ON public.reviews FOR ALL TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_self_read" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "reports_insert" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE TABLE public.external_sources (
  slug text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'mock',
  status text NOT NULL DEFAULT 'demo',
  requires_agreement boolean NOT NULL DEFAULT true,
  note text,
  last_sync timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.external_sources TO anon, authenticated;
GRANT ALL ON public.external_sources TO service_role;
ALTER TABLE public.external_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "external_sources_public_read" ON public.external_sources FOR SELECT USING (true);

INSERT INTO public.categories (slug, name, icon, synonyms, sort) VALUES
 ('slapvagn','Släpvagn','truck','{"slap","släp","slapkarra","kärra","karra","trailer","släpkärra"}',1),
 ('verktyg','Verktyg','wrench','{"borrmaskin","borr","hammare","tigersåg","verktyg","slipmaskin","hogtryckstvatt","högtryckstvätt","tryckttvätt"}',2),
 ('kamera','Kamera & Foto','camera','{"kamera","systemkamera","objektiv","gopro","drönare","dronare","blixt"}',3),
 ('fest','Fest & Event','party-popper','{"partytält","tält","högtalare","hogtalare","ljud","popcornmaskin","festbord"}',4),
 ('tradgard','Trädgård','flower-2','{"gräsklippare","grasklippare","häcksax","hacksax","jordfräs","lövblås","lovblas"}',5),
 ('fritid','Fritid & Sport','tent','{"kajak","cykel","skidor","tältvagn","paddleboard","sup"}',6),
 ('bygg','Bygg & Maskiner','hard-hat','{"betongblandare","byggställning","ställning","spikpistol","bygg"}',7),
 ('barn','Barn & Familj','baby','{"barnvagn","bilbarnstol","resesäng","reseseng"}',8);

INSERT INTO public.external_sources (slug,name,kind,status,requires_agreement,note) VALUES
 ('nordhyra','Nordhyra','mock','demo',true,'Demodata. Kräver avtal om produktfeed innan skarp integration.'),
 ('maskinpoolen','Maskinpoolen Syd','mock','demo',true,'Demodata. Planerad affiliate-integration.'),
 ('grannlan','Grannlån','mock','demo',true,'Demodata. Kräver officiellt API.'),
 ('citytrailer','CityTrailer','mock','degraded',true,'Demodata. Simulerad instabil källa.');

INSERT INTO public.listings (title, description, category_slug, city, area, lat, lng, owner_name, owner_type, price_hour, price_day, price_week, price_month, deposit, insurance_fee, delivery_available, delivery_fee, instant_book, images, rating, review_count, booking_count) VALUES
('Obromsad släpvagn 750 kg','Smidig släpvagn för flytt och återvinningsresor. Nät och spännband ingår.','slapvagn','Stockholm','Solna',59.3600,18.0000,'Erik L.','private',60,295,1400,4200,1000,49,true,150,true,'{"https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=1200","https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=1200"}',4.8,42,88),
('Bromsad släpvagn 1350 kg med kåpa','Stor kåpsläpvagn, perfekt för flytt. Uthyres av företag med fast pris.','slapvagn','Stockholm','Kungsholmen',59.3320,18.0300,'Hyrmaskiner Stockholm AB','company',95,449,2100,6300,2000,79,true,250,true,'{"https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=1200"}',4.6,120,310),
('Släpvagn 500 kg','Liten och lätt att backa. Hämtas i Majorna.','slapvagn','Göteborg','Majorna',57.6900,11.9200,'Sara K.','private',45,225,1050,3100,800,39,false,0,false,'{"https://images.unsplash.com/photo-1601758124331-d1b1a2e2ee0f?w=1200"}',4.9,18,31),
('Högtryckstvätt Kärcher K5','Kraftfull tvätt för altan, bil och fasad. Terrassrengörare ingår.','verktyg','Stockholm','Solna',59.3650,18.0100,'Johan M.','private',49,199,850,2400,500,29,true,99,true,'{"https://images.unsplash.com/photo-1615873968403-89e068629265?w=1200"}',4.7,64,140),
('Högtryckstvätt Nilfisk Premium','Proffsmodell med slangvinda. Hämtning i Sundbyberg.','verktyg','Stockholm','Sundbyberg',59.3610,17.9700,'Uthyrarna Sverige AB','company',59,249,1100,3000,700,39,false,0,true,'{"https://images.unsplash.com/photo-1580901369227-308f6f40bdeb?w=1200"}',4.4,27,58),
('Slagborrmaskin Bosch Professional','Batteridriven, två batterier och laddare ingår.','verktyg','Göteborg','Centrum',57.7089,11.9746,'Anna S.','private',35,129,580,1600,300,19,false,0,true,'{"https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1200"}',4.9,88,201),
('Tigersåg och multiverktyg','Perfekt för rivning och renovering.','verktyg','Malmö','Möllevången',55.5900,13.0100,'Peter H.','private',30,119,520,1500,300,19,false,0,false,'{"https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=1200"}',4.5,12,22),
('Sony A7 IV med 24-70 mm','Fullformat för bröllop och film. Två batterier och minneskort.','kamera','Stockholm','Södermalm',59.3130,18.0700,'Nora F.','private',150,690,3200,9500,5000,120,true,199,false,'{"https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1200"}',5.0,34,52),
('DJI Mini 4 Pro drönare','Lätt drönare, tre batterier, väska ingår.','kamera','Göteborg','Lindholmen',57.7070,11.9400,'Filmbolaget Väst AB','company',120,540,2500,7200,4000,99,true,150,true,'{"https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=1200"}',4.8,45,96),
('GoPro Hero 12 med tillbehör','Actionkamera med fästen för cykel och hjälm.','kamera','Malmö','Västra Hamnen',55.6140,12.9800,'Ludvig P.','private',45,160,700,1900,1000,25,false,0,true,'{"https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1200"}',4.6,29,61),
('Partytält 5x8 m','Rymmer 40 gäster. Levereras och monteras mot avgift.','fest','Stockholm','Nacka',59.3100,18.1600,'Eventpartner Nord AB','company',NULL,1250,5200,14000,3000,199,true,900,false,'{"https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200"}',4.3,73,180),
('Ljudanläggning 2x600W med mixer','Högtalare, stativ, mixer och kablage.','fest','Göteborg','Hisingen',57.7200,11.9300,'Malin R.','private',120,480,2100,5900,2500,89,true,300,true,'{"https://images.unsplash.com/photo-1470229722913-7ea0a582d3af?w=1200"}',4.7,38,74),
('Popcornmaskin retro','Klassisk popcornmaskin till kalaset. Majs ingår.','fest','Uppsala','Luthagen',59.8600,17.6300,'Karin B.','private',NULL,299,1200,3200,500,0,false,0,true,'{"https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=1200"}',4.9,21,44),
('Åkgräsklippare Husqvarna','Klipper stora ytor snabbt. Kräver B-körkort för transport.','tradgard','Uppsala','Sunnersta',59.7700,17.6500,'Grönt & Skönt AB','company',180,890,3900,11000,3000,120,true,400,false,'{"https://images.unsplash.com/photo-1592234403516-2c1c5b0c9b1b?w=1200"}',4.2,19,35),
('Jordfräs 5 hk','Bearbetar hela köksträdgården på en dag.','tradgard','Malmö','Limhamn',55.5800,12.9300,'Sven T.','private',90,390,1700,4700,1500,49,false,0,false,'{"https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200"}',4.4,15,26),
('Häcksax och lövblås (paket)','Batteridrivet paket för höststäd i trädgården.','tradgard','Stockholm','Bromma',59.3400,17.9300,'Elin W.','private',40,180,760,2100,400,19,false,0,true,'{"https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=1200"}',4.8,26,49),
('Havskajak 2-sits med paddlar','Inklusive flytvästar och kapell.','fritid','Göteborg','Saltholmen',57.6500,11.7900,'Kust & Kajak AB','company',150,595,2400,6800,2000,99,true,350,true,'{"https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1200"}',4.9,57,132),
('Elcykel Cake med extra batteri','Rullar 90 km per laddning. Lås och hjälm ingår.','fritid','Stockholm','Vasastan',59.3450,18.0500,'Oskar N.','private',80,320,1450,3900,3000,59,false,0,true,'{"https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=1200"}',4.7,41,90),
('Paddleboard SUP 10,6 fot','Uppblåsbar SUP med pump, paddel och ryggsäck.','fritid','Malmö','Ribersborg',55.6000,12.9700,'Hanna D.','private',60,190,820,2300,800,25,false,0,true,'{"https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200"}',4.8,33,70),
('Betongblandare 130 liter','Robust blandare för grund och plattsättning.','bygg','Uppsala','Boländerna',59.8500,17.6700,'Byggkraft Uppsala AB','company',85,349,1500,4200,1500,59,true,300,true,'{"https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200"}',4.1,23,48),
('Byggställning 6 meter','Enkel att montera, hjul och plankor ingår.','bygg','Stockholm','Hägersten',59.2950,17.9800,'Ramverk Stockholm AB','company',NULL,650,2600,7400,4000,120,true,600,false,'{"https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200"}',4.5,31,66),
('Bilbarnstol Britax 9-18 kg','Nyservad och rengjord. Perfekt för besökande släkt.','barn','Stockholm','Solna',59.3620,18.0050,'Maja E.','private',NULL,99,390,1000,0,0,false,0,true,'{"https://images.unsplash.com/photo-1519689680058-324335c77eba?w=1200"}',5.0,14,29),
('Resesäng och barnvagn (paket)','Komplett paket för besök med småbarn.','barn','Göteborg','Örgryte',57.7000,12.0100,'Familjen Berg','private',NULL,149,600,1600,300,0,true,100,true,'{"https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=1200"}',4.6,17,33),
('Spikpistol med kompressor','För altan- och regelarbete. Slang ingår.','bygg','Göteborg','Backa',57.7500,11.9600,'Tomas G.','private',55,245,1050,2900,1200,39,false,0,false,'{"https://images.unsplash.com/photo-1581093458791-9d42e3c7e117?w=1200"}',4.3,11,20);

INSERT INTO public.reviews (listing_id, author_name, rating, body, created_at)
SELECT l.id, v.author, v.rating, v.body, now() - (v.d || ' days')::interval
FROM public.listings l
CROSS JOIN (VALUES
  ('Anders P.',5,'Precis som beskrivet, smidig upphämtning och trevlig uthyrare.',6),
  ('Lisa H.',4,'Fungerade utmärkt, lite sen leverans men bra kommunikation.',18),
  ('Mohammed A.',5,'Toppenskick och riktigt bra pris jämfört med butik.',33)
) AS v(author, rating, body, d);
