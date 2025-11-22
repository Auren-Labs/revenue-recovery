-- Ensure pgvector extension exists for embeddings
create extension if not exists vector;

create table if not exists public.jobs (
    id uuid primary key,
    vendor_name text not null,
    organization_id text,
    status text not null default 'queued',
    message text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_stages (
    id uuid primary key,
    job_id uuid not null references public.jobs (id) on delete cascade,
    name text not null,
    status text not null default 'pending',
    detail text,
    sequence integer not null default 0,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_documents (
    id uuid primary key,
    job_id uuid not null references public.jobs (id) on delete cascade,
    document_type text not null,
    filename text,
    storage_provider text,
    storage_path text,
    local_path text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_discrepancies (
    id uuid primary key,
    job_id uuid not null references public.jobs (id) on delete cascade,
    customer text,
    issue text,
    priority text,
    value numeric,
    due text,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_metrics (
    job_id uuid primary key references public.jobs (id) on delete cascade,
    metrics jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contract_chunks (
    id uuid primary key,
    job_id uuid not null references public.jobs (id) on delete cascade,
    vendor text,
    source_type text not null,
    filename text,
    reference text,
    text text,
    metadata jsonb not null default '{}'::jsonb,
    embedding vector(1536),
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_chunks (
    id uuid primary key,
    job_id uuid not null references public.jobs (id) on delete cascade,
    vendor text,
    source_type text not null,
    reference text,
    text text,
    metadata jsonb not null default '{}'::jsonb,
    embedding vector(1536),
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_jobs_org on public.jobs (organization_id);
create index if not exists idx_job_stages_job_id on public.job_stages (job_id);
create index if not exists idx_job_documents_job_id on public.job_documents (job_id);
create index if not exists idx_job_discrepancies_job_id on public.job_discrepancies (job_id);
create index if not exists idx_contract_chunks_job_id on public.contract_chunks (job_id);
create index if not exists idx_billing_chunks_job_id on public.billing_chunks (job_id);

-- Vector indexes for faster similarity search (requires pgvector >= 0.5)
create index if not exists contract_chunks_embedding_idx
    on public.contract_chunks
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

create index if not exists billing_chunks_embedding_idx
    on public.billing_chunks
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

