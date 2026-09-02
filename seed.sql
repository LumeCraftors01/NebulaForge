-- ============================================================
--  RedGalaxy Studio / NebulaForge Studio — seed data
--  Run after schema.sql:
--    wrangler d1 execute studio_wiki_db --remote --file=./seed.sql
--
--  Safe to re-run: each game's child rows are cleared first, then
--  re-inserted, so numbers stay in sync. Rows use a per-row
--  (SELECT id FROM games WHERE slug = ...) subquery rather than a
--  UNION ALL SELECT block — D1 caps how many terms a compound
--  SELECT can have, and a 16-row UNION ALL insert exceeds it.
-- ============================================================

INSERT OR IGNORE INTO games (slug, name, tagline, sort_order) VALUES
  ('dont-crash-the-train-for-brainrots', 'Don''t Crash the Train for Brainrots',
   'Keep the train on the track while collecting units for the yard.', 1),
  ('crystal-collecting-simulator', 'Crystal Collecting Simulator',
   'Mine, cut, and stack crystals to grow your collection.', 2);

-- ------------------------------------------------------------
--  Don't Crash the Train for Brainrots
-- ------------------------------------------------------------
DELETE FROM units WHERE game_id = (
  SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'
);
DELETE FROM shop_items WHERE game_id = (
  SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'
);

INSERT INTO units (game_id, category, name, area, base_cost, sort_order) VALUES
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'common', 'Bananita Dolphinita', 'Forest Area', 250, 1),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'common', 'Trippi Troppi', 'Forest Area', 200, 2),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'common', 'Gangster Footera', 'Forest Area', 55, 3),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'rare', 'Ballerina Cappuccina', 'City Area', 400, 1),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'rare', 'Svinina Bombardino', 'City Area', 150, 2),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'rare', 'Bombombini Gusini', 'City Area', 100, 3),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'legendary', 'Cappuccino Assassino', 'Farm Area', 550, 1),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'legendary', 'La Vacca Saturno', 'Farm Area', 1200, 2),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'mythic', 'Crab Chef', 'Volcano Area', 1300, 1),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'mythic', 'Matteo', 'Volcano Area', 1500, 2),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'mythic', 'Tralalero Tralala', 'Volcano Area', 1800, 3),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'godly', 'Giraffa Celestre', 'Beach Area', 3000, 1),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'godly', 'Odin Din Din Din', 'Beach Area', 5000, 2),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'godly', 'Six Seven', 'Beach Area', 6700, 3),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'limited', 'Strawberry Elephant', 'Unknown / Event Area', 150000, 1),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'limited', 'Summerini Fattini', 'Unknown / Event Area', 1500000, 2);

INSERT INTO shop_items (game_id, name, base_rarity, base_cost, base_income, sort_order) VALUES
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'Boneca Ambalabu', 'Rare', 65000, 25000, 1),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'Job Job Job Sahur', 'Rare', 155000, 80000, 2),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'Trippi Troppi Troppa', 'Common', 35000, 10000, 3),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'Esok Sekolah', 'Mythical', 12000000, 125000, 4),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'Karkerkar Kurkur', 'Mythical', 25000000000, 115000, 5),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'Chimpanzini Bananini', 'Common', 10000, 8000, 6),
  ((SELECT id FROM games WHERE slug = 'dont-crash-the-train-for-brainrots'), 'Pot Hotspot', 'Rare', 125000, 75000, 7);

-- Crystal Collecting Simulator ships with no units yet — add rows the
-- same way as above (swap the slug in the subquery) once that game's
-- data is ready.

-- ------------------------------------------------------------
--  Staff roster
-- ------------------------------------------------------------
DELETE FROM staff;

INSERT INTO staff (role_label, name, sort_order) VALUES
  ('Owner',      'Dev_Xdragon / LumeCraftor', 1),
  ('Head Admin', 'Vincent Magtolis',          2),
  ('Admin',      'Jayson Areglo',             3),
  ('Admin',      'Summere Castrence',         4);
