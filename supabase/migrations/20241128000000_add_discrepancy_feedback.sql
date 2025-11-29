-- Migration: Add discrepancy feedback table for precision tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS discrepancy_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    discrepancy_id UUID NOT NULL,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Our prediction
    our_confidence DECIMAL(5,4) NOT NULL DEFAULT 0.0,
    our_finding_status VARCHAR(50) NOT NULL DEFAULT 'unknown',
    predicted_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    
    -- Client feedback
    outcome VARCHAR(50) NOT NULL DEFAULT 'pending',
    action_taken VARCHAR(50),
    actual_value DECIMAL(15,2),
    client_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_by VARCHAR(255),
    
    -- Constraints
    CONSTRAINT valid_outcome CHECK (outcome IN (
        'confirmed_valid', 'confirmed_invalid', 'partially_valid', 
        'unable_to_verify', 'pending'
    )),
    CONSTRAINT valid_action CHECK (action_taken IS NULL OR action_taken IN (
        'disputed', 'credit_received', 'write_off', 'investigating', 'no_action'
    )),
    CONSTRAINT valid_confidence CHECK (our_confidence >= 0 AND our_confidence <= 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_job_id ON discrepancy_feedback(job_id);
CREATE INDEX IF NOT EXISTS idx_feedback_customer_id ON discrepancy_feedback(customer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_outcome ON discrepancy_feedback(outcome);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON discrepancy_feedback(created_at);

-- Unique constraint (one feedback per discrepancy)
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_unique_discrepancy 
ON discrepancy_feedback(discrepancy_id);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_feedback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feedback_updated_at
    BEFORE UPDATE ON discrepancy_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_feedback_timestamp();

-- Row Level Security
ALTER TABLE discrepancy_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY feedback_service_role ON discrepancy_feedback
    FOR ALL
    TO service_role
    USING (true);