-- Add renewal_alerts table for tracking contract renewal intelligence
create table if not exists public.renewal_alerts (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs (id) on delete cascade,
    alert_type text not null check (alert_type in ('90_day', '60_day', '30_day', 'terminated')),
    sent_at timestamptz,
    status text not null default 'pending' check (status in ('pending', 'sent', 'snoozed', 'cancelled')),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

-- Index for efficient queries
create index if not exists idx_renewal_alerts_job_id on public.renewal_alerts (job_id);
create index if not exists idx_renewal_alerts_status on public.renewal_alerts (status);
create index if not exists idx_renewal_alerts_alert_type on public.renewal_alerts (alert_type);
create index if not exists idx_renewal_alerts_sent_at on public.renewal_alerts (sent_at);

-- Add comment
comment on table public.renewal_alerts is 'Tracks renewal intelligence alerts sent to users for contract renewals';

