const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Task 7.5: Historical archive and searchability
// Store a generated report in the archive
async function archiveReport(reportData, metadata = {}) {
  try {
    const {
      report_type,      // 'dre', 'cash_flow', 'metrics', 'forecast'
      report_period,    // '2026-04', '2026-Q1', '2026', etc.
      format,           // 'json', 'pdf', 'csv', 'excel'
      generated_by,     // user ID or system
      file_path         // path to stored file (optional)
    } = metadata;

    const { data, error } = await supabase
      .from('report_archives')
      .insert({
        report_type,
        report_period,
        format,
        report_data: reportData,
        generated_by,
        file_path,
        created_at: new Date().toISOString(),
        file_size: JSON.stringify(reportData).length,
        checksum: generateChecksum(reportData)
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      archive_id: data.id,
      created_at: data.created_at
    };
  } catch (error) {
    throw new Error(`Failed to archive report: ${error.message}`);
  }
}

// Search historical reports with filters
async function searchArchive(filters = {}) {
  try {
    const {
      report_type,      // filter by type
      report_period,    // filter by period
      format,           // filter by format
      start_date,       // filter by creation date range
      end_date,
      search_term,      // search in report data (full-text search)
      limit = 50,
      offset = 0
    } = filters;

    let query = supabase
      .from('report_archives')
      .select('id, report_type, report_period, format, file_size, generated_by, created_at', { count: 'exact' });

    // Apply filters
    if (report_type) {
      query = query.eq('report_type', report_type);
    }
    if (report_period) {
      query = query.eq('report_period', report_period);
    }
    if (format) {
      query = query.eq('format', format);
    }
    if (start_date && end_date) {
      query = query
        .gte('created_at', start_date)
        .lte('created_at', end_date);
    }
    if (search_term) {
      // Full-text search on report data (PostgreSQL tsvector)
      query = query.textSearch('report_data', search_term);
    }

    // Pagination and sorting
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      success: true,
      results: data || [],
      total: count,
      limit,
      offset,
      hasMore: (offset + limit) < count
    };
  } catch (error) {
    throw new Error(`Failed to search archive: ${error.message}`);
  }
}

// Get a specific archived report
async function getArchivedReport(archiveId) {
  try {
    const { data, error } = await supabase
      .from('report_archives')
      .select('*')
      .eq('id', archiveId)
      .single();

    if (error || !data) {
      throw new Error('Report not found in archive');
    }

    // Verify data integrity
    const currentChecksum = generateChecksum(data.report_data);
    if (currentChecksum !== data.checksum) {
      console.warn(`Checksum mismatch for archived report ${archiveId}`);
    }

    return {
      success: true,
      reportType: data.report_type,
      reportPeriod: data.report_period,
      format: data.format,
      reportData: data.report_data,
      generatedBy: data.generated_by,
      generatedAt: data.created_at,
      fileSize: data.file_size,
      filePath: data.file_path
    };
  } catch (error) {
    throw new Error(`Failed to retrieve archived report: ${error.message}`);
  }
}

// List recent reports by type
async function getRecentReports(reportType, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('report_archives')
      .select('id, report_type, report_period, format, created_at, file_size')
      .eq('report_type', reportType)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      success: true,
      reports: data || []
    };
  } catch (error) {
    throw new Error(`Failed to get recent reports: ${error.message}`);
  }
}

// Delete old archived reports (cleanup)
async function deleteOldArchives(olderThanDays = 365) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await supabase
      .from('report_archives')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) throw error;

    return {
      success: true,
      message: `Deleted reports older than ${olderThanDays} days`
    };
  } catch (error) {
    throw new Error(`Failed to delete old archives: ${error.message}`);
  }
}

// Express route handlers

// POST /api/reports/archive
async function handleArchiveReport(req, res) {
  try {
    const { reportData, reportType, reportPeriod, format, generatedBy } = req.body;

    const result = await archiveReport(reportData, {
      report_type: reportType,
      report_period: reportPeriod,
      format,
      generated_by: generatedBy || req.user?.id
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// GET /api/reports/archive/search
async function handleSearchArchive(req, res) {
  try {
    const { reportType, reportPeriod, format, startDate, endDate, searchTerm, limit, offset } = req.query;

    const result = await searchArchive({
      report_type: reportType,
      report_period: reportPeriod,
      format,
      start_date: startDate,
      end_date: endDate,
      search_term: searchTerm,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// GET /api/reports/archive/:id
async function handleGetArchived(req, res) {
  try {
    const { id } = req.params;
    const result = await getArchivedReport(id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// GET /api/reports/archive/recent/:reportType
async function handleGetRecent(req, res) {
  try {
    const { reportType } = req.params;
    const { limit } = req.query;
    const result = await getRecentReports(reportType, parseInt(limit) || 10);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// Helper: Generate checksum for data integrity
function generateChecksum(data) {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

module.exports = {
  archiveReport,
  searchArchive,
  getArchivedReport,
  getRecentReports,
  deleteOldArchives,
  handleArchiveReport,
  handleSearchArchive,
  handleGetArchived,
  handleGetRecent
};
