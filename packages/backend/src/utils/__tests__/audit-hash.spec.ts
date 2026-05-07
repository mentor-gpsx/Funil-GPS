import { createHash } from 'crypto';
import {
  canonicalJson,
  computeAuditHash,
  validateAuditChain,
  AuditChainEntry,
} from '../audit-hash';

describe('audit-hash', () => {
  describe('canonicalJson', () => {
    it('returns empty string for null and undefined', () => {
      expect(canonicalJson(null)).toBe('');
      expect(canonicalJson(undefined)).toBe('');
    });

    it('serialises primitives via JSON.stringify', () => {
      expect(canonicalJson(42)).toBe('42');
      expect(canonicalJson('hello')).toBe('"hello"');
      expect(canonicalJson(true)).toBe('true');
    });

    it('sorts object keys deterministically (matches PG jsonb canonicalization)', () => {
      const out = canonicalJson({ b: 1, a: 2, c: 3 });
      expect(out).toBe('{"a":2,"b":1,"c":3}');
    });

    it('produces identical output for objects with different insertion order', () => {
      const a = canonicalJson({ z: 1, a: 2 });
      const b = canonicalJson({ a: 2, z: 1 });
      expect(a).toBe(b);
    });

    it('recursively sorts nested objects', () => {
      const nested = { outer: { z: 1, a: 2 }, x: 5 };
      const out = canonicalJson(nested);
      expect(out).toBe('{"outer":{"a":2,"z":1},"x":5}');
    });

    it('preserves array order (arrays are sequential, not key-sorted)', () => {
      const out = canonicalJson([3, 1, 2]);
      expect(out).toBe('[3,1,2]');
    });

    it('handles arrays of objects with sorted keys', () => {
      const out = canonicalJson([{ b: 1, a: 2 }, { d: 4, c: 3 }]);
      expect(out).toBe('[{"a":2,"b":1},{"c":3,"d":4}]');
    });
  });

  describe('computeAuditHash', () => {
    it('produces 64-char lowercase hex SHA-256', () => {
      const hash = computeAuditHash({
        prevHash: '',
        oldValue: null,
        newValue: { id: '1' },
        changedAt: new Date('2026-05-07T12:00:00.000Z'),
      });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('first record uses empty string prefix (genesis convention)', () => {
      const ts = new Date('2026-05-07T12:00:00.000Z');
      const hash = computeAuditHash({
        prevHash: '',
        oldValue: null,
        newValue: { a: 1 },
        changedAt: ts,
      });

      // Recompute manually to guard against accidental formula drift.
      const oldStr = '';
      const newStr = canonicalJson({ a: 1 });
      const tsStr = ts.toISOString();
      const expected = createHash('sha256')
        .update('' + oldStr + newStr + tsStr, 'utf8')
        .digest('hex');

      expect(hash).toBe(expected);
    });

    it('chained record incorporates previous hash', () => {
      const ts1 = new Date('2026-05-07T12:00:00.000Z');
      const ts2 = new Date('2026-05-07T12:00:01.000Z');

      const hash1 = computeAuditHash({
        prevHash: '',
        oldValue: null,
        newValue: { a: 1 },
        changedAt: ts1,
      });
      const hash2 = computeAuditHash({
        prevHash: hash1,
        oldValue: { a: 1 },
        newValue: { a: 2 },
        changedAt: ts2,
      });

      // hash2 must NOT equal computing without the prev_hash chain.
      const hashWithoutPrev = computeAuditHash({
        prevHash: '',
        oldValue: { a: 1 },
        newValue: { a: 2 },
        changedAt: ts2,
      });
      expect(hash2).not.toBe(hashWithoutPrev);
    });

    it('produces identical output regardless of object key insertion order', () => {
      const ts = new Date('2026-05-07T12:00:00.000Z');
      const a = computeAuditHash({
        prevHash: 'abc',
        oldValue: { z: 1, a: 2 },
        newValue: { c: 3, b: 4 },
        changedAt: ts,
      });
      const b = computeAuditHash({
        prevHash: 'abc',
        oldValue: { a: 2, z: 1 },
        newValue: { b: 4, c: 3 },
        changedAt: ts,
      });
      expect(a).toBe(b);
    });

    it('any input change produces different hash (collision-resistance smoke test)', () => {
      const base = {
        prevHash: 'abc',
        oldValue: { a: 1 },
        newValue: { a: 2 },
        changedAt: new Date('2026-05-07T12:00:00.000Z'),
      };
      const baseHash = computeAuditHash(base);

      expect(computeAuditHash({ ...base, prevHash: 'abd' })).not.toBe(baseHash);
      expect(computeAuditHash({ ...base, oldValue: { a: 1.0001 } })).not.toBe(baseHash);
      expect(computeAuditHash({ ...base, newValue: { a: 3 } })).not.toBe(baseHash);
      expect(
        computeAuditHash({ ...base, changedAt: new Date('2026-05-07T12:00:00.001Z') }),
      ).not.toBe(baseHash);
    });

    it('accepts pre-formatted timestamp string verbatim (DB-source path)', () => {
      // The service reads changed_at_iso as text from PG and passes it directly,
      // skipping Date round-trip. Make sure that path produces a stable hash.
      const tsStr = '2026-05-07T12:00:00.123456Z';
      const a = computeAuditHash({
        prevHash: '',
        oldValue: null,
        newValue: { x: 1 },
        changedAt: tsStr,
      });
      const b = computeAuditHash({
        prevHash: '',
        oldValue: null,
        newValue: { x: 1 },
        changedAt: tsStr,
      });
      expect(a).toBe(b);
    });
  });

  describe('validateAuditChain', () => {
    /** Helper: build a valid chain of N records. */
    function buildChain(n: number): AuditChainEntry[] {
      const out: AuditChainEntry[] = [];
      let prev = '';
      for (let i = 0; i < n; i++) {
        const oldVal = i === 0 ? null : { v: i - 1 };
        const newVal = { v: i };
        const ts = new Date(Date.UTC(2026, 4, 7, 12, 0, i)); // distinct seconds
        const hash = computeAuditHash({
          prevHash: prev,
          oldValue: oldVal,
          newValue: newVal,
          changedAt: ts,
        });
        out.push({
          id: i + 1,
          hash,
          prevHash: prev,
          oldValue: oldVal,
          newValue: newVal,
          changedAt: ts,
        });
        prev = hash;
      }
      return out;
    }

    it('returns valid for an empty chain', () => {
      const result = validateAuditChain([]);
      expect(result).toEqual({ valid: true, brokenAt: null, recordsChecked: 0 });
    });

    it('returns valid for a correctly-built chain', () => {
      const chain = buildChain(5);
      const result = validateAuditChain(chain);
      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeNull();
      expect(result.recordsChecked).toBe(5);
    });

    it('detects tampering of an old_value (re-hash mismatch)', () => {
      const chain = buildChain(3);
      // Mutate record 2's old_value but leave its stored hash intact.
      chain[1].oldValue = { v: 999 };
      const result = validateAuditChain(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
      expect(result.reason).toMatch(/stored hash does not match/);
    });

    it('detects tampering of a new_value', () => {
      const chain = buildChain(3);
      chain[2].newValue = { v: 999 };
      const result = validateAuditChain(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(3);
    });

    it('detects a broken prev_hash link', () => {
      const chain = buildChain(3);
      // Tamper with prev_hash on record 2 so it no longer points to record 1.
      chain[1].prevHash = 'a'.repeat(64);
      const result = validateAuditChain(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
      expect(result.reason).toMatch(/prev_hash does not match/);
    });

    it('detects bad genesis (first record prev_hash != "")', () => {
      const chain = buildChain(2);
      chain[0].prevHash = 'b'.repeat(64);
      const result = validateAuditChain(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
      expect(result.reason).toMatch(/Genesis/);
    });

    it('detects timestamp tampering', () => {
      const chain = buildChain(3);
      // Original was Date(... seconds=1). Move record 2 to seconds=99 — recompute will diverge.
      chain[1].changedAt = new Date(Date.UTC(2026, 4, 7, 12, 0, 99));
      const result = validateAuditChain(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
    });

    it('reports recordsChecked accurately when chain breaks midway', () => {
      const chain = buildChain(10);
      chain[4].newValue = { v: 999 }; // tamper record 5
      const result = validateAuditChain(chain);
      expect(result.valid).toBe(false);
      expect(result.recordsChecked).toBe(5); // stopped at record 5
    });
  });
});
