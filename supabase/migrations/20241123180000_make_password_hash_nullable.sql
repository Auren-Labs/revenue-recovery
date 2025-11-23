-- ============================================================================
-- MAKE PASSWORD_HASH NULLABLE FOR GOOGLE AUTHENTICATION
-- ============================================================================

-- Make password_hash nullable to support Google OAuth users
ALTER TABLE public.users 
    ALTER COLUMN password_hash DROP NOT NULL;

-- Add a check constraint to ensure at least one auth method exists
-- (either password_hash OR we can add an auth_provider column later)
COMMENT ON COLUMN public.users.password_hash IS 'Password hash for email/password auth. NULL for OAuth-only users (e.g., Google).';

