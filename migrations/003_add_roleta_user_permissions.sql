-- ============================================================================
-- MIGRATION 003: Roleta User Permissions (Controle por Usuário)
-- ============================================================================
-- Purpose: Adicionar suporte a permissões de roleta por usuário específico
-- Created: 2026-04-09
-- Safety: Non-destructive, pode rodar múltiplas vezes (idempotent)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CRIAR TABELA: roleta_user_permissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS roleta_user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_key VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_seller_user UNIQUE(seller_key, user_id),
  CONSTRAINT seller_key_not_empty CHECK(seller_key != ''),
  CONSTRAINT notes_max_length CHECK(LENGTH(notes) <= 500)
);

-- ============================================================================
-- 2. CRIAR ÍNDICES para Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_roleta_user_perms_user_id ON roleta_user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_roleta_user_perms_seller_key ON roleta_user_permissions(seller_key);
CREATE INDEX IF NOT EXISTS idx_roleta_user_perms_enabled ON roleta_user_permissions(is_enabled);
CREATE INDEX IF NOT EXISTS idx_roleta_user_perms_seller_enabled ON roleta_user_permissions(seller_key, is_enabled);

-- ============================================================================
-- 3. ATIVAR RLS (Row Level Security)
-- ============================================================================
ALTER TABLE roleta_user_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CRIAR RLS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "admins_can_view_all_roleta_perms" ON roleta_user_permissions;
CREATE POLICY "admins_can_view_all_roleta_perms"
ON roleta_user_permissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.raw_app_meta_data->>'role' = 'admin'
  )
);

DROP POLICY IF EXISTS "users_can_view_own_roleta_perms" ON roleta_user_permissions;
CREATE POLICY "users_can_view_own_roleta_perms"
ON roleta_user_permissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_can_manage_roleta_perms" ON roleta_user_permissions;
CREATE POLICY "admins_can_manage_roleta_perms"
ON roleta_user_permissions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.raw_app_meta_data->>'role' = 'admin'
  )
);

-- ============================================================================
-- 5. CRIAR TRIGGER para updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_roleta_user_perms_updated_at ON roleta_user_permissions;
CREATE TRIGGER trigger_roleta_user_perms_updated_at
BEFORE UPDATE ON roleta_user_permissions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. CRIAR FUNÇÃO: check_roleta_authorized
-- Purpose: Verifica se usuário tem autorização (com precedência de seller)
-- ============================================================================
DROP FUNCTION IF EXISTS check_roleta_authorized(UUID, VARCHAR);
CREATE FUNCTION check_roleta_authorized(
  p_user_id UUID,
  p_seller_key VARCHAR(255)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_seller_active BOOLEAN;
  v_user_enabled BOOLEAN;
BEGIN
  -- Verificar se seller tem roleta ativa (máxima precedência)
  SELECT roleta_ativa INTO v_seller_active
  FROM roleta_settings
  WHERE seller_key = p_seller_key;

  -- Se seller_ativa = false, BLOQUEIA todos (independente de permissão individual)
  IF v_seller_active IS FALSE THEN
    RETURN FALSE;
  END IF;

  -- Se seller_ativa = true, verificar permissão individual do usuário
  SELECT is_enabled INTO v_user_enabled
  FROM roleta_user_permissions
  WHERE user_id = p_user_id
  AND seller_key = p_seller_key;

  -- Se usuário não tem registro, retorna FALSE (default seguro)
  RETURN COALESCE(v_user_enabled, FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. CRIAR FUNÇÃO: grant_roleta_permission
-- Purpose: Libera roleta para usuário (idempotent)
-- ============================================================================
DROP FUNCTION IF EXISTS grant_roleta_permission(UUID, VARCHAR, UUID, TEXT);
CREATE FUNCTION grant_roleta_permission(
  p_user_id UUID,
  p_seller_key VARCHAR(255),
  p_granted_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO roleta_user_permissions (
    user_id,
    seller_key,
    is_enabled,
    granted_by,
    notes
  )
  VALUES (p_user_id, p_seller_key, TRUE, p_granted_by, p_notes)
  ON CONFLICT (seller_key, user_id) DO UPDATE
  SET
    is_enabled = TRUE,
    updated_at = NOW(),
    granted_by = p_granted_by,
    notes = COALESCE(p_notes, roleta_user_permissions.notes);

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. CRIAR FUNÇÃO: revoke_roleta_permission
-- Purpose: Bloqueia roleta para usuário (idempotent)
-- ============================================================================
DROP FUNCTION IF EXISTS revoke_roleta_permission(UUID, VARCHAR, UUID, TEXT);
CREATE FUNCTION revoke_roleta_permission(
  p_user_id UUID,
  p_seller_key VARCHAR(255),
  p_revoked_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE roleta_user_permissions
  SET
    is_enabled = FALSE,
    updated_at = NOW(),
    granted_by = p_revoked_by,
    notes = CASE
      WHEN p_reason IS NOT NULL THEN 'REVOKED: ' || p_reason
      ELSE 'REVOKED'
    END
  WHERE user_id = p_user_id
  AND seller_key = p_seller_key;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. COMENTÁRIOS (Documentação)
-- ============================================================================
COMMENT ON TABLE roleta_user_permissions IS
'Rastreia permissão de acesso à roleta por usuário específico.
Precedência: Se roleta_settings.roleta_ativa=false para seller_key,
nenhum usuário vê a roleta (independente de is_enabled aqui).';

COMMENT ON COLUMN roleta_user_permissions.user_id IS
'FK para auth.users - usuário que obtém permissão';

COMMENT ON COLUMN roleta_user_permissions.seller_key IS
'FK para roleta_settings.seller_key - identificador do vendedor';

COMMENT ON COLUMN roleta_user_permissions.is_enabled IS
'true = autorizado; false = bloqueado. Só funciona se roleta_settings.roleta_ativa=true';

COMMENT ON FUNCTION check_roleta_authorized(UUID, VARCHAR) IS
'Retorna TRUE se usuário tem autorização (respeita precedência de seller)';

COMMENT ON FUNCTION grant_roleta_permission(UUID, VARCHAR, UUID, TEXT) IS
'Libera acesso à roleta para um usuário (idempotent)';

COMMENT ON FUNCTION revoke_roleta_permission(UUID, VARCHAR, UUID, TEXT) IS
'Bloqueia acesso à roleta para um usuário (idempotent)';

-- ============================================================================
-- 10. VERIFICAÇÃO FINAL
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'roleta_user_permissions'
  ) THEN
    RAISE NOTICE 'SUCCESS: Migration 003 executada com sucesso!';
  ELSE
    RAISE NOTICE 'FAIL: Tabela não foi criada';
  END IF;
END $$;

COMMIT;
