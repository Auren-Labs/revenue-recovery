# How to Run the Migration

## Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste this SQL:

```sql
-- Add user_type column to jobs table
-- user_type: 'customer' (default) or 'vendor' - determines perspective for revenue recovery
ALTER TABLE public.jobs 
    ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'customer';

-- Add constraint to ensure valid values
ALTER TABLE public.jobs
    ADD CONSTRAINT valid_user_type CHECK (user_type IN ('customer', 'vendor'));

COMMENT ON COLUMN public.jobs.user_type IS 'Perspective: customer (auditing vendors) or vendor (finding own revenue leakage)';
```

4. Click **Run** to execute the migration

## Option 2: Via Supabase CLI (if installed)

```bash
supabase db push
```

This will apply all pending migrations in the `supabase/migrations/` folder.

## Option 3: Temporary Workaround

The code has been updated to handle the missing column gracefully. It will:
- Default to 'customer' mode if the column doesn't exist
- Log a warning message
- Still create jobs successfully

However, the toggle feature won't work until you run the migration.


