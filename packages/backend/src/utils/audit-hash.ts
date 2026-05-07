/**
 * Audit hash chain utilities.
 *
 * Story 1.5: Audit Logging & Immutability.
 *
 * The hash chain ties each audit_logs row to the previous one (per chain key)
 * via SHA-256, so any retroactive mutation of an old row invalidates every
 * downstream hash. Verifying integrity = re-walk the chain and recompute.
 *
 * Canonical formula (matched bit-for-bit in 007_audit_triggers.sql:compute_audit_hash):
 *
 *   hash = SHA256(prev_hash || old_str || new_str || ts_str)
 *
 *   where:
 *     prev_hash = hash of the previous chain entry, or '' for the first record
 *     old_str   = old_value rendered as canonical JSON (or '' if NULL)
 *     new_str   = new_value rendered as canonical JSON (or '' if NULL)
 *     ts_str    = changed_at rendered as ISO-8601 with microsecond precision (UTC)
 *
 * NOTE on "canonical JSON":
 * PostgreSQL's `jsonb::text` produces deterministic output (sorted keys, single
 * spaces, no surprises). For parity in TypeScript we use JSON.stringify on a
 * **key-sorted** object — see canonicalJson(). Without sorting, JS would emit
 * insertion-ordered keys and mismatch the DB-side hash for the same payload.
 */

import { createHash } from 'crypto';

/**
 * Stable JSON serialiser that sorts object keys recursively.
 * Mirrors PG's jsonb::text canonical form closely enough that the same payload
 * produces the same hash on both sides of the wire.
 *
 * Why this matters:
 * - Default JSON.stringify preserves insertion order.
 * - PostgreSQL jsonb sorts keys.
 * - If we hash unsorted JS output and compare to DB-computed hashes, they
 *   diverge silently, breaking validation.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k]));
  return '{' + pairs.join(',') + '}';
}

export interface AuditHashInput {
  /** Previous record's `hash`, or empty string for the first record in the chain. */
  prevHash: string;
  /** Old value before the mutation (NULL for INSERT). Pass as plain JS, not pre-stringified. */
  oldValue: unknown;
  /** New value after the mutation (NULL for DELETE). Pass as plain JS, not pre-stringified. */
  newValue: unknown;
  /**
   * Mutation timestamp.
   * Accepts a Date, an ISO-8601 string, or a Postgres-formatted timestamp string.
   * The string is used verbatim — make sure it matches what's stored in the DB row.
   */
  changedAt: Date | string;
}

/**
 * Compute the hash for one audit record.
 *
 * Returns lowercase 64-char hex. Empty `prevHash` means "first record in the chain";
 * we still hash with empty-string prefix so even the genesis record has a hash.
 */
export function computeAuditHash(input: AuditHashInput): string {
  const { prevHash, oldValue, newValue, changedAt } = input;

  const oldStr = oldValue === null || oldValue === undefined ? '' : canonicalJson(oldValue);
  const newStr = newValue === null || newValue === undefined ? '' : canonicalJson(newValue);
  const tsStr = changedAt instanceof Date ? changedAt.toISOString() : String(changedAt);

  // The DB-side function may pass timestamps in PG's textual format
  // (e.g. "2026-05-07 12:34:56.789012+00"). To keep DB and TS in sync,
  // the trigger function must produce the same `tsStr` form. We document
  // this contract in compute_audit_hash() in 007_audit_triggers.sql.

  const payload = (prevHash ?? '') + oldStr + newStr + tsStr;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export interface AuditChainEntry {
  /** Sequential id. Used to detect insertion-order tampering. */
  id: number | bigint | string;
  /** Persisted hash from the row — what we will verify against. */
  hash: string;
  /** Persisted prev_hash from the row. */
  prevHash: string;
  /** old_value column. */
  oldValue: unknown;
  /** new_value column. */
  newValue: unknown;
  /** changed_at column (must match the format used at insert time). */
  changedAt: Date | string;
}

export interface AuditChainValidationResult {
  /** True iff every record's hash recomputes to the stored value AND prev_hash links the chain. */
  valid: boolean;
  /** First record id at which the chain breaks (null when valid). */
  brokenAt: AuditChainEntry['id'] | null;
  /** Total number of records inspected. */
  recordsChecked: number;
  /** Human-readable reason for the break, if any. */
  reason?: string;
}

/**
 * Walk a chain of audit records and verify integrity.
 *
 * Records MUST be passed in chain order (ascending `id`). The first record's
 * `prevHash` is expected to be `''` (empty string) — that's the genesis convention.
 *
 * Returns the first break point so the caller can report exactly where tampering
 * occurred without having to re-walk.
 */
export function validateAuditChain(records: AuditChainEntry[]): AuditChainValidationResult {
  if (records.length === 0) {
    return { valid: true, brokenAt: null, recordsChecked: 0 };
  }

  let expectedPrev = '';

  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    // 1. Link check: prev_hash must equal the previous record's hash (or '' at genesis).
    if (r.prevHash !== expectedPrev) {
      return {
        valid: false,
        brokenAt: r.id,
        recordsChecked: i + 1,
        reason:
          i === 0
            ? `Genesis record prev_hash should be '' but is '${r.prevHash}'`
            : `Record ${r.id} prev_hash does not match record ${records[i - 1].id} hash`,
      };
    }

    // 2. Recompute and compare to stored hash.
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
