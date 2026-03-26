-- ================================================================
-- FUNIL GPS.X — Setup inicial do banco de dados
-- Execute no Supabase: SQL Editor → New query → Cole e clique em Run
-- ================================================================

-- Tabela de perfis (vinculada ao auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email        TEXT,
  seller_key   TEXT,        -- 'maria' | 'nicolas' | 'kennyd' | 'gabriel' | null (admin puro)
  display_name TEXT,
  role         TEXT DEFAULT 'seller' CHECK (role IN ('seller', 'admin')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Tabela de histórico de prêmios da roleta
CREATE TABLE IF NOT EXISTS public.prize_history (
  id             TEXT PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  seller_key     TEXT NOT NULL,
  seller_name    TEXT,
  wheel          TEXT CHECK (wheel IN ('alta', 'baixa')),
  prize_label    TEXT NOT NULL,
  prize_color    TEXT,
  closing_id     TEXT,
  closing_name   TEXT,
  closing_valor  NUMERIC,
  source         TEXT DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'cancelled')),
  delivered_at   TIMESTAMPTZ,
  delivered_by   UUID REFERENCES auth.users(id),
  notes          TEXT
);

ALTER TABLE public.prize_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendedor vê próprios prêmios"
  ON public.prize_history FOR SELECT
  USING (
    seller_key = (SELECT seller_key FROM public.profiles WHERE id = auth.uid())
    OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admin gerencia prêmios"
  ON public.prize_history FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Trigger: cria perfil automaticamente quando usuário se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
