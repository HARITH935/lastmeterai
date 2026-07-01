# LastMeter AI — Complete API Contract

> **Source of truth for all frontend–backend integration.**
> Generated from `lastmeterai.md` specification and the approved architecture.
> Do not implement routes that are not listed here.

---

## Conventions

### Base URL
| Environment | Base URL |
|---|---|
| Development | `http://localhost:5000` |
| Production  | `https://lastmeter-ai-backend.onrender.com` |

All endpoints are prefixed `/api/` except `/health`.

### Authentication
Every protected endpoint requires:
```
Authorization: Bearer <access_token>
```
Access tokens are short-lived (8 h). Use the refresh token to rotate.

### Role abbreviations used throughout this document
| Symbol | Meaning |
|---|---|
| 🔓 | Public — no token required |
| 🔑 | Any authenticated user |
| 👔 | Manager role only |
| 🧢 | Agent role only |
| 👔🧢 | Both roles, but response is scoped by role |

### Standard error envelope
Every error response uses this shape:
```json
{
  "error": "SHORT_CODE",
  "message": "Human-readable explanation",
  "details": {}
}
```
`details` is omitted when there is nothing field-level to report.

### Pagination (list endpoints)
Query params: `?page=1&per_page=20`
Response wrapper:
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Enum values (reference)
| Field | Allowed values |
|---|---|
| `role` | `"manager"`, `"agent"` |
| `order.status` | `"pending"`, `"in_transit"`, `"delivered"`, `"failed"`, `"postponed"` |
| `order.package_size` | `"small"`, `"medium"`, `"large"` |
| `order.time_window` | `"morning"`, `"afternoon"`, `"evening"` |
| `order.residence_type` | `"apartment"`, `"independent"` |
| `decision.decision` | `"GO"`, `"NO-GO"` |
| `decision.risk_level` | `"low"`, `"medium"`, `"high"` |
| `notification.category` | `"ai_alert"`, `"delivery_alert"`, `"weather_alert"`, `"system_alert"` |
| `area` | `"Anna Nagar"`, `"T Nagar"`, `"Velachery"`, `"Adyar"`, `"Porur"` |

---

## 1. Auth

### POST /api/auth/login
🔓 Public

**Purpose:** Authenticate with username + password. Returns JWT access token and refresh token.

**Request body:**
```json
{
  "username": "ravi.kumar",
  "password": "agent123"
}
```

**Validation rules:**
- `username`: required, string, 1–80 chars, no spaces
- `password`: required, string, 6–128 chars

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 3,
    "username": "ravi.kumar",
    "role": "agent",
    "name": "Ravi Kumar",
    "area": "Adyar",
    "city": "Chennai"
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing or invalid field |
| 401 | `INVALID_CREDENTIALS` | Wrong username or password |
| 403 | `ACCOUNT_DISABLED` | `is_active = false` |

---

### POST /api/auth/logout
🔑 Any authenticated user

**Purpose:** Invalidate the current session. Implemented server-side via a JWT blocklist (stored in memory or a simple DB set).

**Request body:** none

