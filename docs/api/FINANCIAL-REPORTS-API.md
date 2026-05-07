# Financial Reports API Documentation

**Version:** 1.0  
**Last Updated:** 2026-05-07  
**Status:** Production Ready

## Overview

The Financial Reports API provides comprehensive financial analysis endpoints for CFO/Finance Manager decision-making. All endpoints support multi-tenant isolation via Row-Level Security (RLS).

### Base URL
```
/api/reports
```

### Authentication
All endpoints require Bearer token authentication via `Authorization` header.

### Response Format
All endpoints return JSON with this structure:
```json
{
  "status": "success|error",
  "data": { /* endpoint-specific */ },
  "error": null|"error message",
  "timestamp": "2026-05-07T14:30:00Z",
  "tenant_id": "tenant-xyz"
}
```

---

## Endpoints

### 1. DRE (Demonstração de Resultado do Exercício)

#### `GET /api/reports/dre`

Retrieve DRE (income statement) for a specific period.

**Query Parameters:**
| Parameter | Type | Required | Default | Example |
|-----------|------|----------|---------|---------|
| period | string | Yes | — | `2026-05`, `2026-Q2`, `2026` |
| compare | boolean | No | false | `?compare=true` |

**Supported Period Formats:**
- Monthly: `YYYY-MM` (e.g., `2026-05`)
- Quarterly: `YYYY-Q[1-4]` (e.g., `2026-Q2`)
- Annual: `YYYY` (e.g., `2026`)

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "period": "2026-05",
    "period_type": "monthly",
    "metrics": {
      "receita_bruta": 150000.00,
      "taxas": 6000.00,
      "receita_liquida": 144000.00,
      "mrr": 45000.00,
      "churn_rate": 2.5
    },
    "comparison": {
      "previous_period": "2026-04",
      "receita_bruta": 140000.00,
      "growth_percentage": 7.14,
      "variance": {
        "receita_bruta_diff": 10000.00,
        "churn_rate_diff": -0.5
      }
    },
    "currency": "BRL",
    "calculation_timestamp": "2026-05-07T14:30:00Z",
    "cached": false,
    "cache_ttl": 360
  }
}
```

**Error Response (400):**
```json
{
  "status": "error",
  "error": "Invalid period format. Use YYYY-MM, YYYY-Q[1-4], or YYYY",
  "data": null
}
```

**Sample Requests:**
```bash
# Monthly DRE
curl -H "Authorization: Bearer TOKEN" \
  "https://api.example.com/api/reports/dre?period=2026-05"

# Quarterly DRE with comparison
curl -H "Authorization: Bearer TOKEN" \
  "https://api.example.com/api/reports/dre?period=2026-Q2&compare=true"

# Annual DRE
curl -H "Authorization: Bearer TOKEN" \
  "https://api.example.com/api/reports/dre?period=2026"
```

---

### 2. Cash Flow Statement

#### `GET /api/reports/cash-flow`

Retrieve daily cash flow for a date range.

**Query Parameters:**
| Parameter | Type | Required | Default | Example |
|-----------|------|----------|---------|---------|
| start_date | string (ISO 8601) | Yes | — | `2026-01-01` |
| end_date | string (ISO 8601) | Yes | — | `2026-12-31` |
| aggregation | string | No | daily | `daily`, `weekly`, `monthly` |

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "period": {
      "start_date": "2026-05-01",
      "end_date": "2026-05-31",
      "days": 31
    },
    "summary": {
      "total_inflows": 250000.00,
      "total_outflows": 50000.00,
      "net_cash": 200000.00,
      "opening_balance": 100000.00,
      "closing_balance": 300000.00
    },
    "daily_flows": [
      {
        "date": "2026-05-01",
        "inflows": 10000.00,
        "outflows": 2000.00,
        "net": 8000.00,
        "balance": 108000.00
      },
      {
        "date": "2026-05-02",
        "inflows": 15000.00,
        "outflows": 1500.00,
        "net": 13500.00,
        "balance": 121500.00
      }
    ],
    "payment_method_breakdown": {
      "PIX": {
        "inflows": 150000.00,
        "percentage": 60.0,
        "count": 450
      },
      "Boleto": {
        "inflows": 75000.00,
        "percentage": 30.0,
        "count": 75
      },
      "Credit Card": {
        "inflows": 25000.00,
        "percentage": 10.0,
        "count": 25
      }
    },
    "stress_analysis": {
      "minimum_balance": 95000.00,
      "minimum_date": "2026-05-15",
      "is_stressed": false,
      "stress_threshold": 50000.00
    },
    "projected_vs_realized": {
      "projected_net": 205000.00,
      "realized_net": 200000.00,
      "variance": -5000.00,
      "variance_percentage": -2.44
    },
    "pagination": {
      "page": 1,
      "page_size": 30,
      "total_records": 31,
      "total_pages": 2
    }
  }
}
```

