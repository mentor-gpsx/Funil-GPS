-- Task 7.4: Shareable read-only links
-- Create report_shares table for token-based report sharing

CREATE TABLE IF NOT EXISTS report_shares (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  report_type VARCHAR(50) NOT NULL, -- 'dre', 'cash_flow', 'metrics', 'forecast'
  report_period VARCHAR(50) NOT NULL, -- '2026-04', '2026-Q1', '2026'
  report_data JSONB NOT NULL,
  recipient_name VARCHAR(255),
  recipient_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES auth.users(id),

  CONSTRAINT valid_token CHECK (LENGTH(token) >= 32),
  CONSTRAINT expires_after_created CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX idx_report_shares_token ON report_shares(token);
CREATE INDEX idx_report_shares_tenant ON report_shares(tenant_id);
CREATE INDEX idx_report_shares_expires ON report_shares(expires_at);
CREATE INDEX idx_report_shares_created ON report_shares(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own shares
CREATE POLICY rls_shares_own ON report_shares
  FOR ALL USING (tenant_id = auth.uid());

-- Public access to shared reports via token (no auth needed)
-- Handled at application level with token validation
