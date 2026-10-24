-- Community flood reports (TRD §8). Apply once: psql "$DATABASE_URL" -f db/schema.sql

create table flood_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  created_at timestamptz not null default now(),
  observed_at timestamptz not null,
  lat double precision, lon double precision,
  psgc text not null,
  depth text not null check (depth in ('ankle','knee','waist','chest')),
  duration_h real, waded boolean not null,
  ip_hash text not null
);
create index on flood_reports (observed_at);
create index on flood_reports (psgc, observed_at);