**Response 200:**
```json
{
  "message": "Logged out successfully"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or expired token |

---

### POST /api/auth/refresh
🔑 Requires refresh token (not access token)

**Purpose:** Exchange a valid refresh token for a new access token.

**Request body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Validation rules:**
- `refresh_token`: required, non-empty string

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing refresh_token |
| 401 | `TOKEN_EXPIRED` | Refresh token past 30-day TTL |
| 401 | `TOKEN_INVALID` | Tampered or malformed token |

---

### GET /api/auth/me
🔑 Any authenticated user

**Purpose:** Fetch the current user's profile. Used on app load to restore session state.

**Request body:** none

**Response 200:**
```json
{
  "id": 3,
  "username": "ravi.kumar",
  "role": "agent",
  "name": "Ravi Kumar",
  "phone": "9876543210",
  "area": "Adyar",
  "city": "Chennai",
  "is_active": true,
  "notification_prefs": {
    "ai_alert": true,
    "delivery_alert": true,
    "weather_alert": true,
    "system_alert": true
  },
  "created_at": "2026-06-21T08:00:00Z"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or expired token |

---

### PATCH /api/auth/me/password
🔑 Any authenticated user

**Purpose:** Change own password. Requires current password confirmation.

**Request body:**
```json
{
  "current_password": "agent123",
  "new_password": "newSecurePass456",
  "confirm_password": "newSecurePass456"
}
```

**Validation rules:**
- `current_password`: required
- `new_password`: required, 8–128 chars, different from current_password
- `confirm_password`: required, must exactly match `new_password`

**Response 200:**
```json
{
  "message": "Password updated successfully"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing field / passwords don't match / too short |
| 401 | `WRONG_PASSWORD` | `current_password` doesn't match stored hash |

---

### PATCH /api/auth/me/profile
🔑 Any authenticated user

**Purpose:** Update own name, phone, and notification_prefs (Settings → Profile + Notification Preferences).

**Request body:**
```json
{
  "name": "Ravi K",
  "phone": "9876543299",
  "notification_prefs": {
    "ai_alert": true,
    "delivery_alert": true,
    "weather_alert": false,
    "system_alert": true
  }
}
```

**Validation rules:**
- `name`: optional, string, 1–120 chars
- `phone`: optional, string, 10–15 chars, digits only
- `notification_prefs`: optional, object; each key must be one of the 4 categories; each value boolean
- Agents cannot change their `area` via this endpoint (Manager-only via PUT /api/agents/:id)

**Response 200:**
```json
{
  "id": 3,
  "name": "Ravi K",
  "phone": "9876543299",
  "notification_prefs": {
    "ai_alert": true,
    "delivery_alert": true,
    "weather_alert": false,
    "system_alert": true
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid field value |
| 401 | `UNAUTHORIZED` | Missing or expired token |

---

## 2. Orders

### GET /api/orders
👔🧢 Role-scoped

**Purpose:**
- Manager: returns all orders across all areas with full filter set
- Agent: returns only orders where `area = current_user.area`

**Query params:**
| Param | Type | Description |
|---|---|---|
| `page` | int | Default 1 |
| `per_page` | int | Default 20, max 100 |
| `area` | string | Filter by area (Manager only) |
| `agent_id` | int | Filter by assigned agent (Manager only) |
| `status` | string | One of the 5 status values |
| `risk_level` | string | `"low"`, `"medium"`, `"high"` |
| `package_size` | string | `"small"`, `"medium"`, `"large"` |
| `is_urgent` | bool | `"true"` or `"false"` |
| `date_from` | string | ISO 8601 date — filter by `created_at` |
| `date_to` | string | ISO 8601 date — filter by `created_at` |
| `search` | string | Partial match on `order_number` or `customer_name` |
| `sort_by` | string | `"created_at"`, `"deadline"`, `"risk_score"`, `"payment_amount"` — default `"created_at"` |
| `sort_dir` | string | `"asc"` or `"desc"` — default `"desc"` |

**Response 200:**
```json
{
  "data": [
    {
      "id": 1,
      "order_number": "LM-0001",
      "customer_name": "Anitha Suresh",
      "customer_phone": "9876500001",
      "customer_address": "7 Main Road, Adyar, Chennai",
      "area": "Adyar",
      "city": "Chennai",
      "latitude": 13.00635,
      "longitude": 80.26040,
      "residence_type": "apartment",
      "agent_id": 2,
      "agent_name": "Ravi Kumar",
      "package_size": "medium",
      "time_window": "morning",
      "deadline": "2026-06-26T23:59:00Z",
      "status": "pending",
      "failure_reason": null,
      "payment_amount": 350.0,
      "is_urgent": false,
      "decision": "GO",
      "risk_score": 28,
      "risk_level": "low",
      "created_at": "2026-06-21T08:30:00Z",
      "updated_at": "2026-06-21T08:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 30,
    "pages": 2
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_PARAM` | Unknown sort_by field or invalid date format |
| 401 | `UNAUTHORIZED` | Missing or expired token |

---

### POST /api/orders
👔 Manager only

**Purpose:** Create a new delivery order. GO/NO-GO prediction is triggered automatically and the resulting `Decision` row is created in the same request.

**Request body:**
```json
{
  "customer_name": "Anitha Suresh",
  "customer_phone": "9876500001",
  "customer_address": "7 Main Road, Adyar, Chennai",
  "area": "Adyar",
  "latitude": 13.00635,
  "longitude": 80.26040,
  "residence_type": "apartment",
  "agent_id": 2,
  "package_size": "medium",
  "time_window": "morning",
  "deadline": "2026-06-26T23:59:00Z",
  "payment_amount": 350.0
}
```

**Validation rules:**
- `customer_name`: required, string, 1–120 chars
- `customer_phone`: optional, string, 10–15 digits
- `customer_address`: required, non-empty string
- `area`: required, must be one of the 5 valid areas
- `latitude`: required, float, 12.80–13.25
- `longitude`: required, float, 80.10–80.35
- `residence_type`: required, `"apartment"` or `"independent"`
- `agent_id`: optional int; if provided, the agent's `area` must match `area`
- `package_size`: required, one of `"small"`, `"medium"`, `"large"`
- `time_window`: required, one of `"morning"`, `"afternoon"`, `"evening"`
- `deadline`: required, ISO 8601 datetime, must be in the future
- `payment_amount`: required, float, > 0

**Response 201:**
```json
{
  "id": 31,
  "order_number": "LM-0031",
  "customer_name": "Anitha Suresh",
  "customer_phone": "9876500001",
  "customer_address": "7 Main Road, Adyar, Chennai",
  "area": "Adyar",
  "city": "Chennai",
  "latitude": 13.00635,
  "longitude": 80.26040,
  "residence_type": "apartment",
  "agent_id": 2,
  "agent_name": "Ravi Kumar",
  "package_size": "medium",
  "time_window": "morning",
  "deadline": "2026-06-26T23:59:00Z",
  "status": "pending",
  "failure_reason": null,
  "payment_amount": 350.0,
  "is_urgent": false,
  "decision": "GO",
  "risk_score": 28,
  "risk_level": "low",
  "created_at": "2026-06-24T10:15:00Z",
  "updated_at": "2026-06-24T10:15:00Z"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing required field or out-of-range value |
| 400 | `AREA_MISMATCH` | `agent_id` area does not match `area` field |
| 401 | `UNAUTHORIZED` | Missing or expired token |
| 403 | `FORBIDDEN` | Agent attempting to create an order |
| 404 | `AGENT_NOT_FOUND` | `agent_id` does not exist |
| 503 | `PREDICTION_UNAVAILABLE` | ML model not loaded — order created without decision |

---

### GET /api/orders/:id
👔🧢 Role-scoped

**Purpose:** Full detail view for a single order, including the latest decision and SHAP breakdown.

**Request body:** none

**Response 200:**
```json
{
  "id": 1,
  "order_number": "LM-0001",
  "customer_name": "Anitha Suresh",
  "customer_phone": "9876500001",
  "customer_address": "7 Main Road, Adyar, Chennai",
  "area": "Adyar",
  "city": "Chennai",
  "latitude": 13.00635,
  "longitude": 80.26040,
  "residence_type": "apartment",
  "agent_id": 2,
  "agent_name": "Ravi Kumar",
  "package_size": "medium",
  "time_window": "morning",
  "deadline": "2026-06-26T23:59:00Z",
  "status": "pending",
  "failure_reason": null,
  "payment_amount": 350.0,
  "is_urgent": false,
  "created_by": 1,
  "created_at": "2026-06-21T08:30:00Z",
  "updated_at": "2026-06-21T08:30:00Z",
  "latest_decision": {
    "id": 1,
    "decision": "GO",
    "success_probability": 0.72,
    "risk_score": 28,
    "risk_level": "low",
    "model_name": "gonogo_lr",
    "model_version": "v1.0",
    "top_factors": [
      { "factor": "weather_risk",           "contribution": 5.1 },
      { "factor": "distance_score",         "contribution": 8.4 },
      { "factor": "time_of_day_score",      "contribution": 4.7 },
      { "factor": "traffic_impact",         "contribution": 2.9 }
    ],
    "weather_snapshot": {
      "condition": "Clear",
      "temp_c": 31.2,
      "humidity": 65,
      "wind_kmh": 12.5,
      "description": "clear sky"
    },
    "reschedule_suggestion": null,
    "created_at": "2026-06-21T08:30:01Z"
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or expired token |
| 403 | `FORBIDDEN` | Agent requesting an order outside their area |
| 404 | `ORDER_NOT_FOUND` | No order with this id |

---

### PUT /api/orders/:id
👔 Manager only

**Purpose:** Full update of an order. Automatically re-runs GO/NO-GO prediction if any of the 7 factor inputs changed.

**Request body:**
```json
{
  "customer_name": "Anitha Suresh",
  "customer_phone": "9876500001",
  "customer_address": "14 Cross St, Adyar, Chennai",
  "area": "Adyar",
  "latitude": 13.00700,
  "longitude": 80.26100,
  "residence_type": "independent",
  "agent_id": 2,
  "package_size": "small",
  "time_window": "afternoon",
  "deadline": "2026-06-27T23:59:00Z",
  "payment_amount": 300.0
}
```

**Validation rules:** Same as POST /api/orders (all fields optional, but at least one required).

**Response 200:** Same shape as GET /api/orders/:id (with `latest_decision` reflecting the new prediction if one was triggered).

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid field value |
| 400 | `AREA_MISMATCH` | Agent area doesn't match new `area` |
| 401 | `UNAUTHORIZED` | Missing or expired token |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `ORDER_NOT_FOUND` | — |

---

### DELETE /api/orders/:id
👔 Manager only

**Purpose:** Hard delete an order and all its decisions (CASCADE). Writes an audit log entry before deletion.

**Request body:** none

**Response 200:**
```json
{
  "message": "Order LM-0001 deleted successfully"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `ORDER_NOT_FOUND` | — |

---

### PATCH /api/orders/:id/status
🧢 Agent only (own area orders)

**Purpose:** Agent marks an order as delivered / failed / postponed after attempting delivery.

**Request body:**
```json
{
  "status": "delivered",
  "failure_reason": null
}
```

For failed or postponed:
```json
{
  "status": "postponed",
  "failure_reason": "Customer requested reschedule — not at home"
}
```

**Validation rules:**
- `status`: required, must be one of `"delivered"`, `"failed"`, `"postponed"` (agents cannot set `"pending"` or `"in_transit"` via this endpoint — `"in_transit"` is set automatically when the agent starts their route)
- `failure_reason`: required when `status` is `"failed"` or `"postponed"`, max 500 chars; must be null when `status` is `"delivered"`

**Response 200:**
```json
{
  "id": 1,
  "order_number": "LM-0001",
  "status": "delivered",
  "failure_reason": null,
  "updated_at": "2026-06-24T14:22:00Z"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid status or missing failure_reason |
| 400 | `INVALID_TRANSITION` | E.g. trying to mark a "delivered" order as "failed" |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Manager using this endpoint, or Agent for another area's order |
| 404 | `ORDER_NOT_FOUND` | — |

---

### GET /api/orders/:id/decision
👔🧢 Role-scoped

**Purpose:** Fetch all decision history for an order (newest first). Agents see their area's orders only.

**Query params:** `?page=1&per_page=5`

**Response 200:**
```json
{
  "data": [
    {
      "id": 1,
      "order_id": 1,
      "decision": "GO",
      "success_probability": 0.72,
      "risk_score": 28,
      "risk_level": "low",
      "model_name": "gonogo_lr",
      "model_version": "v1.0",
      "factors": {
        "weather_risk": 0.15,
        "customer_history_score": 0.10,
        "traffic_impact": 0.20,
        "agent_profit_score": 0.75,
        "distance_score": 0.30,
        "time_of_day_score": 0.25,
        "package_size_score": 0.10
      },
      "shap_values": {
        "weather_risk": 5.1,
        "customer_history_score": 3.2,
        "traffic_impact": 2.9,
        "agent_profit_score": -1.2,
        "distance_score": 8.4,
        "time_of_day_score": 4.7,
        "package_size_score": 3.6
      },
      "top_factors": [
        { "factor": "distance_score",    "contribution": 8.4 },
        { "factor": "weather_risk",      "contribution": 5.1 },
        { "factor": "time_of_day_score", "contribution": 4.7 }
      ],
      "weather_snapshot": {
        "condition": "Clear",
        "temp_c": 31.2,
        "humidity": 65,
        "wind_kmh": 12.5,
        "description": "clear sky"
      },
      "reschedule_suggestion": null,
      "created_at": "2026-06-21T08:30:01Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 5,
    "total": 1,
    "pages": 1
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent for another area's order |
| 404 | `ORDER_NOT_FOUND` | — |

---

## 3. Agents

### GET /api/agents
👔 Manager only

**Purpose:** List all agent accounts with current location and today's performance summary.

**Query params:** `?page=1&per_page=20&area=Adyar&is_active=true`

**Response 200:**
```json
{
  "data": [
    {
      "id": 2,
      "username": "ravi.kumar",
      "name": "Ravi Kumar",
      "phone": "9876543210",
      "area": "Adyar",
      "city": "Chennai",
      "is_active": true,
      "created_at": "2026-06-21T08:00:00Z",
      "today_stats": {
        "total_orders": 6,
        "delivered": 3,
        "pending": 2,
        "failed": 0,
        "postponed": 1,
        "earnings_today": 530.0
      },
      "overall_stats": {
        "total_delivered": 18,
        "success_rate": 0.96
      },
      "location": {
        "latitude": 13.007350,
        "longitude": 80.258400,
        "is_online": true,
        "last_updated": "2026-06-24T10:10:00Z"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 5,
    "pages": 1
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### POST /api/agents
👔 Manager only

**Purpose:** Create a new agent account. No self-signup is allowed anywhere in the app.

**Request body:**
```json
{
  "username": "mohan.das",
  "password": "tempPass789",
  "name": "Mohan Das",
  "phone": "9876543215",
  "area": "Velachery"
}
```

**Validation rules:**
- `username`: required, 3–80 chars, alphanumeric + dots/underscores, unique
- `password`: required, 8–128 chars
- `name`: required, 1–120 chars
- `phone`: optional, 10–15 digits
- `area`: required, one of the 5 valid areas

**Response 201:**
```json
{
  "id": 7,
  "username": "mohan.das",
  "name": "Mohan Das",
  "phone": "9876543215",
  "area": "Velachery",
  "city": "Chennai",
  "role": "agent",
  "is_active": true,
  "created_at": "2026-06-24T11:00:00Z"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid field |
| 400 | `USERNAME_TAKEN` | `username` already exists |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### GET /api/agents/:id
👔 Manager only

**Purpose:** Full agent profile with performance history.

**Response 200:**
```json
{
  "id": 2,
  "username": "ravi.kumar",
  "name": "Ravi Kumar",
  "phone": "9876543210",
  "area": "Adyar",
  "city": "Chennai",
  "is_active": true,
  "created_at": "2026-06-21T08:00:00Z",
  "performance": {
    "total_orders_all_time": 24,
    "delivered": 23,
    "failed": 0,
    "postponed": 1,
    "success_rate": 0.96,
    "avg_orders_per_day": 4.8,
    "total_earnings": 8640.0
  },
  "location": {
    "latitude": 13.007350,
    "longitude": 80.258400,
    "heading": 90.0,
    "speed_kmh": 22.8,
    "is_online": true,
    "current_order_id": 2,
    "last_updated": "2026-06-24T10:10:00Z"
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `AGENT_NOT_FOUND` | — |

---

### PUT /api/agents/:id
👔 Manager only

**Purpose:** Update an agent's profile (name, phone, area) or change their active status.

**Request body:**
```json
{
  "name": "Ravi Kumar Sr",
  "phone": "9876543299",
  "area": "Adyar",
  "is_active": true
}
```

**Validation rules:**
- All fields optional; at least one required
- `area`: if changed, must be one of the 5 valid areas
- `is_active`: boolean — setting to false deactivates the account; existing order assignments are preserved

**Response 200:**
```json
{
  "id": 2,
  "username": "ravi.kumar",
  "name": "Ravi Kumar Sr",
  "phone": "9876543299",
  "area": "Adyar",
  "is_active": true
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid field |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `AGENT_NOT_FOUND` | — |

---

### DELETE /api/agents/:id
👔 Manager only

**Purpose:** Soft-delete (deactivates) an agent account. Does not hard-delete the user row so order history is preserved. Equivalent to PUT with `is_active: false`, exposed separately for clarity.

**Request body:** none

**Response 200:**
```json
{
  "message": "Agent ravi.kumar deactivated successfully"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `AGENT_NOT_FOUND` | — |

---

### GET /api/agents/:id/orders
👔 Manager only

**Purpose:** All orders assigned to a specific agent, with latest decision included.

**Query params:** Same filter set as GET /api/orders (except `agent_id` — it's implied).

**Response 200:** Same shape as GET /api/orders.

---

### GET /api/agents/:id/earnings
👔 Manager only

**Purpose:** Earnings breakdown for an agent.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `period` | `"today"` | `"today"`, `"week"`, `"month"`, `"all"` |

**Response 200:**
```json
{
  "agent_id": 2,
  "agent_name": "Ravi Kumar",
  "period": "week",
  "earnings": {
    "total": 2240.0,
    "delivered_count": 18,
    "avg_per_delivery": 124.4,
    "breakdown_by_day": [
      { "date": "2026-06-18", "amount": 350.0, "deliveries": 3 },
      { "date": "2026-06-19", "amount": 400.0, "deliveries": 3 },
      { "date": "2026-06-20", "amount": 530.0, "deliveries": 4 },
      { "date": "2026-06-21", "amount": 480.0, "deliveries": 4 },
      { "date": "2026-06-22", "amount": 180.0, "deliveries": 2 },
      { "date": "2026-06-23", "amount": 0.0,   "deliveries": 0 },
      { "date": "2026-06-24", "amount": 300.0, "deliveries": 2 }
    ]
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_PARAM` | Unknown `period` value |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `AGENT_NOT_FOUND` | — |

---

### GET /api/agents/leaderboard
👔 Manager only

**Purpose:** All agents ranked by success rate (Agent Leaderboard, spec §2.5). Not visible to agents.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `period` | `"all"` | `"today"`, `"week"`, `"month"`, `"all"` |

**Response 200:**
```json
{
  "period": "all",
  "leaderboard": [
    {
      "rank": 1,
      "agent_id": 2,
      "agent_name": "Ravi Kumar",
      "area": "Adyar",
      "success_rate": 0.96,
      "total_delivered": 23,
      "total_orders": 24,
      "performance_score": 94.2
    },
    {
      "rank": 2,
      "agent_id": 3,
      "agent_name": "Karthik Raj",
      "area": "T Nagar",
      "success_rate": 0.93,
      "total_delivered": 19,
      "total_orders": 21,
      "performance_score": 90.1
    }
  ]
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

## 4. Decisions

### POST /api/decisions/predict
👔 Manager only

**Purpose:** Run a GO/NO-GO prediction on demand for an existing order (e.g. after a manager re-assesses an order). Fetches live weather from OpenWeatherMap for the order's area, then runs the production Logistic Regression model.

**Request body:**
```json
{
  "order_id": 1
}
```

**Validation rules:**
- `order_id`: required, integer, must reference an existing order

**Response 201:**
```json
{
  "id": 45,
  "order_id": 1,
  "decision": "NO-GO",
  "success_probability": 0.38,
  "risk_score": 62,
  "risk_level": "high",
  "model_name": "gonogo_lr",
  "model_version": "v1.0",
  "factors": {
    "weather_risk": 0.72,
    "customer_history_score": 0.55,
    "traffic_impact": 0.65,
    "agent_profit_score": 0.35,
    "distance_score": 0.58,
    "time_of_day_score": 0.60,
    "package_size_score": 0.50
  },
  "shap_values": {
    "weather_risk": 35.2,
    "customer_history_score": 24.8,
    "distance_score": 15.1,
    "time_of_day_score": 10.3,
    "traffic_impact": 7.8,
    "package_size_score": 4.1,
    "agent_profit_score": 2.7
  },
  "top_factors": [
    { "factor": "weather_risk",           "contribution": 35.2 },
    { "factor": "customer_history_score", "contribution": 24.8 },
    { "factor": "distance_score",         "contribution": 15.1 },
    { "factor": "time_of_day_score",      "contribution": 10.3 },
    { "factor": "traffic_impact",         "contribution": 7.8 }
  ],
  "weather_snapshot": {
    "condition": "Light Rain",
    "temp_c": 27.8,
    "humidity": 84,
    "wind_kmh": 22.0,
    "description": "light rain"
  },
  "reschedule_suggestion": {
    "suggested_date": "2026-06-26",
    "suggested_window": "afternoon",
    "predicted_success_probability": 0.81,
    "reason": "Rain expected to clear by 26 Jun; afternoon traffic historically lower in Adyar"
  },
  "created_at": "2026-06-24T14:00:00Z"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing `order_id` |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `ORDER_NOT_FOUND` | — |
| 503 | `MODEL_NOT_LOADED` | ML model failed to load at startup |
| 503 | `WEATHER_UNAVAILABLE` | OpenWeatherMap API unreachable — prediction runs with last known weather |

---

### GET /api/decisions/:id
👔🧢 Role-scoped

**Purpose:** Fetch a single decision by id.

**Response 200:** Same shape as a single item in POST /api/decisions/predict response.

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent accessing a decision for another area's order |
| 404 | `DECISION_NOT_FOUND` | — |

---

## 5. Analytics

### GET /api/analytics/dashboard
👔 Manager only

**Purpose:** Data for the Executive Dashboard — 6 metric cards + 3 trend charts.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `date` | today | ISO 8601 date — cards are calculated for this day |

**Response 200:**
```json
{
  "date": "2026-06-24",
  "cards": {
    "total_orders_today": 30,
    "deliveries_completed": 12,
    "high_risk_orders": 8,
    "revenue_today": 4250.0,
    "estimated_savings": 1840.0,
    "active_agents": 4
  },
  "trends": {
    "success_rate_over_time": [
      { "date": "2026-06-18", "rate": 0.82 },
      { "date": "2026-06-19", "rate": 0.85 },
      { "date": "2026-06-20", "rate": 0.88 },
      { "date": "2026-06-21", "rate": 0.91 },
      { "date": "2026-06-22", "rate": 0.87 },
      { "date": "2026-06-23", "rate": 0.90 },
      { "date": "2026-06-24", "rate": 0.86 }
    ],
    "failure_rate_by_area": [
      { "area": "Anna Nagar", "failure_rate": 0.10 },
      { "area": "T Nagar",   "failure_rate": 0.15 },
      { "area": "Velachery", "failure_rate": 0.28 },
      { "area": "Adyar",     "failure_rate": 0.22 },
      { "area": "Porur",     "failure_rate": 0.08 }
    ],
    "revenue_by_day": [
      { "date": "2026-06-18", "revenue": 3800.0 },
      { "date": "2026-06-19", "revenue": 4100.0 },
      { "date": "2026-06-20", "revenue": 4420.0 },
      { "date": "2026-06-21", "revenue": 3950.0 },
      { "date": "2026-06-22", "revenue": 2200.0 },
      { "date": "2026-06-23", "revenue": 4600.0 },
      { "date": "2026-06-24", "revenue": 4250.0 }
    ]
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_PARAM` | Malformed date |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### GET /api/analytics/kpi
👔 Manager only

**Purpose:** KPI Analytics page — deep-dive metrics across agents and areas.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `period` | `"week"` | `"today"`, `"week"`, `"month"` |

**Response 200:**
```json
{
  "period": "week",
  "summary": {
    "avg_delivery_time_minutes": 38.4,
    "failed_delivery_pct": 0.12,
    "total_orders": 150,
    "total_delivered": 132
  },
  "agent_performance": [
    {
      "agent_id": 2,
      "agent_name": "Ravi Kumar",
      "area": "Adyar",
      "total_orders": 32,
      "delivered": 31,
      "success_rate": 0.97,
      "performance_score": 94.8,
      "avg_delivery_time_minutes": 34.2
    }
  ],
  "area_performance": [
    {
      "area": "Anna Nagar",
      "total_orders": 28,
      "delivered": 25,
      "success_rate": 0.89,
      "failure_rate": 0.11,
      "avg_risk_score": 31.4
    }
  ],
  "weather_impact": {
    "clear_days": { "success_rate": 0.93, "order_count": 84 },
    "rainy_days":  { "success_rate": 0.71, "order_count": 66 }
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_PARAM` | Unknown period |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### GET /api/analytics/cost-savings
👔🧢 Role-scoped

**Purpose:** Cost-Saving Dashboard metrics.
- Manager: all agents/areas combined
- Agent: own deliveries only

**Query params:** `?period=week` (`"today"`, `"week"`, `"month"`, `"all"`)

**Response 200:**
```json
{
  "period": "week",
  "scope": "all",
  "metrics": {
    "total_orders": 150,
    "go_count": 112,
    "no_go_count": 38,
    "deliveries_avoided": 38,
    "fuel_saved_litres": 42.2,
    "fuel_saved_inr": 3418.2,
    "failed_cost_avoided_inr": 11400.0,
    "total_savings_inr": 14818.2,
    "success_rate_with_ai": 0.89,
    "baseline_success_rate": 0.73,
    "improvement_pct": 21.9
  },
  "assumptions": {
    "fuel_cost_per_litre_inr": 81.0,
    "fuel_consumption_per_km_litres": 0.04,
    "avg_distance_per_order_km": 4.2,
    "avg_failed_delivery_cost_inr": 300.0
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |

---

### GET /api/analytics/area/:area
👔 Manager only

**Purpose:** Area Intelligence page — per-area drill-down (spec §2.5 Area Intelligence Page).

**Path param:** `area` must be one of the 5 valid Chennai area names (URL-encoded if spaces).

**Query params:** `?time_slot=afternoon` (optional — filters to a specific time window)

**Response 200:**
```json
{
  "area": "Velachery",
  "summary": {
    "success_rate": 0.72,
    "failure_rate": 0.28,
    "total_orders": 25,
    "risk_level": "medium"
  },
  "weather_impact": {
    "clear_success_rate": 0.89,
    "rainy_success_rate": 0.54,
    "rain_impact": "high"
  },
  "best_delivery_window": {
    "window": "morning",
    "predicted_success_rate": 0.91
  },
  "by_time_slot": [
    { "window": "morning",   "success_rate": 0.91, "order_count": 8 },
    { "window": "afternoon", "success_rate": 0.75, "order_count": 10 },
    { "window": "evening",   "success_rate": 0.50, "order_count": 7 }
  ],
  "top_failure_reasons": [
    { "reason": "weather_risk",      "pct": 0.42 },
    { "reason": "customer_absent",   "pct": 0.31 },
    { "reason": "traffic",           "pct": 0.27 }
  ],
  "model_predicted_failure_rate": 0.27
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_AREA` | Unknown area name |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### GET /api/analytics/customer
👔 Manager only

**Purpose:** Customer Insights page — aggregated history for a specific customer address (spec §2.5).

**Query params:**
- `address` (required) — exact `customer_address` string

**Response 200:**
```json
{
  "customer_address": "7 Main Road, Adyar, Chennai",
  "customer_name": "Anitha Suresh",
  "summary": {
    "total_orders": 5,
    "delivered": 4,
    "failed": 1,
    "postponed": 0,
    "success_rate": 0.80,
    "risk_level": "medium"
  },
  "preferred_delivery_time": "morning",
  "recent_orders": [
    {
      "order_number": "LM-0001",
      "date": "2026-06-21",
      "status": "delivered",
      "time_window": "morning"
    }
  ]
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `MISSING_PARAM` | `address` query param not provided |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `NO_HISTORY_FOUND` | No orders matching this address |

---

### GET /api/analytics/heatmap
👔 Manager only

**Purpose:** Area failure-rate data for the Leaflet heatmap overlay (spec §2.10f).

**Query params:**
- `time_slot`: optional — `"morning"`, `"afternoon"`, `"evening"` (returns time-slot filtered rates if provided, all-day averages if omitted)

**Response 200:**
```json
{
  "time_slot": null,
  "zones": [
    {
      "area": "Anna Nagar",
      "centroid": { "lat": 13.0850, "lon": 80.2101 },
      "failure_rate": 0.10,
      "risk_band": "low",
      "order_count": 22
    },
    {
      "area": "T Nagar",
      "centroid": { "lat": 13.0418, "lon": 80.2341 },
      "failure_rate": 0.15,
      "risk_band": "low",
      "order_count": 20
    },
    {
      "area": "Velachery",
      "centroid": { "lat": 12.9815, "lon": 80.2180 },
      "failure_rate": 0.28,
      "risk_band": "medium",
      "order_count": 25
    },
    {
      "area": "Adyar",
      "centroid": { "lat": 13.0063, "lon": 80.2574 },
      "failure_rate": 0.22,
      "risk_band": "medium",
      "order_count": 18
    },
    {
      "area": "Porur",
      "centroid": { "lat": 13.0358, "lon": 80.1567 },
      "failure_rate": 0.08,
      "risk_band": "low",
      "order_count": 16
    }
  ]
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### GET /api/analytics/weather-impact
👔 Manager only

**Purpose:** Correlates OpenWeather data with historical success/failure rates over time (KPI Analytics page — Weather Impact Analysis).

**Query params:** `?period=month`

**Response 200:**
```json
{
  "period": "month",
  "correlation": [
    {
      "date": "2026-06-01",
      "weather_condition": "Clear",
      "success_rate": 0.91,
      "order_count": 18
    },
    {
      "date": "2026-06-03",
      "weather_condition": "Light Rain",
      "success_rate": 0.74,
      "order_count": 16
    },
    {
      "date": "2026-06-04",
      "weather_condition": "Heavy Rain",
      "success_rate": 0.48,
      "order_count": 12
    }
  ],
  "summary": {
    "clear_avg_success": 0.91,
    "light_rain_avg_success": 0.75,
    "heavy_rain_avg_success": 0.49,
    "estimated_revenue_lost_to_weather_inr": 4800.0
  }
}
```

---

## 6. Notifications

### GET /api/notifications
👔🧢 Role-scoped

**Purpose:** Notification Center list. Each user sees only their own notifications.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `page` | 1 | — |
| `per_page` | 20 | max 50 |
| `category` | (all) | Filter by one category |
| `is_read` | (all) | `"true"` or `"false"` |

**Response 200:**
```json
{
  "data": [
    {
      "id": 1,
      "category": "ai_alert",
      "title": "5 orders flagged NO-GO",
      "message": "AI flagged 5 orders as NO-GO. Velachery and Adyar areas most affected. Consider rescheduling.",
      "is_read": false,
      "order_id": null,
      "extra": null,
      "created_at": "2026-06-24T09:00:00Z"
    }
  ],
  "unread_counts": {
    "ai_alert": 2,
    "delivery_alert": 1,
    "weather_alert": 3,
    "system_alert": 0,
    "total": 6
  },
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 10,
    "pages": 1
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |

---

### PATCH /api/notifications/:id/read
🔑 Any authenticated user (own notifications only)

**Purpose:** Mark a single notification as read.

**Request body:** none

**Response 200:**
```json
{
  "id": 1,
  "is_read": true
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Notification belongs to another user |
| 404 | `NOTIFICATION_NOT_FOUND` | — |

---

### PATCH /api/notifications/read-all
🔑 Any authenticated user

**Purpose:** Mark all own notifications read. Optionally scoped to one category.

**Request body:**
```json
{
  "category": "weather_alert"
}
```
Or omit `category` to mark all categories read.

**Response 200:**
```json
{
  "updated_count": 3
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_CATEGORY` | Unknown category string |
| 401 | `UNAUTHORIZED` | — |

---

### DELETE /api/notifications/:id
🔑 Any authenticated user (own notifications only)

**Purpose:** Delete a notification permanently.

**Request body:** none

**Response 200:**
```json
{
  "message": "Notification deleted"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Notification belongs to another user |
| 404 | `NOTIFICATION_NOT_FOUND` | — |

---

## 7. AI Operations

### GET /api/ai-ops/alerts
👔🧢 Role-scoped

**Purpose:** AI Operations Center — proactive alerts (spec §2.10g). Scanned on load and cached for 15 min.
- Manager: all areas, all agents
- Agent: own orders and own area only

**Response 200:**
```json
{
  "generated_at": "2026-06-24T10:00:00Z",
  "alerts": [
    {
      "id": "alert-001",
      "type": "warning",
      "icon": "⚠️",
      "title": "5 orders should be postponed",
      "detail": "5 pending orders have risk score ≥ 61 (NO-GO). Areas: Velachery (3), Adyar (2).",
      "category": "ai_alert",
      "affected_order_ids": [5, 11, 17, 23, 29]
    },
    {
      "id": "alert-002",
      "type": "warning",
      "icon": "⚠️",
      "title": "Heavy rain expected tomorrow in Velachery",
      "detail": "OpenWeather forecast: heavy rain 25 Jun afternoon. 8 orders at elevated risk.",
      "category": "weather_alert",
      "affected_order_ids": []
    },
    {
      "id": "alert-003",
      "type": "warning",
      "icon": "⚠️",
      "title": "Adyar failure rate increased 8%",
      "detail": "Adyar area failure rate rose from 14% to 22% over the past 3 days.",
      "category": "ai_alert",
      "affected_order_ids": []
    }
  ]
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |

---

### GET /api/ai-ops/recommendations
👔 Manager only

**Purpose:** Actionable recommendations the Manager can accept with one click (spec §2.10g).

**Response 200:**
```json
{
  "generated_at": "2026-06-24T10:00:00Z",
  "recommendations": [
    {
      "id": 7,
      "icon": "💡",
      "title": "Reassign 3 orders to Ravi Kumar",
      "detail": "Ravi Kumar has 2 spare time slots this afternoon and a 96% success rate. Reassigning LM-0011, LM-0017, LM-0023 from Surya Venkat (overloaded, 5 pending) would balance load.",
      "action_type": "reassign_orders",
      "payload": {
        "order_ids": [11, 17, 23],
        "from_agent_id": 4,
        "to_agent_id": 2
      },
      "status": "pending"
    },
    {
      "id": 8,
      "icon": "💡",
      "title": "Postpone 2 high-risk Velachery orders",
      "detail": "Orders LM-0005 and LM-0023 in Velachery have risk score ≥ 72 due to rain. Reschedule to 26 Jun afternoon (predicted success: 83%).",
      "action_type": "postpone_orders",
      "payload": {
        "order_ids": [5, 23],
        "suggested_date": "2026-06-26",
        "suggested_window": "afternoon"
      },
      "status": "pending"
    }
  ]
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### POST /api/ai-ops/recommendations/:id/accept
👔 Manager only

**Purpose:** Execute an AI recommendation with one click. Performs the actual backend action (order reassignment or status update) and writes an audit log entry.

**Request body:** none

**Response 200:**
```json
{
  "recommendation_id": 7,
  "action_type": "reassign_orders",
  "status": "accepted",
  "result": {
    "orders_updated": 3,
    "order_numbers": ["LM-0011", "LM-0017", "LM-0023"],
    "from_agent": "Surya Venkat",
    "to_agent": "Ravi Kumar"
  },
  "message": "3 orders successfully reassigned to Ravi Kumar"
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |
| 404 | `RECOMMENDATION_NOT_FOUND` | ID expired or already actioned |
| 409 | `ALREADY_ACTIONED` | Recommendation was already accepted or dismissed |

---

## 8. Chat

### POST /api/chat/message
👔🧢 Role-scoped

**Purpose:** Send a message to the AI assistant. Pipeline: NLP intent classifier → data fetch → Gemini reply (spec §2.11). Manager and Agent tones differ.

**Request body:**
```json
{
  "message": "Which area has the most failed deliveries this week?",
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Validation rules:**
- `message`: required, string, 1–1000 chars
- `session_id`: optional UUID string — if provided, appends to the existing conversation thread; if omitted, a new session is started

**Response 200:**
```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "user_message": {
    "id": 101,
    "role": "user",
    "message": "Which area has the most failed deliveries this week?",
    "intent": "area_risk",
    "intent_confidence": 0.94,
    "created_at": "2026-06-24T10:30:00Z"
  },
  "assistant_message": {
    "id": 102,
    "role": "assistant",
    "message": "Velachery had the highest failure rate this week at 28% (7 out of 25 deliveries). The main contributors were weather risk (35%) and evening time-window issues (30%). I'd suggest shifting Velachery deliveries to the morning window when rain is expected to clear.",
    "gemini_tokens_used": 312,
    "created_at": "2026-06-24T10:30:01Z"
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Message too long or empty |
| 401 | `UNAUTHORIZED` | — |
| 503 | `GEMINI_UNAVAILABLE` | Gemini API unreachable — fallback template reply used instead |

---

### GET /api/chat/history
👔🧢 Role-scoped

**Purpose:** Retrieve message history. Each user sees only their own messages.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `session_id` | (all) | Filter to one conversation session |
| `page` | 1 | — |
| `per_page` | 20 | max 50 |

**Response 200:**
```json
{
  "data": [
    {
      "id": 101,
      "role": "user",
      "message": "Which area has the most failed deliveries this week?",
      "intent": "area_risk",
      "intent_confidence": 0.94,
      "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "created_at": "2026-06-24T10:30:00Z"
    },
    {
      "id": 102,
      "role": "assistant",
      "message": "Velachery had the highest failure rate...",
      "intent": null,
      "intent_confidence": null,
      "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "created_at": "2026-06-24T10:30:01Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 6,
    "pages": 1
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |

---

## 9. Weather

### GET /api/weather/current
👔🧢 Role-scoped (Agent: own area only if area param omitted)

**Purpose:** Current weather conditions for a Chennai area. Proxies OpenWeatherMap to keep the API key server-side.

**Query params:**
- `area` (required for Manager; optional for Agent — defaults to their own area)

**Response 200:**
```json
{
  "area": "Adyar",
  "fetched_at": "2026-06-24T10:45:00Z",
  "condition": "Light Rain",
  "description": "light rain",
  "temp_c": 27.8,
  "feels_like_c": 30.2,
  "humidity_pct": 84,
  "wind_kmh": 22.0,
  "wind_direction": "NE",
  "visibility_km": 6.0,
  "risk_assessment": {
    "weather_risk_score": 0.62,
    "delivery_impact": "medium",
    "recommendation": "Proceed with caution. Rain may cause 15–25% higher failure rate."
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_AREA` | Unknown area name |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent requesting another area's weather |
| 503 | `WEATHER_API_ERROR` | OpenWeatherMap unreachable |

---

### GET /api/weather/forecast
👔🧢 Role-scoped

**Purpose:** 3-day weather forecast for a Chennai area. Used by reschedule prediction to find the best future slot.

**Query params:**
- `area` (required for Manager; defaults to own area for Agent)
- `days` (optional, integer 1–3, default 3)

**Response 200:**
```json
{
  "area": "Adyar",
  "fetched_at": "2026-06-24T10:45:00Z",
  "forecast": [
    {
      "date": "2026-06-25",
      "morning":   { "condition": "Light Rain", "temp_c": 27, "wind_kmh": 20, "risk_score": 0.58 },
      "afternoon": { "condition": "Cloudy",     "temp_c": 30, "wind_kmh": 14, "risk_score": 0.31 },
      "evening":   { "condition": "Clear",      "temp_c": 28, "wind_kmh": 10, "risk_score": 0.12 }
    },
    {
      "date": "2026-06-26",
      "morning":   { "condition": "Clear",      "temp_c": 32, "wind_kmh": 8,  "risk_score": 0.10 },
      "afternoon": { "condition": "Clear",      "temp_c": 34, "wind_kmh": 9,  "risk_score": 0.09 },
      "evening":   { "condition": "Cloudy",     "temp_c": 29, "wind_kmh": 12, "risk_score": 0.18 }
    },
    {
      "date": "2026-06-27",
      "morning":   { "condition": "Clear",      "temp_c": 31, "wind_kmh": 7,  "risk_score": 0.08 },
      "afternoon": { "condition": "Light Rain", "temp_c": 28, "wind_kmh": 18, "risk_score": 0.45 },
      "evening":   { "condition": "Rain",       "temp_c": 26, "wind_kmh": 28, "risk_score": 0.72 }
    }
  ]
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `INVALID_PARAM` | `days` out of range or unknown area |
| 401 | `UNAUTHORIZED` | — |
| 503 | `WEATHER_API_ERROR` | OpenWeatherMap unreachable |

---

## 10. Audit

### GET /api/audit/logs
👔 Manager only

**Purpose:** Paginated audit log table (Phase 2 page, spec §2.10 #5).

**Query params:**
| Param | Default | Description |
|---|---|---|
| `page` | 1 | — |
| `per_page` | 50 | max 100 |
| `entity_type` | (all) | `"order"`, `"agent"`, `"decision"`, `"system"` |
| `actor_id` | (all) | Filter by who performed the action |
| `action` | (all) | Exact action code string |
| `date_from` | (all) | ISO 8601 date |
| `date_to` | (all) | ISO 8601 date |

**Response 200:**
```json
{
  "data": [
    {
      "id": 12,
      "entity_type": "decision",
      "entity_id": 10,
      "action": "ai_flagged_no_go",
      "description": "AI flagged LM-0011 as NO-GO — risk score 68",
      "actor_id": null,
      "actor_name": "System",
      "old_value": null,
      "new_value": { "decision": "NO-GO", "risk_score": 68 },
      "created_at": "2026-06-24T08:00:00Z"
    },
    {
      "id": 11,
      "entity_type": "system",
      "entity_id": null,
      "action": "model_deployed",
      "description": "GO/NO-GO Logistic Regression v1.0 promoted to production",
      "actor_id": null,
      "actor_name": "System",
      "old_value": null,
      "new_value": { "model": "gonogo_lr", "version": "v1.0" },
      "created_at": "2026-06-23T22:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 12,
    "pages": 1
  }
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

### GET /api/audit/feed
👔🧢 Role-scoped

**Purpose:** Real-time-styled Activity Feed for dashboards. Returns newest entries first, limited count, human-readable text.
- Manager: all actors' activity
- Agent: own activity only

**Query params:**
| Param | Default | Description |
|---|---|---|
| `limit` | 20 | max 50 |
| `before_id` | (none) | Keyset pagination cursor — returns entries with id < before_id |

**Response 200:**
```json
{
  "feed": [
    {
      "id": 12,
      "description": "AI flagged Order #120 as NO-GO",
      "action": "ai_flagged_no_go",
      "actor_name": "System",
      "created_at": "2026-06-24T10:22:00Z",
      "relative_time": "2 minutes ago"
    },
    {
      "id": 11,
      "description": "Agent Ravi Kumar entered Adyar zone",
      "action": "agent_zone_entered",
      "actor_name": "Ravi Kumar",
      "created_at": "2026-06-24T10:29:00Z",
      "relative_time": "1 minute ago"
    },
    {
      "id": 10,
      "description": "Order #124 marked Delivered by Agent Ravi Kumar",
      "action": "order_status_changed",
      "actor_name": "Ravi Kumar",
      "created_at": "2026-06-24T10:32:00Z",
      "relative_time": "just now"
    }
  ],
  "next_cursor": 9
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 401 | `UNAUTHORIZED` | — |

---

## 11. ML Model

### GET /api/ml/models
👔 Manager only

**Purpose:** All model metadata rows (Settings → Model Settings, spec §2.5).

**Response 200:**
```json
{
  "models": [
    {
      "id": 1,
      "model_name": "gonogo_lr",
      "model_version": "v1.0",
      "is_production": true,
      "accuracy": 0.914,
      "precision_score": 0.907,
      "recall_score": 0.921,
      "f1_score": 0.914,
      "dataset_size": 5000,
      "artifact_path": "ml/models/lr_gonogo_v1.0.pkl",
      "trained_at": "2026-06-23T22:00:00Z"
    },
    {
      "id": 2,
      "model_name": "gonogo_rf",
      "model_version": "v1.0",
      "is_production": false,
      "accuracy": 0.927,
      "precision_score": 0.918,
      "recall_score": 0.935,
      "f1_score": 0.926,
      "dataset_size": 5000,
      "artifact_path": "ml/models/rf_gonogo_v1.0.pkl",
      "trained_at": "2026-06-23T22:00:00Z"
    }
  ]
}
```

---

### GET /api/ml/comparison
👔 Manager only

**Purpose:** Model Comparison Page — LR vs RF side-by-side (spec §2.10d).

**Response 200:**
```json
{
  "comparison": [
    {
      "model_name": "gonogo_lr",
      "model_version": "v1.0",
      "label": "Logistic Regression",
      "role": "production",
      "accuracy": 0.914,
      "precision_score": 0.907,
      "recall_score": 0.921,
      "f1_score": 0.914,
      "confusion_matrix": { "tn": 412, "fp": 38, "fn": 22, "tp": 528 },
      "dataset_size": 5000,
      "trained_at": "2026-06-23T22:00:00Z"
    },
    {
      "model_name": "gonogo_rf",
      "model_version": "v1.0",
      "label": "Random Forest",
      "role": "validation",
      "accuracy": 0.927,
      "precision_score": 0.918,
      "recall_score": 0.935,
      "f1_score": 0.926,
      "confusion_matrix": { "tn": 418, "fp": 32, "fn": 18, "tp": 532 },
      "dataset_size": 5000,
      "trained_at": "2026-06-23T22:00:00Z"
    }
  ]
}
```

---

### GET /api/ml/feature-importance
👔 Manager only

**Purpose:** Global feature importance ranking across all 7 GO/NO-GO factors (spec §2.10 #2).

**Response 200:**
```json
{
  "model_name": "gonogo_lr",
  "model_version": "v1.0",
  "feature_importance": [
    { "rank": 1, "feature": "weather_risk",           "importance": 0.2831, "importance_pct": 28.3 },
    { "rank": 2, "feature": "customer_history_score", "importance": 0.2147, "importance_pct": 21.5 },
    { "rank": 3, "feature": "distance_score",         "importance": 0.1612, "importance_pct": 16.1 },
    { "rank": 4, "feature": "traffic_impact",         "importance": 0.1389, "importance_pct": 13.9 },
    { "rank": 5, "feature": "time_of_day_score",      "importance": 0.0974, "importance_pct": 9.7  },
    { "rank": 6, "feature": "package_size_score",     "importance": 0.0631, "importance_pct": 6.3  },
    { "rank": 7, "feature": "agent_profit_score",     "importance": 0.0416, "importance_pct": 4.2  }
  ]
}
```

---

### PATCH /api/ml/threshold
👔 Manager only

**Purpose:** Adjust the GO/NO-GO decision threshold (Settings → Model Settings, spec §2.5). Stored in the server config; takes effect immediately on subsequent predictions.

**Request body:**
```json
{
  "threshold": 0.55
}
```

**Validation rules:**
- `threshold`: required, float, 0.10–0.90 (warn below 0.3 or above 0.8 but do not reject)

**Response 200:**
```json
{
  "previous_threshold": 0.50,
  "new_threshold": 0.55,
  "message": "GO/NO-GO threshold updated. Higher threshold = more orders classified GO."
}
```

**Error responses:**
| Status | `error` | Trigger |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Threshold out of 0.10–0.90 range |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | Agent role |

---

## 12. Health

### GET /health
🔓 Public

**Purpose:** System health check (spec §2.10 #6). Used by hosting platform uptime monitors and the Manager's Settings → API Integrations panel.

**Request body:** none

**Response 200 (all healthy):**
```json
{
  "status": "ok",
  "timestamp": "2026-06-24T10:45:00Z",
  "checks": {
    "database": {
      "status": "ok",
      "latency_ms": 3
    },
    "ml_model": {
      "status": "ok",
      "model_name": "gonogo_lr",
      "model_version": "v1.0",
      "loaded": true
    },
    "gemini_api": {
      "status": "ok",
      "reachable": true,
      "latency_ms": 142
    },
    "openweather_api": {
      "status": "ok",
      "reachable": true,
      "latency_ms": 88
    }
  }
}
```

**Response 503 (any check failed):**
```json
{
  "status": "degraded",
  "timestamp": "2026-06-24T10:45:00Z",
  "checks": {
    "database": {
      "status": "ok",
      "latency_ms": 3
    },
    "ml_model": {
      "status": "error",
      "model_name": "gonogo_lr",
      "loaded": false,
      "error": "Model file not found at ml/models/lr_gonogo_v1.0.pkl"
    },
    "gemini_api": {
      "status": "ok",
      "reachable": true,
      "latency_ms": 142
    },
    "openweather_api": {
      "status": "ok",
      "reachable": true,
      "latency_ms": 88
    }
  }
}
```

---

## Socket.IO Events (real-time layer)

These are WebSocket events, not REST endpoints. Listed here for frontend reference.

### Connection
```
Client → Server: connect  (with JWT in query param or auth header)
Server → Client: connected { user_id, role }
```
The server joins the client to room `user_{user_id}` on connect.

### Events emitted by the server

| Event | Room | Payload | Trigger |
|---|---|---|---|
| `order_updated` | `user_{agent_id}` | `{ order_id, order_number, status, decision, risk_score }` | Manager edits an order; status changes |
| `new_order_assigned` | `user_{agent_id}` | `{ order_id, order_number, area, deadline }` | Manager assigns/reassigns an order |
| `new_notification` | `user_{user_id}` | `{ notification_id, category, title, message }` | Any new notification row created |
| `urgent_deadline` | `user_{agent_id}` | `{ order_id, order_number, deadline }` | 1 h before deadline for urgent orders |
| `ai_decision` | `user_{manager_id}` | `{ order_id, order_number, decision, risk_level }` | GO/NO-GO prediction completes |
| `agent_location` | `broadcast` (manager rooms only) | `{ agent_id, lat, lon, heading, is_online }` | Agent location updates (simulated GPS ticks) |
| `activity_feed` | `broadcast` (all rooms) | `{ id, description, action, actor_name, created_at }` | Any new audit_log entry |

### Events sent by the client

| Event | Payload | Purpose |
|---|---|---|
| `agent_location_update` | `{ lat, lon, heading, speed_kmh }` | Agent pushes simulated position |
| `join_room` | `{ room }` | Join a specific order room for real-time order detail updates |
| `leave_room` | `{ room }` | Leave an order room |

---

## Appendix — HTTP Status Code Summary

| Code | Used for |
|---|---|
| 200 | Successful GET / PATCH / DELETE |
| 201 | Successful POST (resource created) |
| 400 | Validation error, invalid params, business rule violation |
| 401 | Missing, expired, or invalid JWT |
| 403 | Valid JWT but insufficient role or resource scope |
| 404 | Resource not found |
| 409 | Conflict (duplicate, already actioned) |
| 503 | External dependency unavailable (ML model, Gemini, OpenWeather) |
