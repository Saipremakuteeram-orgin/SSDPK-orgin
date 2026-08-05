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

-- Users can read only their own donations (matched by the auth email).
drop policy if exists "Users read own donations" on public.donations;
create policy "Users read own donations"
  on public.donations for select
  to authenticated
  using (donor_email = (select email from auth.users where id = auth.uid()));

-- Subscribers mapping: binds a Razorpay subscription to a logged-in user so
-- autopay charges can be attributed to them even when the subscription was
-- created without donor notes.
create table if not exists public.subscribers (
  subscription_id text primary key,
  donor_email text,
  donor_name text,
  donor_phone text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

drop policy if exists "Users read own subscribers" on public.subscribers;
create policy "Users read own subscribers"
  on public.subscribers for select
  to authenticated
  using (donor_email = (select email from auth.users where id = auth.uid()));