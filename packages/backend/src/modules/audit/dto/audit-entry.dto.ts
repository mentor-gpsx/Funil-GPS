/**
 * DTOs for the audit module.
 *
 * Story 1.5: Audit Logging & Immutability.
 *
 * Naming note: the story file calls out "AuditEntryDto" — we expose both the
 * plain entry shape (AuditEntryDto) and a "with validation" wrapper used by the
 * single-record endpoint, since AC requires "validation status" on read.
 */

export type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export class AuditEntryDto {
  /** BIGSERIAL — represented as string in JSON to avoid 53-bit precision loss for large datasets. */
  id: string;
  tenant_id: string;
  table_name: string;
  operation: AuditOperation;
  record_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;        // ISO-8601, the value used in the hash payload
  prev_hash: string;
  hash: string;
}

/**
 * Single-record view: includes a freshly-recomputed validation status so the
 * caller can see whether THIS record's hash is still consistent with the chain
 * up to its position.
 */
export class AuditEntryWithValidationDto extends AuditEntryDto {
  validation: {
    /** True when stored hash matches recomputed hash AND prev_hash links correctly. */
    valid: boolean;
    /** Recomputed hash, returned for transparency / debugging. */
    recomputedHash: string;
    /** Reason for invalid result, omitted when valid. */
    reason?: string;
  };
}

/**
 * Pagination + filter query. All filters are optional; defaults are 50 per page,
 * page 1, no filters.
 */
export class ListAuditQueryDto {
  page?: number;
  limit?: number;
  /** ISO date or datetime; inclusive. */
  date_from?: string;
  /** ISO date or datetime; inclusive. */
  date_to?: string;
  table_name?: string;
  operation?: AuditOperation;
  user_id?: string;
  /** Optional: filter to a specific mutated record (chain view). */
  record_id?: string;
}

/**
 * Hash chain validation response.
 *
 * The endpoint accepts the same filters as list (table_name, record_id, date range)
 * so a tenant can validate either:
 *   - the full chain for one specific record (most useful),
 *   - or a slice by table + date range (broad sanity check).
 */
export class ValidateAuditChainResponseDto {
  valid: boolean;
  recordsChecked: number;
  brokenAt: string | null;     // id of the first broken record, or null
  reason?: string;
  filters: {
    table_name?: string;
    record_id?: string;
    date_from?: string;
    date_to?: string;
  };
}

export class PaginatedAuditDto {
  data: AuditEntryDto[];
  total: number;
  page: number;
  limit: number;
}