**Sample Request:**
```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.example.com/api/reports/cash-flow?start_date=2026-01-01&end_date=2026-12-31&aggregation=monthly"
```

---

### 3. Payment Status Analysis

#### `GET /api/reports/payment-status`

Retrieve payment status with aging analysis.

**Query Parameters:**
| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| period | string | No | current_month |
| group_by | string | No | aging | `aging`, `customer`, `payment_method` |

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "period": "2026-05",
    "summary": {
      "total_charges": 500,
      "total_amount": 150000.00,
      "on_time": {
        "count": 470,
        "amount": 141000.00,
        "percentage": 94.0
      },
      "pending": {
        "count": 20,
        "amount": 6000.00,
        "percentage": 4.0
      },
      "overdue": {
        "count": 10,
        "amount": 3000.00,
        "percentage": 2.0
      }
    },
    "aging_analysis": {
      "0-30_days": {
        "count": 15,
        "amount": 4500.00,
        "percentage": 3.0
      },
      "31-60_days": {
        "count": 3,
        "amount": 900.00,
        "percentage": 0.6
      },
      "61-90_days": {
        "count": 1,
        "amount": 300.00,
        "percentage": 0.2
      },
      "90_plus_days": {
        "count": 1,
        "amount": 300.00,
        "percentage": 0.2
      }
    },
    "payment_method_breakdown": {
      "PIX": {
        "on_time": 280,
        "pending": 15,
        "overdue": 5
      },
      "Boleto": {
        "on_time": 150,
        "pending": 4,
        "overdue": 3
      },
      "Credit Card": {
        "on_time": 40,
        "pending": 1,
        "overdue": 2
      }
    },
    "at_risk_customers": [
      {
        "customer_id": "cust-123",
        "customer_name": "Acme Corp",
        "overdue_amount": 2000.00,
        "days_overdue": 75,
        "risk_level": "high",
        "charge_count": 3
      }
    ]
  }
}
```

---

### 4. Recurring Revenue Metrics

#### `GET /api/reports/metrics`

Retrieve MRR, ARR, churn rate, LTV, CAC and cohort analysis.

**Query Parameters:**
| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| period | string | No | 2026-05 |
| include_cohorts | boolean | No | false |

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "period": "2026-05",
    "mrr": {
      "value": 45000.00,
      "active_subscriptions": 150,
      "change_from_previous": 2500.00,
      "change_percentage": 5.88
    },
    "arr": {
      "value": 540000.00,
      "calculation": "MRR × 12"
    },
    "churn_rate": {
      "percentage": 2.5,
      "canceled_count": 4,
      "active_at_start": 160,
      "status": "healthy",
      "threshold": 5.0
    },
    "ltv": {
      "value": 6000.00,
      "calculation": "Average subscription × average lifetime",
      "average_subscription_value": 300.00,
      "average_lifetime_months": 20,
      "with_gross_margin": {
        "gross_margin": 0.60,
        "ltv": 3600.00
      }
    },
    "cac": {
      "value": 250.00,
      "marketing_spend": 50000.00,
      "new_customers": 200,
      "payback_months": 1.5,
      "ltv_cac_ratio": 24.0,
      "ratio_status": "excellent"
    },
    "cohort_analysis": {
      "2026-03": {
        "cohort_size": 50,
        "month_2_retention": 90.0,
        "month_3_retention": 85.0,
        "revenue": 15000.00
      },
      "2026-04": {
        "cohort_size": 45,
        "month_2_retention": 88.0,
        "revenue": 13500.00
      },
      "2026-05": {
        "cohort_size": 55,
        "revenue": 16500.00
      }
    }
  }
}
```

---

### 5. Forecast & Projections

#### `GET /api/reports/forecast`

Retrieve 30-day and 90-day revenue forecasts with confidence scores.

