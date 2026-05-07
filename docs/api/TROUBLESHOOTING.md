# Financial Reports Troubleshooting Guide

**Version:** 1.0  
**Last Updated:** 2026-05-07

## Common Issues & Solutions

### API & Endpoint Issues

#### 1. "Invalid Period Format" Error

**Symptom:**
```json
{
  "status": "error",
  "error": "Invalid period format. Use YYYY-MM, YYYY-Q[1-4], or YYYY"
}
```

**Root Causes:**
- Period string malformed (missing dashes, wrong separators)
- Month out of range (00 or 13+)
- Quarter invalid (Q0, Q5+)

**Solutions:**

1. **Validate period format before sending:**
   ```javascript
   // ✓ Correct formats
   const valid = [
     '2026-05',      // Monthly: YYYY-MM
     '2026-Q1',      // Quarterly: YYYY-Q[1-4]
     '2026'          // Annual: YYYY
   ];
   
   // ✗ Common mistakes
   const invalid = [
     '2026/05',      // Wrong separator (/ instead of -)
     '26-05',        // 2-digit year
     '2026-5',       // Missing leading zero on month
     '2026-Q0',      // Invalid quarter
     '2026-13',      // Month 13 (doesn't exist)
   ];
   ```

2. **Check month range:**
   ```javascript
   const month = parseInt(period.split('-')[1]);
   if (month < 1 || month > 12) {
     throw new Error(`Month ${month} is out of range (1-12)`);
   }
   ```

3. **Verify quarter values:**
   ```javascript
   const quarter = period.match(/Q(\d)/)?.[1];
   if (quarter && (quarter < 1 || quarter > 4)) {
     throw new Error(`Quarter ${quarter} is invalid (1-4)`);
   }
   ```

---

#### 2. "Missing or Invalid Authentication Token" (401)

**Symptom:**
```json
{
  "status": "error",
  "error": "Missing or invalid authentication token"
}
```

**Root Causes:**
- No Authorization header provided
- Bearer token missing or malformed
- Token expired
- Token revoked/invalidated

**Solutions:**

1. **Include Authorization header:**
   ```bash
   # ✗ Missing header
   curl "https://api.example.com/api/reports/dre?period=2026-05"
   
   # ✓ With token
   curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     "https://api.example.com/api/reports/dre?period=2026-05"
   ```

2. **Verify token format:**
   ```javascript
   // Token should be: "Bearer {jwt_token}"
   const auth = request.headers.authorization;
   
   if (!auth || !auth.startsWith('Bearer ')) {
     throw new Error('Invalid authorization header format');
   }
   ```

3. **Check token expiration:**
   ```bash
   # Decode JWT to check expiration
   jwt.verify(token, secret, (err, decoded) => {
     if (err?.name === 'TokenExpiredError') {
       console.error('Token expired at:', err.expiredAt);
       // Refresh token
     }
   });
   ```

4. **Generate new token:**
   ```bash
   # Contact your admin or use auth endpoint
   curl -X POST "https://api.example.com/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com", "password":"***"}'
   ```

---

#### 3. "Insufficient Permissions for This Operation" (403)

**Symptom:**
```json
{
  "status": "error",
  "error": "Insufficient permissions for this operation"
}
```

