-- Configuração de acesso por vendedor
CREATE TABLE IF NOT EXISTS roleta_settings (
  seller_key TEXT PRIMARY KEY,
  roleta_existe BOOLEAN DEFAULT true,
  roleta_ativa BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES auth.users,
  CONSTRAINT valid_seller_key CHECK (seller_key IN ('maria', 'nicolas', 'kennyd', 'gabriel'))
);

-- Auditoria: cada giro gerado (auto ou manual)
CREATE TABLE IF NOT EXISTS roleta_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_key TEXT NOT NULL REFERENCES roleta_settings(seller_key),
  wheel TEXT NOT NULL CHECK (wheel IN ('alta', 'baixa')),
  source TEXT NOT NULL CHECK (source IN ('auto-closing', 'manual-grant')),
  origin_id TEXT, -- closing_id se for auto, null se for manual
  granted_by UUID REFERENCES auth.users,
  created_at TIMESTAMP DEFAULT now(),
  spin_status TEXT DEFAULT 'pending' CHECK (spin_status IN ('pending', 'used', 'revoked'))
);

-- Histórico: cada vez que vendedor girou
CREATE TABLE IF NOT EXISTS roleta_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES roleta_grants(id),
  seller_key TEXT NOT NULL,
  result TEXT, -- prêmio obtido
  spun_at TIMESTAMP DEFAULT now(),
  spun_by UUID REFERENCES auth.users
);

-- Indexes para performance
CREATE INDEX idx_roleta_grants_seller ON roleta_grants(seller_key);
CREATE INDEX idx_roleta_grants_status ON roleta_grants(spin_status);
CREATE INDEX idx_roleta_spins_seller ON roleta_spins(seller_key);

-- Inserir configurações padrão
INSERT INTO roleta_settings (seller_key, roleta_existe, roleta_ativa) VALUES
  ('maria', true, true),
  ('nicolas', true, true),
  ('kennyd', true, true),
  ('gabriel', true, true)
ON CONFLICT (seller_key) DO NOTHING;
