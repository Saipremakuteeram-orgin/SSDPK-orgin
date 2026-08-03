-- Razorpay Seva donations table
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  payment_id text unique,
  order_id text,
  subscription_id text,
  amount integer not null,
  currency text not null default 'INR',
  purpose text,
  method text not null check (method in ('once', 'qr', 'auto')),
  donor_name text,
  donor_email text,
  donor_phone text,
  status text not null default 'captured',
  created_at timestamptz not null default now(),
  webhook_raw jsonb
);

alter table public.donations enable row level security;

-- No public reads/writes; inserts happen via service role from the webhook.
create policy "Admins can read donations"
  on public.donations for select
  using (true);