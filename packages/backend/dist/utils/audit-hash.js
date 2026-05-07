"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalJson = canonicalJson;
exports.computeAuditHash = computeAuditHash;
exports.validateAuditChain = validateAuditChain;
const crypto_1 = require("crypto");
function canonicalJson(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map(canonicalJson).join(',') + ']';
    }
    const obj = value;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k]));
    return '{' + pairs.join(',') + '}';
}
function computeAuditHash(input) {
    const { prevHash, oldValue, newValue, changedAt } = input;
    const oldStr = oldValue === null || oldValue === undefined ? '' : canonicalJson(oldValue);
    const newStr = newValue === null || newValue === undefined ? '' : canonicalJson(newValue);
    const tsStr = changedAt instanceof Date ? changedAt.toISOString() : String(changedAt);
    const payload = (prevHash ?? '') + oldStr + newStr + tsStr;
    return (0, crypto_1.createHash)('sha256').update(payload, 'utf8').digest('hex');
}
function validateAuditChain(records) {
    if (records.length === 0) {
        return { valid: true, brokenAt: null, recordsChecked: 0 };
    }
    let expectedPrev = '';
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.prevHash !== expectedPrev) {
            return {
                valid: false,
                brokenAt: r.id,
                recordsChecked: i + 1,
                reason: i === 0
                    ? `Genesis record prev_hash should be '' but is '${r.prevHash}'`
                    : `Record ${r.id} prev_hash does not match record ${records[i - 1].id} hash`,
            };
        }
        const recomputed = computeAuditHash({
            prevHash: r.prevHash,
            oldValue: r.oldValue,
            newValue: r.newValue,
            changedAt: r.changedAt,
        });
        if (recomputed !== r.hash) {
            return {
                valid: false,
                brokenAt: r.id,
                recordsChecked: i + 1,
                reason: `Record ${r.id} stored hash does not match recomputed hash (tampering detected)`,
            };
        }
        expectedPrev = r.hash;
    }
    return { valid: true, brokenAt: null, recordsChecked: records.length };
}
//# sourceMappingURL=audit-hash.js.map