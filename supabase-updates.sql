-- ================================================================
-- FUNIL GPS.X — Atualizações de permissões
-- Execute no Supabase: SQL Editor → New query → Cole e clique em Run
-- ================================================================

-- 1. Corrigir roles: Gabriel e Kennyd → admin; mentoriajobsx → seller
UPDATE public.profiles SET role = 'admin'  WHERE email = 'gabrielfontelas.gps@gmail.com';
UPDATE public.profiles SET role = 'admin'  WHERE email = 'kennydwillker@gmail.com';
UPDATE public.profiles SET role = 'seller' WHERE email = 'mentoriajobsx@gmail.com';
-- Nicolas já está como seller — sem alteração necessária

-- 2. Permitir que sellers insiram seus próprios registros de giro
-- (admins já têm via "Admin gerencia prêmios" FOR ALL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prize_history'
      AND policyname = 'Vendedor insere próprios prêmios'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Vendedor insere próprios prêmios"
        ON public.prize_history FOR INSERT
        WITH CHECK (
          seller_key = (SELECT seller_key FROM public.profiles WHERE id = auth.uid())
        )
    $p$;
  END IF;
END
$$;