**Root Causes:**
- User role lacks required permissions
- Tenant isolation violation (accessing other tenant's data)
- Feature not enabled for this account

**Solutions:**

1. **Check user role and permissions:**
   ```javascript
   // Admin: all permissions
   // Finance Manager: read DRE, cash flow, metrics
   // Accountant: read only, cannot modify
   
   const userRole = decoded.role;
   const requiredRole = 'finance_manager';
   
   if (!hasPermission(userRole, requiredRole)) {
     throw new Error('User role lacks required permissions');
   }
   ```

2. **Verify tenant isolation:**
   ```javascript
   // Extract tenant_id from token
   const tokenTenant = decoded.tenant_id;
   
   // Extract tenant_id from request (header or query)
   const requestTenant = request.headers['x-tenant-id'];
   
   if (tokenTenant !== requestTenant) {
     throw new Error('Tenant mismatch - cannot access other tenant data');
   }
   ```

3. **Contact admin for role upgrade:**
   - Email: admin@company.com
   - Provide: User email, Required role, Reason

---

#### 4. "Database Connection Failed" (500 with cached fallback)

**Symptom:**
```json
{
  "status": "error",
  "error": "Database connection failed. Using cached report.",
  "data": {
    "cache_age_minutes": 120,
    "warning": "Data may be stale"
  }
}
```

**Root Causes:**
- PostgreSQL server unavailable
- Network connectivity issue
- Database credentials misconfigured
- Connection pool exhausted

**Solutions:**

1. **Check database connectivity:**
   ```bash
   # Test connection to database
   psql -h db.example.com -U user -d database -c "SELECT 1"
   
   # If fails, check:
   # - Host is reachable: ping db.example.com
   # - Port is open: telnet db.example.com 5432
   # - Credentials are correct
   # - Database exists
   ```

2. **Verify connection string:**
   ```env
   # Format: postgresql://user:password@host:port/database
   DATABASE_URL=postgresql://user:password@localhost:5432/gps_x
   ```

3. **Check connection pool:**
   ```javascript
   // Monitor active connections
   SELECT count(*) FROM pg_stat_activity;
   
   // If near max, increase pool size in config:
   DATABASE_POOL_SIZE=20
   ```

4. **Wait for cache expiration:**
   - Cached reports are fresh for their TTL period
   - Monthly (completed): No expiration
   - Monthly (current): 6 hours
   - Cash flow: 1 hour
   - Forecast: 24 hours

---

### Calculation & Data Issues

#### 5. "Orphaned Charges" Warning

**Symptom:**
Validation check shows orphaned charges detected.

**What it means:**
Charges without valid subscription reference. May indicate:
- Manual charge creation
- Subscription deletion after charge creation
- Data import errors

**How to fix:**

1. **Identify orphaned charges:**
   ```bash
   curl -H "Authorization: Bearer TOKEN" \
     "https://api.example.com/api/reports/validate"
   
   # Response will list affected charge IDs
   ```

2. **Link charges to subscriptions:**
   ```sql
   UPDATE charges 
   SET subscription_id = (
     SELECT id FROM subscriptions 
     WHERE customer_id = charges.customer_id 
     LIMIT 1
   )
   WHERE subscription_id IS NULL;
   ```

3. **Or void problematic charges:**
   ```sql
   UPDATE charges 
   SET status = 'voided',
       voided_reason = 'Orphaned charge - no valid subscription'
   WHERE subscription_id IS NULL;
   ```

4. **Notify finance team:**
   Document which charges were reassigned for audit purposes.

---

#### 6. "Duplicate Payment" Warning

**Symptom:**
Multiple charges with identical gateway_id detected.

**Root Causes:**
- Payment gateway retry logic created duplicates
- Manual charge entry
- System crash during payment processing
- Race condition in charge creation

**How to fix:**

1. **Identify duplicates:**
   ```bash
   curl -H "Authorization: Bearer TOKEN" \
     "https://api.example.com/api/reports/validate"
   ```

2. **Review and decide:**
   - Keep newest, void older
   - Keep oldest, void newer
   - Create refund for one copy

3. **Void duplicate:**
   ```sql
   UPDATE charges 
   SET status = 'voided',
       voided_reason = 'Duplicate - gateway_id matches charge #12345'
   WHERE id = 12346;
   ```

4. **Issue refund if already paid:**
   ```sql
   INSERT INTO refunds (charge_id, reason, amount_cents)
   VALUES (12346, 'Duplicate payment voided', amount_cents);
   ```

---

#### 7. MRR Calculation Seems Wrong

**Symptom:**
MRR value doesn't match expected amount.

**Possible Causes:**

1. **Subscription status filter issue:**
   ```javascript
   // ✗ Wrong: Includes canceled subscriptions
   const mrr = subscriptions
     .reduce((sum, s) => sum + s.plan.amount_cents, 0) / 100;
   
   // ✓ Correct: Only active subscriptions
   const mrr = subscriptions
     .filter(s => s.status === 'active')
     .reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100;
   ```

2. **Null plan handling:**
   ```javascript
   // ✗ Wrong: Crashes if plan is null
   sum + s.plan.amount_cents
   
   // ✓ Correct: Handles null/undefined
   sum + (s.plan?.amount_cents || 0)
   ```

3. **Billing cycle normalization:**
   ```javascript
   // For annual subscriptions, divide by 12
   const monthlyAmount = s.billing_cycle === 'annual'
     ? s.amount_cents / 12
     : s.amount_cents;
   ```

**Debug steps:**

1. Query active subscriptions directly:
   ```sql
   SELECT COUNT(*), SUM(plan->>'amount_cents')::numeric / 100 as mrr
   FROM subscriptions
   WHERE status = 'active'
     AND tenant_id = 'your-tenant-id';
   ```

2. Compare with API response:
   ```bash
   curl -H "Authorization: Bearer TOKEN" \
     "https://api.example.com/api/reports/metrics?period=2026-05"
   ```

3. Check for hidden filters:
   - Tenant isolation active?
   - Date range filters applied?
   - Subscription visibility settings?

---

#### 8. Cash Flow Doesn't Balance

**Symptom:**
Opening balance + net cash ≠ closing balance

**Formula Check:**
```
closing = opening + inflows - outflows
```

**Possible Issues:**

1. **Missing transactions:**
   ```sql
   -- Find charges not in inflows
   SELECT c.* FROM charges c
   WHERE c.status = 'paid'
     AND DATE(c.paid_at) = '2026-05-07'
     AND c.id NOT IN (
       SELECT charge_id FROM cash_flow_transactions 
       WHERE date = '2026-05-07'
     );
   ```

2. **Unaccounted refunds:**
   ```sql
   -- Find refunds not in outflows
   SELECT r.* FROM refunds r
   WHERE DATE(r.created_at) = '2026-05-07'
     AND r.id NOT IN (
       SELECT refund_id FROM cash_flow_transactions
       WHERE date = '2026-05-07'
     );
   ```

3. **Time zone issues:**
   - Timestamps stored in UTC
   - May span midnight differently in local time
   - Use consistent timezone: UTC for storage, local for display

4. **Rounding errors:**
   ```javascript
   // ✗ May have floating point errors
   opening + inflows - outflows === closing
   
   // ✓ Compare with tolerance
   Math.abs((opening + inflows - outflows) - closing) < 0.01  // 1 cent
   ```

---

#### 9. Forecast Accuracy Low

**Symptom:**
Actual revenue differs significantly from forecast.

**Root Causes:**

1. **Churn rate changed:**
   - More subscriptions canceled than expected
   - Use higher confidence factor for forecast

2. **Seasonal effects:**
   - Holiday periods affect payment timing
   - Weekend/weekday patterns not accounted for

3. **Payment method distribution:**
   - More CC (40% confidence) vs PIX (95%)
   - Adjust confidence weights

4. **Date range issues:**
   - Forecast based on `next_charge_date` which may be unreliable
   - Some subscriptions have no next_charge_date set

**How to improve:**

1. **Adjust confidence factors per method:**
   ```javascript
   // Update if seeing consistent patterns
   const confidence = {
     PIX: 0.95,        // High reliability
     Boleto: 0.70,     // Medium (slower processing)
     CreditCard: 0.40  // Low (chargebacks, failures)
   };
   ```

2. **Account for churn:**
   ```javascript
   const churnFactor = 1 - (churnRate / 100);
   const forecast = projectedRevenue * churnFactor;
   ```

3. **Use historical accuracy:**
   ```javascript
   // Track forecast accuracy for past months
   const accuracy = (actual - forecast) / forecast;
   
   // Adjust confidence based on history
   const adjustedConfidence = baseConfidence * (1 - Math.abs(accuracy));
   ```

---

### Export Issues

#### 10. PDF Export Fails or Looks Wrong

**Symptom:**
Export fails or PDF displays incorrectly.

**Possible Causes:**

1. **Large datasets (> 5MB):**
   - PDF generation times out
   - Reduce date range or split into multiple exports

   **Solution:**
   ```bash
   # Export monthly instead of yearly
   curl -H "Authorization: Bearer TOKEN" \
     "https://api.example.com/api/reports/dre/export/pdf?period=2026-05"
   ```

2. **Special characters not rendering:**
   - Non-ASCII characters (ç, ã, õ) may have encoding issues

   **Solution:**
   - Verify UTF-8 encoding in PDF generation:
   ```javascript
   const doc = new PDFDocument({ encoding: 'utf8' });
   ```

3. **Missing fonts:**
   - PDF tries to use system fonts that don't exist
   - Falls back to default (may look ugly)

   **Solution:**
   - Embed fonts in PDF:
   ```javascript
   doc.font('Helvetica', 11);  // Use standard font
   doc.fontSize(11);
   ```

4. **Page breaks mid-table:**
   - Large tables split awkwardly across pages

   **Solution:**
   - Increase page size or reduce font size
   - Implement better pagination logic

---

#### 11. CSV Import Fails in Excel

**Symptom:**
Excel can't open CSV or data appears corrupted.

**Root Causes:**

1. **Missing UTF-8 BOM:**
   ```javascript
   // ✗ Wrong: Excel doesn't detect UTF-8
   fs.writeFileSync('report.csv', csvContent);
   
   // ✓ Correct: Add BOM for Excel compatibility
   const bom = '﻿';
   fs.writeFileSync('report.csv', bom + csvContent);
   ```

2. **Unescaped special characters:**
   ```csv
   # ✗ Wrong: Comma inside unquoted field
   Silva, João,2026-05-01,150000
   
   # ✓ Correct: Quoted field with comma
   "Silva, João",2026-05-01,150000
   ```

3. **Line ending issues (Windows vs Unix):**
   ```javascript
   // Use CRLF for Windows compatibility
   const csv = rows.join('\r\n');  // CRLF
   ```

---

#### 12. Excel Formulas Not Calculating

**Symptom:**
Excel cells show formula text instead of calculated values.

**Root Causes:**

1. **Column format is text:**
   - Excel treats formula as text string

   **Solution in Excel:**
   - Select column → Format Cells → Number
   - Press F2 then Enter on cells with formulas

2. **Circular references:**
   ```excel
   # ✗ Wrong: Cell A1 references A1
   =A1+100
   
   # ✓ Correct: Reference different cell
   =B1+100
   ```

3. **Broken sheet references:**
   ```excel
   # If sheets are renamed, formulas break
   # ✗ Wrong: =Sheet1!A1 (if sheet renamed to "DRE")
   # ✓ Correct: =DRE!A1
   ```

---

#### 13. Excel File Too Large/Slow

**Symptom:**
Excel file is > 10MB or opens very slowly.

**Root Causes:**

1. **Too many rows:**
   - Excel struggles with > 100K rows

   **Solution:**
   - Export for specific time period
   - Use CSV instead for large datasets
   - Split into multiple sheets

2. **Complex formatting:**
   - Conditional formatting on all cells slows calculation

   **Solution in xlsx library:**
   ```javascript
   // Only apply formatting where needed
   worksheet.getCell('B2').fill = {
     type: 'pattern',
     pattern: 'solid',
     fgColor: { argb: 'FF00AA00' }
   };
   ```

3. **Large images/charts:**
   - Embedded charts increase file size

   **Solution:**
   - Remove unnecessary formatting
   - Use simple data tables instead

---

### Performance Issues

#### 14. API Response Slow (> 2 seconds)

**Symptom:**
DRE endpoint takes > 2 second target.

**Root Causes:**

1. **Missing database indexes:**
   ```sql
   -- Check if indexes exist
   SELECT * FROM pg_indexes 
   WHERE tablename IN ('charges', 'subscriptions')
   ```

   **Create missing indexes:**
   ```sql
   CREATE INDEX idx_charges_status_date ON charges(status, paid_at);
   CREATE INDEX idx_charges_tenant_date ON charges(tenant_id, paid_at);
   CREATE INDEX idx_subscriptions_status ON subscriptions(status);
   ```

2. **Large date ranges:**
   - Querying 10 years of data = slow
   - Limit to reasonable ranges

   **Solution:**
   ```javascript
   // Cap to 24 months max
   const maxDays = 24 * 30;
   if (daysDiff > maxDays) {
     return { error: 'Date range too large (max 24 months)' };
   }
   ```

3. **No caching:**
   - Recalculating same report multiple times

   **Solution:**
   - Implement cache with TTL:
   ```javascript
   const cacheKey = `dre:${tenantId}:${period}`;
   const cached = cache.get(cacheKey);
   
   if (cached && Date.now() - cached.timestamp < TTL) {
     return cached.data;
   }
   ```

4. **Sequential queries instead of parallel:**
   ```javascript
   // ✗ Slow: Sequential queries
   const charges = await db.query('SELECT * FROM charges WHERE ...');
   const subscriptions = await db.query('SELECT * FROM subscriptions WHERE ...');
   
   // ✓ Fast: Parallel queries
   const [charges, subscriptions] = await Promise.all([
     db.query('SELECT * FROM charges WHERE ...'),
     db.query('SELECT * FROM subscriptions WHERE ...')
   ]);
   ```

---

#### 15. High Memory Usage

**Symptom:**
API process consumes > 1GB RAM, crashes under load.

**Root Causes:**

1. **Loading entire dataset into memory:**
   ```javascript
   // ✗ Wrong: Load all 1M charges at once
   const charges = await db.query('SELECT * FROM charges');
   
   // ✓ Correct: Stream or paginate
   const charges = await db.query('SELECT * FROM charges LIMIT 10000');
   ```

2. **Memory leaks in event listeners:**
   ```javascript
   // ✗ Wrong: Never removes listener
   eventEmitter.on('charge', handler);
   
   // ✓ Correct: Remove listener when done
   eventEmitter.on('charge', handler);
   // Later:
   eventEmitter.removeListener('charge', handler);
   ```

3. **Unbounded cache:**
   ```javascript
   // ✗ Wrong: Cache grows indefinitely
   const cache = {};
   cache[key] = largeData;  // Memory leak
   
   // ✓ Correct: Implement size limit
   const maxCacheSize = 1000;
   if (Object.keys(cache).length > maxCacheSize) {
     delete cache[Object.keys(cache)[0]];  // Remove oldest
   }
   ```

---

### Authentication & Authorization

#### 16. "Insufficient Permissions" on Scheduled Reports

**Symptom:**
Scheduled reports fail with 403 error.

**Root Causes:**

1. **Service account permissions:**
   - Service account used for scheduling lacks permissions

   **Solution:**
   ```bash
   # Check service account role
   SELECT role FROM users 
   WHERE email = 'scheduler@internal.example.com';
   
   # Grant required role
   UPDATE users 
   SET role = 'finance_manager'
   WHERE email = 'scheduler@internal.example.com';
   ```

2. **Token expiration:**
   - Scheduler's token expired

   **Solution:**
   - Implement token refresh logic:
   ```javascript
   if (isTokenExpired(token)) {
     token = await refreshToken(token);
   }
   ```

---

### Tenant Isolation Issues

#### 17. Seeing Other Tenant's Data

**Symptom:**
API returns data from other tenants.

**Root Causes:**

1. **Missing WHERE clause in queries:**
   ```sql
   -- ✗ Wrong: No tenant filter
   SELECT * FROM charges;
   
   -- ✓ Correct: Filter by tenant
   SELECT * FROM charges WHERE tenant_id = $1;
   ```

2. **RLS policies not enabled:**
   ```sql
   -- Check RLS is enabled
   SELECT * FROM pg_tables 
   WHERE tablename = 'charges' AND rowsecurity = true;
   ```

   **Enable RLS:**
   ```sql
   ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY charges_isolation ON charges
   FOR ALL USING (tenant_id = current_setting('app.tenant_id'));
   ```

3. **Cross-tenant token usage:**
   - Token from tenant A used to access tenant B

   **Solution:**
   - Validate token tenant matches request tenant:
   ```javascript
   if (tokenTenant !== requestTenant) {
     return { status: 403, error: 'Tenant mismatch' };
   }
   ```

---

## Debugging Checklist

When facing issues, work through this checklist:

- [ ] Check API response status code and error message
- [ ] Verify authentication token is valid and not expired
- [ ] Confirm period format matches requirements (YYYY-MM, YYYY-Q[1-4], YYYY)
- [ ] Verify tenant_id in token matches request
- [ ] Check database connectivity and query logs
- [ ] Review validation check for data integrity issues
- [ ] Look for orphaned charges or duplicate payments
- [ ] Confirm database indexes exist
- [ ] Use explain plan to optimize slow queries
- [ ] Check system logs for errors:
  ```bash
  tail -f logs/api.log
  tail -f logs/postgres.log
  ```

---

## Getting Help

**Internal Resources:**
- API Documentation: `/docs/api/FINANCIAL-REPORTS-API.md`
- Calculations: `/docs/api/CALCULATIONS.md`
- Test Suite: `/tests/reports/`

**Support:**
- Email: support@gps-x.com.br
- Slack: #finance-reports
- Issue Tracker: jira.company.com

**Include When Reporting Issues:**
1. Exact error message and response
2. Request URL and parameters
3. Timestamp of issue
4. Tenant ID (obscured if sensitive)
5. Steps to reproduce
6. Expected vs actual behavior

