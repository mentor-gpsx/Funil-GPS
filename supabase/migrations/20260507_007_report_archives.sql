-- Task 7.5: Historical archive and searchability
-- Create report_archives table for storing generated reports

CREATE TABLE IF NOT EXISTS report_archives (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL, -- 'dre', 'cash_flow', 'metrics', 'forecast'
  report_period VARCHAR(50) NOT NULL, -- '2026-04', '2026-Q1', '2026'
  format VARCHAR(50) NOT NULL, -- 'json', 'pdf', 'csv', 'excel'
  report_data JSONB NOT NULL,
  file_path VARCHAR(500), -- path to stored file if exported
  file_size BIGINT,
  checksum VARCHAR(64), -- SHA256 checksum for integrity verification
  generated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_report_type CHECK (report_type IN ('dre', 'cash_flow', 'metrics', 'forecast')),
  CONSTRAINT valid_format CHECK (format IN ('json', 'pdf', 'csv', 'excel'))
);

-- Indexes for performance and search
CREATE INDEX idx_report_archives_tenant ON report_archives(tenant_id);
CREATE INDEX idx_report_archives_type_period ON report_archives(report_type, report_period);
CREATE INDEX idx_report_archives_created ON report_archives(created_at DESC);
CREATE INDEX idx_report_archives_format ON report_archives(format);

-- Full-text search index on report_data for searching content
CREATE INDEX idx_report_archives_tsvector ON report_archives
  USING GIN(to_tsvector('portuguese', report_data::text));

-- Enable RLS (Row Level Security)
ALTER TABLE report_archives ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own archived reports
CREATE POLICY rls_archives_own ON report_archives
  FOR ALL USING (tenant_id = auth.uid());

-- Composite index for common search patterns
CREATE INDEX idx_report_archives_search ON report_archives(tenant_id, report_type, created_at DESC);
