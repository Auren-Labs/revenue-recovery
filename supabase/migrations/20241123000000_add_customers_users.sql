-- ============================================================================
-- CUSTOMERS & USERS SCHEMA
-- ============================================================================

-- Create customers table (organizations)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    industry TEXT,
    employee_count INTEGER,
    annual_spend DECIMAL(15,2),
    subscription_tier TEXT NOT NULL DEFAULT 'trial',
    subscription_status TEXT NOT NULL DEFAULT 'active',
    stripe_customer_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    
    CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('trial', 'starter', 'professional', 'enterprise')),
    CONSTRAINT valid_subscription_status CHECK (subscription_status IN ('active', 'cancelled', 'past_due', 'suspended'))
);

-- Create users table (individuals within organizations)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    last_login TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

-- Update jobs table to include customer and user references
ALTER TABLE public.jobs 
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_customer_id ON public.users(customer_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_id ON public.customers(stripe_customer_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Customers can only see their own data
CREATE POLICY customers_isolation ON public.customers
    FOR ALL
    USING (id = current_setting('app.current_customer_id', true)::uuid);

-- Users can only see users in their organization
CREATE POLICY users_isolation ON public.users
    FOR ALL
    USING (customer_id = current_setting('app.current_customer_id', true)::uuid);

-- Jobs can only be seen by their owning customer
CREATE POLICY jobs_isolation ON public.jobs
    FOR ALL
    USING (customer_id = current_setting('app.current_customer_id', true)::uuid);

-- Insert a demo customer and user for testing
INSERT INTO public.customers (id, name, subscription_tier, subscription_status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Demo Organization',
    'professional',
    'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, customer_id, email, full_name, role, password_hash)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'demo@contractguard.com',
    'Demo User',
    'owner',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5aeKT1vF8nqYS'  -- password: demo123
) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.customers IS 'Organizations using ContractGuard';
COMMENT ON TABLE public.users IS 'Individual users within customer organizations';
COMMENT ON COLUMN public.customers.subscription_tier IS 'trial, starter, professional, enterprise';
COMMENT ON COLUMN public.customers.subscription_status IS 'active, cancelled, past_due, suspended';
COMMENT ON COLUMN public.users.role IS 'owner, admin, member, viewer';

