-- Migration 002: Adicionar função com lock pessimista para revogação segura
-- Previne race conditions em múltiplas revogações simultâneas

-- Criar tabela de auditoria de revogações (se não existir)
CREATE TABLE IF NOT EXISTS roleta_revocation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES roleta_grants(id),
  revoked_by UUID REFERENCES auth.users,
  revoked_at TIMESTAMP DEFAULT now(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_revocation_log_grant_id
  ON roleta_revocation_log(grant_id);

-- Função com lock pessimista para revogação segura
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
  -- Obter lock pessimista na primeira grant pendente (FOR UPDATE bloqueia outras transações)
  SELECT id, spin_status INTO v_grant_id, v_current_status
  FROM roleta_grants
  WHERE seller_key = p_seller_key
    AND wheel = p_wheel
    AND spin_status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE; -- LOCK PESSIMISTA: Garante que nenhuma outra transação pega o mesmo grant

  IF v_grant_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Nenhum grant pendente encontrado'::TEXT;
    RETURN;
  END IF;

  IF v_current_status != 'pending' THEN
    RETURN QUERY SELECT FALSE, v_grant_id, format('Grant já foi utilizado ou revogado (status=%L)', v_current_status)::TEXT;
    RETURN;
  END IF;

  -- Atualizar com lock mantido (transação não pode ser interrompida)
  UPDATE roleta_grants
  SET spin_status = 'revoked'
  WHERE id = v_grant_id;

  -- Log de auditoria
  INSERT INTO roleta_revocation_log (grant_id, revoked_by, reason)
  VALUES (v_grant_id, p_revoked_by, 'Revogado via admin UI');

  RETURN QUERY SELECT TRUE, v_grant_id, 'Sucesso'::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, format('Erro: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Adicionar constraint: se source='manual-grant' ENTÃO granted_by NOT NULL
ALTER TABLE roleta_grants
ADD CONSTRAINT check_manual_grant_requires_granted_by
  CHECK (source != 'manual-grant' OR granted_by IS NOT NULL);

-- Criar índices adicionais para performance
CREATE INDEX IF NOT EXISTS idx_roleta_grants_seller_status
  ON roleta_grants(seller_key, spin_status);

CREATE INDEX IF NOT EXISTS idx_roleta_grants_pending_origin
  ON roleta_grants(origin_id, spin_status)
  WHERE spin_status = 'pending';

-- Remover redundância: seller_key em roleta_spins (será recuperado via JOIN com roleta_grants)
ALTER TABLE roleta_spins
DROP COLUMN IF EXISTS seller_key;

-- Recriar índice em roleta_spins (sem seller_key)
DROP INDEX IF EXISTS idx_roleta_spins_seller;
CREATE INDEX IF NOT EXISTS idx_roleta_spins_grant_id
  ON roleta_spins(grant_id);
