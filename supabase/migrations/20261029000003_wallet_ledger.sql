-- Double-entry-style wallet ledger. Balances are derived, never stored as a mutable number.

create type ledger_kind as enum (
  'fund', 'withdraw', 'hold', 'release', 'refund',
  'commission', 'payout', 'vip_fee', 'adjustment'
);

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Append-only. amount is signed integer naira: positive = credit to `bucket`,
-- negative = debit. A hold moves money available -> held as two rows sharing group_id.
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  wallet_id uuid not null references public.wallets (id),
  group_id uuid not null,
  bucket text not null check (bucket in ('available', 'held')),
  amount integer not null check (amount <> 0),
  kind ledger_kind not null,
  order_id uuid,
  reference text unique, -- payment-provider reference, makes webhooks idempotent
  created_at timestamptz not null default now()
);
create index ledger_wallet_idx on public.ledger_entries (wallet_id, created_at);

create view public.wallet_balances with (security_invoker = true) as
  select wallet_id,
         coalesce(sum(amount) filter (where bucket = 'available'), 0)::integer as available,
         coalesce(sum(amount) filter (where bucket = 'held'), 0)::integer as held
  from public.ledger_entries group by wallet_id;

-- Never let available or held go negative.
create function public.ledger_guard() returns trigger
language plpgsql as $$
declare bal integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.wallet_id::text));
  select coalesce(sum(amount), 0) into bal
    from public.ledger_entries where wallet_id = new.wallet_id and bucket = new.bucket;
  if bal + new.amount < 0 then
    raise exception 'insufficient % balance', new.bucket;
  end if;
  return new;
end $$;
create trigger ledger_guard_trg before insert on public.ledger_entries
for each row execute function public.ledger_guard();

create function public.ledger_immutable() returns trigger
language plpgsql as $$ begin raise exception 'ledger_entries is append-only'; end $$;
create trigger ledger_no_update before update or delete on public.ledger_entries
for each row execute function public.ledger_immutable();

create function public.create_wallet_for_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;
create trigger users_wallet after insert on public.users
for each row execute function public.create_wallet_for_user();

alter table public.wallets enable row level security;
alter table public.ledger_entries enable row level security;

create policy wallets_self on public.wallets for select
  using (user_id = auth.uid() or public.current_role_is('admin'));
create policy ledger_self on public.ledger_entries for select
  using (exists (select 1 from public.wallets w where w.id = wallet_id and w.user_id = auth.uid())
         or public.current_role_is('admin'));
-- No insert policy: only the service role (server-side payment code) writes the ledger.
