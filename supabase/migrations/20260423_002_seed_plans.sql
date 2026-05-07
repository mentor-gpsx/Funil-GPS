-- Migration: Seed Initial Plans
-- Date: 2026-04-23
-- Description: Insert default plans (Starter, Pro, Enterprise)

INSERT INTO plans (name, amount_cents, interval, description)
VALUES
  ('Starter', 14990, 'monthly', 'Basic plan: 1 funil, 10 clientes, suporte por email'),
  ('Pro', 29990, 'monthly', 'Professional plan: 5 funis, 100 clientes, suporte prioritário'),
  ('Enterprise', 99990, 'monthly', 'Enterprise plan: Funis ilimitados, API completa, onboarding dedicado')
ON CONFLICT (name) DO NOTHING;
