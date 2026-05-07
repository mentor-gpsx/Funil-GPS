-- Migration: 005_users_auth.sql
-- Authentication & Authorization: users + refresh tokens + MFA tables
-- Created: 2026-05-06
-- Story: 1.4 (Authentication & Authorization)

-- ============================================================================
-- 1. USERS TABLE (Multi-tenant with composite PK)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,        -- bcrypt hash, NEVER plaintext
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'accountant', 'viewer')),

  -- MFA (TOTP, RFC 6238)
  mfa_enrolled BOOLEAN NOT NULL DEFAULT false,
  mfa_secret VARCHAR(64),                     -- Base32, NULL until enrolment finalised
  mfa_backup_codes JSONB,                     -- array of bcrypt-hashed single-use codes

  -- Account state
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, email)
);

-- Email lookup is the hot path for /auth/login. Index across tenants because
-- a user's tenant is unknown at login time (resolved from email).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users (tenant_id, role) WHERE is_active = true;

-- ============================================================================
-- 2. REFRESH TOKENS TABLE (Rotating, max 24h)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash VARCHAR(255) NOT NULL,           -- SHA-256 of refresh token
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID,                           -- new refresh token ID after rotation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent VARCHAR(500),
  ip_address VARCHAR(45),

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens (tenant_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry
  ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Users: tenant_isolation
DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Refresh tokens: tenant_isolation
DROP POLICY IF EXISTS refresh_tokens_tenant_isolation ON refresh_tokens;
CREATE POLICY refresh_tokens_tenant_isolation ON refresh_tokens
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- ============================================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE users IS 'Application users with bcrypt-hashed passwords + TOTP MFA';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash, cost factor >= 12';
COMMENT ON COLUMN users.mfa_secret IS 'Base32-encoded TOTP secret (RFC 6238)';
COMMENT ON COLUMN users.mfa_backup_codes IS 'JSON array of bcrypt-hashed single-use recovery codes';
COMMENT ON TABLE refresh_tokens IS 'Rotating refresh tokens; max 24h lifetime per token';

-- Migration complete