**Query Parameters:**
| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| horizon | string | No | 30 | `30`, `90` |
| include_scenarios | boolean | No | false |

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "forecast_period": 30,
    "forecast_start": "2026-05-07",
    "forecast_end": "2026-06-06",
    "forecast_30d": {
      "projected_revenue": 50000.00,
      "confidence": 0.95,
      "confidence_level": "high",
      "by_payment_method": {
        "PIX": {
          "amount": 30000.00,
          "confidence": 0.95
        },
        "Boleto": {
          "amount": 15000.00,
          "confidence": 0.70
        },
        "Credit Card": {
          "amount": 5000.00,
          "confidence": 0.40
        }
      }
    },
    "forecast_90d": {
      "projected_revenue": 155000.00,
      "confidence": 0.75,
      "confidence_level": "medium"
    },
    "risk_scenarios": {
      "base_case": {
        "revenue": 50000.00,
        "probability": 0.50
      },
      "churn_plus_5": {
        "revenue": 47500.00,
        "probability": 0.25,
        "churn_impact": -2500.00
      },
      "churn_plus_10": {
        "revenue": 45000.00,
        "probability": 0.15,
        "churn_impact": -5000.00
      },
      "churn_plus_15": {
        "revenue": 42500.00,
        "probability": 0.10,
        "churn_impact": -7500.00
      }
    },
    "variance_analysis": {
      "month": "2026-04",
      "forecast_at_start": 48000.00,
      "actual_result": 50000.00,
      "variance": 2000.00,
      "variance_percentage": 4.17,
      "accuracy": "high"
    }
  }
}
```

---

### 6. Data Validation

#### `GET /api/reports/validate`

Check data integrity and flag issues.

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "validation_timestamp": "2026-05-07T14:30:00Z",
    "overall_status": "pass",
    "issues": [
      {
        "severity": "warning",
        "type": "orphaned_charges",
        "count": 2,
        "description": "2 charges found without valid subscription reference",
        "affected_ids": ["charge-1001", "charge-1002"]
      }
    ],
    "checks": {
      "orphaned_charges": {
        "status": "warning",
        "count": 2
      },
      "duplicate_payments": {
        "status": "pass",
        "count": 0
      },
      "currency_consistency": {
        "status": "pass",
        "all_brl": true
      },
      "audit_log_reconciliation": {
        "status": "pass",
        "matched_records": 500,
        "unmatched": 0
      },
      "subscription_references": {
        "status": "pass",
        "valid_references": 450,
        "invalid": 0
      }
    }
  }
}
```

---

### 7. Report Schedules Management

#### `GET /api/reports/schedules`

Retrieve schedule configuration.

**Success Response:**
```json
{
  "status": "success",
  "data": {
    "daily_dre": {
      "enabled": true,
      "time": "08:00",
      "recipients": ["cfo@company.com"]
    },
    "weekly_cashflow": {
      "enabled": true,
      "time": "09:00",
      "day": 1,
      "day_name": "Monday",
      "recipients": ["finance-team@company.com"]
    },
    "monthly_full": {
      "enabled": true,
      "time": "10:00",
      "day": 1,
      "recipients": ["board@company.com"]
    }
  }
}
```

#### `POST /api/reports/schedules/update`

Update schedule configuration.

**Request Body:**
```json
{
  "daily_dre_enabled": true,
  "daily_dre_time": "08:00",
  "weekly_cashflow_enabled": true,
  "weekly_cashflow_time": "09:00",
  "weekly_cashflow_day": 1,
  "monthly_full_enabled": true,
  "monthly_full_time": "10:00",
  "monthly_full_day": 1,
  "recipients": {
    "daily_dre": ["cfo@company.com"],
    "weekly_cashflow": ["team@company.com"],
    "monthly_full": ["board@company.com"]
  }
}
```

---

## Error Handling

### Standard Error Responses

**400 Bad Request:**
```json
{
  "status": "error",
  "error": "Invalid period format",
  "data": null
}
```

**401 Unauthorized:**
```json
{
  "status": "error",
  "error": "Missing or invalid authentication token",
  "data": null
}
```

**403 Forbidden:**
```json
{
  "status": "error",
  "error": "Insufficient permissions for this operation",
  "data": null
}
```

**500 Internal Server Error:**
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

---

## Performance Targets (AC-8)

| Operation | Target | Notes |
|-----------|--------|-------|
| DRE generation | < 2 seconds | For 1 year of data |
| Cash flow | < 3 seconds | For 2 years of data |
| Payment status | < 1 second | Aging analysis |
| Metrics (no cohorts) | < 1 second | — |
| Forecast | < 2 seconds | With risk scenarios |

---

## Caching Strategy

| Report | Cache Duration | Invalidation |
|--------|---|---|
| Completed month DRE | Indefinite | Manual only |
| Current month DRE | 6 hours | Auto-refresh every 6h |
| Cash flow | 1 hour | Daily reset at 00:00 UTC |
| Metrics | 1 hour | — |
| Forecast | 24 hours | — |

---

## Rate Limiting

- **Per minute:** 100 requests
- **Per hour:** 5000 requests
- **Per day:** 100,000 requests

---

## Webhooks (Optional)

Schedule webhook notifications for report completion:
```bash
POST /api/reports/webhooks
{
  "event": "report_generated",
  "report_type": "monthly_full",
  "url": "https://your-domain.com/webhook",
  "secret": "webhook-signature-secret"
}
```
