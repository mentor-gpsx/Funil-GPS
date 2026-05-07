const crypto = require('crypto');

// Generate secure random token for shareable links
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Verify token format (basic validation)
function isValidToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{32,}$/.test(token);
}

module.exports = {
  generateToken,
  isValidToken
};
