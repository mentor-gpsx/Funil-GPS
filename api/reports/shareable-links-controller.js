const { createClient } = require('@supabase/supabase-js');
const { generateToken } = require('../../services/token-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Task 7.4: Shareable read-only links
// Generate a shareable link for a report (read-only access for stakeholders)
async function createShareableLink(reportData, options = {}) {
  try {
    const {
      report_type,     // 'dre', 'cash_flow', 'metrics', 'forecast'
      report_period,   // '2026-04', '2026-Q1', etc.
      expires_in,      // days until link expires (default: 30)
      recipient_name,  // name of recipient (optional)
      recipient_email  // email of recipient (optional)
    } = options;

    const token = generateToken(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expires_in || 30));

    const { data, error } = await supabase
      .from('report_shares')
      .insert({
        token,
        report_type,
        report_period,
        report_data: reportData,
        recipient_name,
        recipient_email,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        access_count: 0,
        last_accessed: null
      })
      .select()
      .single();

    if (error) throw error;

    const shareUrl = `${process.env.API_BASE_URL}/api/reports/shared/${token}`;

    return {
      success: true,
      shareUrl,
      token,
      expiresAt,
      recipientName: recipient_name,
      recipientEmail: recipient_email
    };
  } catch (error) {
    throw new Error(`Failed to create shareable link: ${error.message}`);
  }
}

// Get report via shareable link (read-only access)
async function getSharedReport(token) {
  try {
    const { data, error } = await supabase
      .from('report_shares')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      throw new Error('Invalid or expired share link');
    }

    // Check if link has expired
    if (new Date(data.expires_at) < new Date()) {
      throw new Error('Share link has expired');
    }

    // Update access tracking
    await supabase
      .from('report_shares')
      .update({
        access_count: data.access_count + 1,
        last_accessed: new Date().toISOString()
      })
      .eq('token', token);

    return {
      success: true,
      reportType: data.report_type,
      reportPeriod: data.report_period,
      reportData: data.report_data,
      sharedBy: data.recipient_name,
      sharedAt: data.created_at,
      readOnly: true
    };
  } catch (error) {
    throw new Error(`Failed to retrieve shared report: ${error.message}`);
  }
}

// List all active shares for a tenant
async function listActiveShares(tenantId) {
  try {
    const { data, error } = await supabase
      .from('report_shares')
      .select('token, report_type, report_period, recipient_name, recipient_email, created_at, expires_at, access_count')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    return {
      success: true,
      shares: data || []
    };
  } catch (error) {
    throw new Error(`Failed to list shares: ${error.message}`);
  }
}

// Revoke a shareable link
async function revokeShareableLink(token) {
  try {
    const { error } = await supabase
      .from('report_shares')
      .update({ expires_at: new Date().toISOString() })
      .eq('token', token);

    if (error) throw error;

    return { success: true, message: 'Share link revoked' };
  } catch (error) {
    throw new Error(`Failed to revoke share: ${error.message}`);
  }
}

// Express route handler: POST /api/reports/shares
async function handleCreateShare(req, res) {
  try {
    const { reportType, reportPeriod, reportData, expiresIn, recipientName, recipientEmail } = req.body;

    const result = await createShareableLink(reportData, {
      report_type: reportType,
      report_period: reportPeriod,
      expires_in: expiresIn,
      recipient_name: recipientName,
      recipient_email: recipientEmail
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// Express route handler: GET /api/reports/shared/:token
async function handleGetShared(req, res) {
  try {
    const { token } = req.params;
    const result = await getSharedReport(token);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

// Express route handler: GET /api/reports/shares/list
async function handleListShares(req, res) {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await listActiveShares(tenantId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// Express route handler: DELETE /api/reports/shares/:token
async function handleRevokeShare(req, res) {
  try {
    const { token } = req.params;
    const result = await revokeShareableLink(token);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

module.exports = {
  createShareableLink,
  getSharedReport,
  listActiveShares,
  revokeShareableLink,
  handleCreateShare,
  handleGetShared,
  handleListShares,
  handleRevokeShare
};
