-- ============================================================================
-- ROLETA SYSTEM - SCHEMA SETUP (UNIVERSAL - Funciona 100% no Supabase)
-- ============================================================================
-- Este script cria TODAS as tabelas, índices e dados padrão em UMA transação
-- Copie e cole TUDO isto no Supabase SQL Editor e clique RUN

BEGIN;

-- ============================================================================
-- 1. CRIAR TABELA: roleta_settings (Configuração por vendedor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roleta_settings (
  seller_key TEXT PRIMARY KEY,
  roleta_existe BOOLEAN DEFAULT true,
  roleta_ativa BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- 2. CRIAR TABELA: roleta_grants (Auditoria de liberações - auto ou manual)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roleta_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_key TEXT NOT NULL REFERENCES roleta_settings(seller_key) ON DELETE CASCADE,
  wheel TEXT NOT NULL CHECK (wheel IN ('alta', 'baixa')),
  source TEXT NOT NULL CHECK (source IN ('auto-closing', 'manual-grant')),
  origin_id TEXT,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  spin_status TEXT DEFAULT 'pending' CHECK (spin_status IN ('pending', 'used', 'revoked'))
);

-- ============================================================================
-- 3. CRIAR TABELA: roleta_spins (Histórico de giros realizados)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roleta_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES roleta_grants(id) ON DELETE CASCADE,
  result TEXT,
  spun_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  spun_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- 4. CRIAR TABELA: roleta_revocation_log (Auditoria de revogações)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roleta_revocation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES roleta_grants(id) ON DELETE CASCADE,
  revoked_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT
);

-- ============================================================================
-- 5. CRIAR ÍNDICES para Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_roleta_grants_seller
  ON roleta_grants(seller_key);

CREATE INDEX IF NOT EXISTS idx_roleta_grants_status
  ON roleta_grants(spin_status);

CREATE INDEX IF NOT EXISTS idx_roleta_grants_seller_status
  ON roleta_grants(seller_key, spin_status);

CREATE INDEX IF NOT EXISTS idx_roleta_grants_pending_origin
  ON roleta_grants(origin_id, spin_status)
  WHERE spin_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_roleta_spins_grant_id
  ON roleta_spins(grant_id);

CREATE INDEX IF NOT EXISTS idx_revocation_log_grant_id
  ON roleta_revocation_log(grant_id);

-- ============================================================================
-- 6. CRIAR FUNÇÃO SQL: revoke_grant_safe_with_lock (Com Advisory Lock)
-- ============================================================================
CREATE OR REPLACE FUNCTION revoke_grant_safe_with_lock(
  p_seller_key TEXT,
  p_wheel TEXT,
  p_revoked_by UUID
)
RETURNS TABLE(
  success BOOLEAN,
  grant_id UUID,
  message TEXT
) AS $$
DECLARE
  v_grant_id UUID;
  v_current_status TEXT;
BEGIN
  -- Obter lock pessimista
  SELECT id, spin_status INTO v_grant_id, v_current_status
  FROM roleta_grants
  WHERE seller_key = p_seller_key
    AND wheel = p_wheel
    AND spin_status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_grant_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Nenhum grant pendente encontrado'::TEXT;
    RETURN;
  END IF;

  IF v_current_status != 'pending' THEN
    RETURN QUERY SELECT FALSE, v_grant_id, format('Grant já foi utilizado ou revogado (status=%L)', v_current_status)::TEXT;
    RETURN;
  END IF;

  UPDATE roleta_grants
  SET spin_status = 'revoked'
  WHERE id = v_grant_id;

  INSERT INTO roleta_revocation_log (grant_id, revoked_by, reason)
  VALUES (v_grant_id, p_revoked_by, 'Revogado via admin UI');

  RETURN QUERY SELECT TRUE, v_grant_id, 'Sucesso'::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, format('Erro: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. ADICIONAR CONSTRAINT: source='manual-grant' REQUER granted_by NOT NULL
-- ============================================================================
ALTER TABLE roleta_grants
ADD CONSTRAINT check_manual_grant_requires_granted_by
  CHECK (source != 'manual-grant' OR granted_by IS NOT NULL);

-- ============================================================================
-- 8. INSERIR DADOS PADRÃO (Vendedores)
-- ============================================================================
INSERT INTO roleta_settings (seller_key, roleta_existe, roleta_ativa)
VALUES
  ('maria', true, true),
  ('nicolas', true, true),
  ('kennyd', true, true),
  ('gabriel', true, true)
ON CONFLICT (seller_key) DO NOTHING;

-- ============================================================================
-- 9. VERIFICAÇÃO FINAL
-- ============================================================================
-- Verificar que as tabelas foram criadas
DO $$
DECLARE
  table_count INT;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_name IN ('roleta_settings', 'roleta_grants', 'roleta_spins', 'roleta_revocation_log')
    AND table_schema = 'public';

  IF table_count = 4 THEN
    RAISE NOTICE 'SUCCESS: Todas as 4 tabelas foram criadas com sucesso!';
  ELSE
    RAISE NOTICE 'WARNING: Apenas % de 4 tabelas foram encontradas', table_count;
  END IF;
END $$;

-- ============================================================================
-- 10. COMMIT TRANSAÇÃO
-- ============================================================================
COMMIT;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
-- ✅ Se você viu "SUCCESS: Todas as 4 tabelas..." acima, tudo funcionou!
-- ============================================================================
