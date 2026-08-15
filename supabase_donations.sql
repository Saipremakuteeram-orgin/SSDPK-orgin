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

-- ── Weekly Swami Discourse messages ──────────────────────────────────────────
-- Media lives on a dedicated Telegram channel (invisible CDN). This table holds
-- metadata + the channel/message_id so the site can embed the t.me player.
create table if not exists public.weekly_messages (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  date                  date not null,
  description           text,
  media_type            text not null check (media_type in ('audio','video','text')),
  telegram_channel      text not null,
  telegram_message_id   bigint not null,
  category              text,
  language              text,
  duration              text,
  thumbnail_url         text,
  created_at            timestamptz not null default now(),
  created_by            uuid
);

alter table public.weekly_messages enable row level security;

-- Public read (anon + authenticated) — the public page reads via the anon client.
drop policy if exists "Public read weekly messages" on public.weekly_messages;
create policy "Public read weekly messages"
  on public.weekly_messages for select
  to anon, authenticated
  using (true);

-- Admin check: existing site_admins table OR the canonical admin email.
-- Primary enforcement is server-side (service role + JWT email check in the API);
-- this policy is defense in depth so anon/authenticated cannot INSERT/UPDATE/DELETE.
create or replace function public.is_weekly_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (select 1 from public.site_admins where email = auth.jwt() ->> 'email')
    or (auth.jwt() ->> 'email') in ('sk143sathya@gmail.com')
$$;

drop policy if exists "Admins manage weekly messages" on public.weekly_messages;
create policy "Admins manage weekly messages"
  on public.weekly_messages for all
  to authenticated
  using (public.is_weekly_admin())
  with check (public.is_weekly_admin());