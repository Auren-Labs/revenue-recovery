-- Add user_type column to jobs table
-- user_type: 'customer' (default) or 'vendor' - determines perspective for revenue recovery
ALTER TABLE public.jobs 
    ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'customer';

-- Add constraint to ensure valid values
ALTER TABLE public.jobs
    ADD CONSTRAINT valid_user_type CHECK (user_type IN ('customer', 'vendor'));

COMMENT ON COLUMN public.jobs.user_type IS 'Perspective: customer (auditing vendors) or vendor (finding own revenue leakage)';


