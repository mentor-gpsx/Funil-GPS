-- Story 2.3: Roulette/Roleta Management & Deletion Control
-- Provides audit trail for roleta deletions and consolidated permissions management

-- ════════════════════════════════════════════════════════════════════
-- TABLE: prize_history (Prize/Award History)
-- Stores all prizes won from the roulette wheel
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS prize_history (
  id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  seller_name TEXT,
  wheel TEXT NOT NULL CHECK(wheel IN ('alta', 'baixa')),
  prize_label TEXT NOT NULL,
  prize_color TEXT,
  closing_id TEXT,
  closing_name TEXT,
  closing_valor NUMERIC(15,2),
  source TEXT NOT NULL CHECK(source IN ('auto', 'manual')),
  created_at TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by UUID,
  deletion_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_prize_history_seller_date
  ON prize_history(seller_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prize_history_wheel
  ON prize_history(wheel, created_at DESC);

-- ════════════════════════════════════════════════════════════════════
-- TABLE: roleta_deletions_log (Audit Log for Roulette Deletions)
-- Tracks all roleta/prize deletions for compliance & audit
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS roleta_deletions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id TEXT NOT NULL,
  seller_key TEXT NOT NULL,
  seller_name TEXT,
  wheel TEXT NOT NULL,
  prize_label TEXT,
  closing_id TEXT,
  deleted_by UUID NOT NULL,
  deleted_by_name TEXT,
  deletion_timestamp TIMESTAMP DEFAULT NOW(),
  deletion_reason TEXT,
  FOREIGN KEY(deleted_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roleta_deletions_seller
  ON roleta_deletions_log(seller_key, deletion_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_roleta_deletions_deleted_by
  ON roleta_deletions_log(deleted_by, deletion_timestamp DESC);

-- ════════════════════════════════════════════════════════════════════
-- TABLE: tab_permissions (Centralized Tab Access Control)
-- Controls granular access to each tab/feature per user
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tab_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_key TEXT NOT NULL,
  user_id UUID NOT NULL,
  has_access BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID,
  FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(tab_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tab_permissions_user
  ON tab_permissions(user_id, has_access);

CREATE INDEX IF NOT EXISTS idx_tab_permissions_tab
  ON tab_permissions(tab_key, has_access);

-- ════════════════════════════════════════════════════════════════════
-- TABLE: permission_audit_log (Audit Trail for Permission Changes)
-- Tracks all permission grants/revokes by admins
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  admin_name TEXT,
  tab_key TEXT NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('granted', 'revoked', 'reset')),
  timestamp TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY(admin_id) REFERENCES profiles(id) ON DELETE SET NULL,
  FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_permission_audit_admin
  ON permission_audit_log(admin_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_permission_audit_user
  ON permission_audit_log(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_permission_audit_tab
  ON permission_audit_log(tab_key, timestamp DESC);
