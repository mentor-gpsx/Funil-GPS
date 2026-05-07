-- Migration: Report Scheduling Tables
-- Date: 2026-05-07
-- Description: Create tables for managing scheduled report delivery

-- ============================================
-- REPORT_SCHEDULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS report_schedules (
  tenant_id TEXT PRIMARY KEY,
  config JSONB DEFAULT '{}',
  daily_dre_enabled BOOLEAN DEFAULT true,
  daily_dre_time TEXT DEFAULT '08:00',
  weekly_cashflow_enabled BOOLEAN DEFAULT true,
  weekly_cashflow_time TEXT DEFAULT '09:00',
  weekly_cashflow_day INTEGER DEFAULT 1,
  monthly_full_enabled BOOLEAN DEFAULT true,
  monthly_full_time TEXT DEFAULT '10:00',
  monthly_full_day INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- REPORT_DELIVERIES TABLE (Audit Log)
-- ============================================
CREATE TABLE IF NOT EXISTS report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  report_type TEXT NOT NULL, -- 'dre', 'cashflow', 'monthly'
  recipients JSONB NOT NULL, -- Array of email addresses
  delivered_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_report_deliveries_tenant ON report_deliveries(tenant_id);
CREATE INDEX idx_report_deliveries_type ON report_deliveries(report_type);
CREATE INDEX idx_report_deliveries_date ON report_deliveries(delivered_at);

-- ============================================
-- EMAIL_LOGS TABLE (Email Delivery Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  recipients JSONB NOT NULL, -- Array of email addresses
  subject TEXT NOT NULL,
  message_id TEXT,
  status TEXT DEFAULT 'pending', -- 'sent', 'failed', 'bounced'
  error TEXT,
  sent_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_email_logs_tenant ON email_logs(tenant_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_date ON email_logs(sent_at);

-- ============================================
-- REPORT_QUEUE TABLE (Pending Reports)
-- ============================================
CREATE TABLE IF NOT EXISTS report_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  report_type TEXT NOT NULL, -- 'dre', 'cashflow', 'monthly'
  period TEXT, -- 'YYYY-MM' for monthly reports
  status TEXT DEFAULT 'pending', -- 'pending', 'generating', 'ready', 'failed'
  recipients JSONB NOT NULL, -- Array of email addresses
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  generated_at TIMESTAMP,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_report_queue_tenant ON report_queue(tenant_id);
CREATE INDEX idx_report_queue_status ON report_queue(status);
CREATE INDEX idx_report_queue_date ON report_queue(created_at);

-- ============================================
-- REPORT_TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT,
  report_type TEXT NOT NULL, -- 'dre', 'cashflow', 'monthly', 'custom'
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  html_template TEXT,
  text_template TEXT,
  include_attachments BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, report_type, is_default)
);

CREATE INDEX idx_report_templates_tenant ON report_templates(tenant_id);
CREATE INDEX idx_report_templates_type ON report_templates(report_type);

-- ============================================
-- TRIGGERS: Auto-update timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_report_schedules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_report_schedules_timestamp
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_report_schedules_timestamp();

CREATE OR REPLACE FUNCTION update_report_templates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_report_templates_timestamp
  BEFORE UPDATE ON report_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_report_templates_timestamp();

-- ============================================
-- SAMPLE DEFAULT TEMPLATES
-- ============================================

INSERT INTO report_templates (report_type, name, subject_template, is_default)
VALUES
  ('dre', 'Default DRE', 'DRE Report - {{period}}', true),
  ('cashflow', 'Default Cash Flow', 'Cash Flow Report - Week of {{start_date}}', true),
  ('monthly', 'Default Monthly', 'Monthly Financial Report - {{period}}', true)
ON CONFLICT DO NOTHING;
