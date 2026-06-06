-- Space Founder: planets table
-- Run in Supabase SQL Editor or via supabase db push

CREATE TABLE IF NOT EXISTS public.planets (
  id SMALLINT PRIMARY KEY CHECK (id > 0),
  name TEXT NOT NULL UNIQUE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  z DOUBLE PRECISION NOT NULL,
  vx DOUBLE PRECISION NOT NULL,
  vy DOUBLE PRECISION NOT NULL,
  vz DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS planets_updated_at_idx
  ON public.planets (updated_at DESC);

COMMENT ON TABLE public.planets IS
  'Authoritative planet state snapshots for Space Founder world simulation.';

-- Backend server should use SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
-- If using SUPABASE_ANON_KEY, enable one of the policies below.

ALTER TABLE public.planets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planets_read_anon"
  ON public.planets
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "planets_write_anon"
  ON public.planets
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
