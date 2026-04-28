-- Quote requests table
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/scsmogcniirayhzvteqy/sql

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  message     TEXT,
  funda_url   TEXT,
  total_cost  NUMERIC,
  address     TEXT,
  city        TEXT,
  asking_price TEXT,
  energy_label TEXT,
  year_built  TEXT,
  timeline    TEXT DEFAULT 'Snel mogelijk',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup by date
CREATE INDEX IF NOT EXISTS quote_requests_created_at_idx ON public.quote_requests (created_at DESC);

-- Enable Row Level Security (read-only for owner via service role)
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
