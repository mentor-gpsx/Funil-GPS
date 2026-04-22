#!/bin/bash
# Automated Supabase Migration Deployment
# Executes all roleta system migrations via Supabase CLI

set -e  # Exit on error

echo "🚀 Roleta System Migration Deployment"
echo "═══════════════════════════════════════"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
  echo "❌ Supabase CLI not found"
  echo ""
  echo "Install via:"
  echo "  npm install -g supabase"
  echo ""
  echo "Or follow: https://supabase.com/docs/guides/cli/getting-started"
  exit 1
fi

echo "✓ Supabase CLI found"
echo ""

# Check if we're in the right directory
if [ ! -d "migrations" ]; then
  echo "❌ migrations/ directory not found"
  echo ""
  echo "Run this script from: C:\\Users\\venda\\Documents\\funil-gps"
  exit 1
fi

echo "✓ migrations/ directory found"
echo ""

# List migrations to be executed
echo "📋 Migrations to execute:"
ls -1 migrations/*.sql | while read file; do
  echo "  - $(basename "$file")"
done
echo ""

# Push migrations to Supabase
echo "🔄 Pushing migrations to Supabase..."
supabase db push

echo ""
echo "═══════════════════════════════════════"
echo "✅ Migrations deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Verify in Supabase Dashboard → SQL Editor"
echo "2. Run validation queries from PHASE_C_FINAL_DEPLOYMENT.md"
echo "3. Test with TEST 1-9 from deployment guide"
echo "4. Check funil.html console for [Roleta] logs"
echo ""
