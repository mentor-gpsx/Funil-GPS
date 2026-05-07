/**
 * api/reports/dre-validator.js
 * Validation utilities for DRE API requests
 * AC-9: Error handling & input validation
 */

/**
 * Validate DRE API request parameters
 * @param {Object} params - Request parameters
 * @param {string} params.period - Period in YYYY-MM, YYYY-Q1-Q4, or YYYY format
 * @param {boolean} params.compare - Whether to include comparison
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateDRERequest(params) {
  const errors = [];

  // Validate period format
  if (!params.period) {
    errors.push('period is required (format: YYYY-MM, YYYY-Q1-Q4, or YYYY)');
  } else if (!validatePeriodFormat(params.period)) {
    errors.push(`period "${params.period}" is invalid. Use YYYY-MM, YYYY-Q1-Q4, or YYYY`);
  }

  // Validate period range (not in future)
  if (params.period && !validatePeriodRange(params.period)) {
    errors.push(`period "${params.period}" is in the future`);
  }

  // Validate compare parameter
  if (params.compare !== undefined && typeof params.compare !== 'boolean') {
    errors.push('compare must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate period format string
 * Accepts: YYYY-MM, YYYY-Q1-Q4, YYYY
 * @param {string} period - Period string
 * @returns {boolean}
 */
function validatePeriodFormat(period) {
  if (!period || typeof period !== 'string') {
    return false;
  }

  // Monthly: YYYY-MM
  if (period.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = period.split('-').map(Number);
    return year >= 1900 && year <= 2100 && month >= 1 && month <= 12;
  }

  // Quarterly: YYYY-Q1-Q4
  if (period.match(/^\d{4}-Q[1-4]$/)) {
    const year = parseInt(period.substring(0, 4));
    return year >= 1900 && year <= 2100;
  }

  // Annually: YYYY
  if (period.match(/^\d{4}$/)) {
    const year = parseInt(period);
    return year >= 1900 && year <= 2100;
  }

  return false;
}

/**
 * Validate period is not in the future
 * @param {string} period - Period string
 * @returns {boolean}
 */
function validatePeriodRange(period) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Extract year and check
  const year = parseInt(period.substring(0, 4));
  if (year > currentYear) {
    return false;
  }

  // If same year, check month/quarter if applicable
  if (year === currentYear) {
    if (period.match(/^\d{4}-\d{2}$/)) {
      // Monthly period
      const month = parseInt(period.substring(5, 7));
      return month <= currentMonth;
    }

    if (period.match(/^\d{4}-Q[1-4]$/)) {
      // Quarterly period
      const quarter = parseInt(period.substring(6));
      const currentQuarter = Math.ceil(currentMonth / 3);
      return quarter <= currentQuarter;
    }
  }

  return true;
}

/**
 * Validate date range parameters
 * @param {string} fromDate - Start date in YYYY-MM format
 * @param {string} toDate - End date in YYYY-MM format
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateDateRange(fromDate, toDate) {
  const errors = [];

  if (fromDate && !validatePeriodFormat(fromDate)) {
    errors.push(`from_date "${fromDate}" is invalid (use YYYY-MM format)`);
  }

  if (toDate && !validatePeriodFormat(toDate)) {
    errors.push(`to_date "${toDate}" is invalid (use YYYY-MM format)`);
  }

  if (fromDate && toDate) {
    if (fromDate > toDate) {
      errors.push('from_date must be before or equal to to_date');
    }

    const daysDiff = Math.abs(
      new Date(toDate + '-01').getTime() - new Date(fromDate + '-01').getTime()
    ) / (1000 * 60 * 60 * 24);

    if (daysDiff > 1095) { // 3 years
      errors.push('date range cannot exceed 3 years');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate cache query parameters
 * @param {boolean} cache - Cache enabled flag
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateCacheParams(cache) {
  if (cache !== undefined && typeof cache !== 'boolean') {
    return {
      valid: false,
      errors: ['cache must be a boolean']
    };
  }

  return {
    valid: true,
    errors: []
  };
}

/**
 * Sanitize period string (security: prevent injection)
 * @param {string} period - Period string
 * @returns {string} - Sanitized period
 */
function sanitizePeriod(period) {
  if (!period) return null;

  // Remove any non-alphanumeric characters except - and Q
  return period.replace(/[^0-9\-Q]/g, '');
}

/**
 * Generate helpful error message for invalid period
 * @param {string} period - Invalid period string
 * @returns {string}
 */
function getInvalidPeriodHint(period) {
  return `Invalid period format: "${period}". ` +
    'Accepted formats:\n' +
    '  - Monthly: YYYY-MM (e.g., 2025-05)\n' +
    '  - Quarterly: YYYY-Q1-Q4 (e.g., 2025-Q2)\n' +
    '  - Annual: YYYY (e.g., 2025)';
}

module.exports = {
  validateDRERequest,
  validatePeriodFormat,
  validatePeriodRange,
  validateDateRange,
  validateCacheParams,
  sanitizePeriod,
  getInvalidPeriodHint
};
