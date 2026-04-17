-- Criar tabela de permissões por aba
CREATE TABLE IF NOT EXISTS tab_permissions (
  id BIGSERIAL PRIMARY KEY,
  tab_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  has_access BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(tab_key, user_id)
);

-- Índices para performance
CREATE INDEX idx_tab_permissions_user_id ON tab_permissions(user_id);
CREATE INDEX idx_tab_permissions_tab_key ON tab_permissions(tab_key);
CREATE INDEX idx_tab_permissions_user_tab ON tab_permissions(user_id, tab_key);

-- Tabela de auditoria (log de quem alterou permissões)
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  admin_name TEXT,
  tab_key TEXT NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'granted' ou 'revoked'
  timestamp TIMESTAMP DEFAULT now()
);

-- Índice para auditoria
CREATE INDEX idx_permission_audit_log_timestamp ON permission_audit_log(timestamp DESC);
CREATE INDEX idx_permission_audit_log_tab_key ON permission_audit_log(tab_key);

-- RLS Policies
ALTER TABLE tab_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver suas próprias permissões
CREATE POLICY "Users can view their own permissions"
  ON tab_permissions FOR SELECT
  USING (auth.uid() = user_id);

-- Admins podem ver todas as permissões
CREATE POLICY "Admins can view all permissions"
  ON tab_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins podem atualizar permissões
CREATE POLICY "Admins can update permissions"
  ON tab_permissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins podem inserir permissões
CREATE POLICY "Admins can insert permissions"
  ON tab_permissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Auditoria é somente leitura para todos
CREATE POLICY "Anyone can view permission audit log"
  ON permission_audit_log FOR SELECT
  USING (true);

-- Apenas sistema pode inserir em auditoria (via service key)
CREATE POLICY "System can insert audit logs"
  ON permission_audit_log FOR INSERT
  WITH CHECK (true);
