"""
Marshmallow schemas for Order endpoint input validation.
These are request-body validators only — serialization is handled by model .to_dict().
"""

from datetime import datetime, timezone

from marshmallow import (
    Schema, fields, validate, validates, validates_schema, ValidationError, EXCLUDE
)

from app.models.order import Order

# Single source of truth — was a 5th separately-hardcoded copy of the area
# list (after User, Order, seed.py, and analytics_service all had their own);
# import instead of duplicating so this can never drift again.
VALID_AREAS = Order.VALID_AREAS
VALID_PACKAGE_SIZES = ["small", "medium", "large"]
VALID_TIME_WINDOWS = ["morning", "afternoon", "evening"]
VALID_RESIDENCE_TYPES = ["apartment", "independent"]
VALID_SORT_FIELDS = ["created_at", "deadline", "risk_score", "payment_amount"]
VALID_SORT_DIRS = ["asc", "desc"]
VALID_STATUSES = ["pending", "in_transit", "delivered", "failed", "postponed"]
AGENT_SETTABLE_STATUSES = ["delivered", "failed", "postponed"]


class OrderCreateSchema(Schema):
    """Validates POST /api/orders request body. All fields required except customer_phone, agent_id."""

    class Meta:
        unknown = EXCLUDE  # silently drop unrecognised fields (mass-assignment guard)

    customer_name    = fields.Str(required=True)
    customer_phone   = fields.Str(load_default=None, allow_none=True)
    customer_address = fields.Str(required=True)
    area             = fields.Str(required=True, validate=validate.OneOf(VALID_AREAS))
    latitude         = fields.Float(required=True)
    longitude        = fields.Float(required=True)
    residence_type   = fields.Str(required=True, validate=validate.OneOf(VALID_RESIDENCE_TYPES))
    agent_id         = fields.Int(load_default=None, allow_none=True)
    package_size     = fields.Str(required=True, validate=validate.OneOf(VALID_PACKAGE_SIZES))
    time_window      = fields.Str(required=True, validate=validate.OneOf(VALID_TIME_WINDOWS))
    deadline         = fields.DateTime(required=True, format="iso")
    payment_amount   = fields.Float(required=True)

    @validates("customer_name")
    def validate_customer_name(self, value, **_):
        v = (value or "").strip()
        if not (1 <= len(v) <= 120):
            raise ValidationError("Must be 1–120 characters.")

    @validates("customer_phone")
    def validate_customer_phone(self, value, **_):
        if value is not None:
            v = str(value).strip()
            if not v.isdigit() or not (10 <= len(v) <= 15):
                raise ValidationError("Must be 10–15 digits only.")

    @validates("customer_address")
    def validate_customer_address(self, value, **_):
        if not (value or "").strip():
            raise ValidationError("Must be a non-empty string.")

    @validates("latitude")
    def validate_latitude(self, value, **_):
        if not (12.80 <= value <= 13.25):
            raise ValidationError("Must be within Chennai bounds (12.80–13.25).")

    @validates("longitude")
    def validate_longitude(self, value, **_):
        if not (80.10 <= value <= 80.35):
            raise ValidationError("Must be within Chennai bounds (80.10–80.35).")

    @validates("payment_amount")
    def validate_payment_amount(self, value, **_):
        if value <= 0:
            raise ValidationError("Must be greater than 0.")

    @validates("deadline")
    def validate_deadline(self, value, **_):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        if value <= datetime.now(timezone.utc):
            raise ValidationError("Must be a future datetime.")


class OrderUpdateSchema(Schema):
    """
    Validates PUT /api/orders/:id request body.
    All fields are optional; at least one is required (enforced in route).
    """

    class Meta:
        unknown = EXCLUDE

    customer_name    = fields.Str(load_default=None)
    customer_phone   = fields.Str(load_default=None, allow_none=True)
    customer_address = fields.Str(load_default=None)
    area             = fields.Str(load_default=None, validate=validate.OneOf(VALID_AREAS))
    latitude         = fields.Float(load_default=None)
    longitude        = fields.Float(load_default=None)
    residence_type   = fields.Str(load_default=None, validate=validate.OneOf(VALID_RESIDENCE_TYPES))
    agent_id         = fields.Int(load_default=None, allow_none=True)
    package_size     = fields.Str(load_default=None, validate=validate.OneOf(VALID_PACKAGE_SIZES))
    time_window      = fields.Str(load_default=None, validate=validate.OneOf(VALID_TIME_WINDOWS))
    deadline         = fields.DateTime(load_default=None, format="iso")
    payment_amount   = fields.Float(load_default=None)

    @validates("customer_name")
    def validate_customer_name(self, value, **_):
        if value is not None:
            v = str(value).strip()
            if not (1 <= len(v) <= 120):
                raise ValidationError("Must be 1–120 characters.")

    @validates("customer_phone")
    def validate_customer_phone(self, value, **_):
        if value is not None:
            v = str(value).strip()
            if not v.isdigit() or not (10 <= len(v) <= 15):
                raise ValidationError("Must be 10–15 digits only.")

    @validates("latitude")
    def validate_latitude(self, value, **_):
        if value is not None and not (12.80 <= value <= 13.25):
            raise ValidationError("Must be within Chennai bounds (12.80–13.25).")

    @validates("longitude")
    def validate_longitude(self, value, **_):
        if value is not None and not (80.10 <= value <= 80.35):
            raise ValidationError("Must be within Chennai bounds (80.10–80.35).")

    @validates("payment_amount")
    def validate_payment_amount(self, value, **_):
        if value is not None and value <= 0:
            raise ValidationError("Must be greater than 0.")

    @validates("deadline")
    def validate_deadline(self, value, **_):
        if value is not None:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            if value <= datetime.now(timezone.utc):
                raise ValidationError("Must be a future datetime.")


class OrderStatusSchema(Schema):
    """Validates PATCH /api/orders/:id/status request body (Agent only)."""

    class Meta:
        unknown = EXCLUDE

    status         = fields.Str(required=True, validate=validate.OneOf(AGENT_SETTABLE_STATUSES))
    failure_reason = fields.Str(load_default=None, allow_none=True)

    @validates_schema
    def validate_failure_reason_conditional(self, data, **_):
        status = data.get("status")
        reason = data.get("failure_reason")
        if status in ("failed", "postponed") and not reason:
            raise ValidationError(
                {"failure_reason": "Required when status is 'failed' or 'postponed'."}
            )
        if status == "delivered" and reason:
            raise ValidationError(
                {"failure_reason": "Must be null when status is 'delivered'."}
            )


def parse_list_filters(args: dict) -> dict:
    """
    Parse and coerce GET /api/orders query-string params.
    Returns a clean dict; raises ValidationError on invalid values.
    """
    errors = {}

    def _int(key, default=1, min_val=1, max_val=None):
        raw = args.get(key, default)
        try:
            v = int(raw)
            if v < min_val:
                v = min_val
            if max_val and v > max_val:
                v = max_val
            return v
        except (TypeError, ValueError):
            errors[key] = f"Must be an integer (got {raw!r})."
            return default

    def _bool(key):
        raw = args.get(key)
        if raw is None:
            return None
        if str(raw).lower() in ("true", "1"):
            return True
        if str(raw).lower() in ("false", "0"):
            return False
        errors[key] = "Must be 'true' or 'false'."
        return None

    def _date(key):
        raw = args.get(key)
        if raw is None:
            return None
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            errors[key] = f"Must be an ISO 8601 date (got {raw!r})."
            return None

    sort_by = args.get("sort_by", "created_at")
    if sort_by not in VALID_SORT_FIELDS:
        errors["sort_by"] = f"Must be one of: {', '.join(VALID_SORT_FIELDS)}."
        sort_by = "created_at"

    sort_dir = args.get("sort_dir", "desc")
    if sort_dir not in VALID_SORT_DIRS:
        errors["sort_dir"] = "Must be 'asc' or 'desc'."
        sort_dir = "desc"

    status = args.get("status")
    if status and status not in VALID_STATUSES:
        errors["status"] = f"Must be one of: {', '.join(VALID_STATUSES)}."
        status = None

    risk_level = args.get("risk_level")
    if risk_level and risk_level not in ("low", "medium", "high"):
        errors["risk_level"] = "Must be 'low', 'medium', or 'high'."
        risk_level = None

    package_size = args.get("package_size")
    if package_size and package_size not in VALID_PACKAGE_SIZES:
        errors["package_size"] = f"Must be one of: {', '.join(VALID_PACKAGE_SIZES)}."
        package_size = None

    area = args.get("area")
    if area and area not in VALID_AREAS:
        errors["area"] = f"Must be one of the 5 valid areas."
        area = None

    if errors:
        raise ValidationError(errors)

    agent_id = args.get("agent_id")
    try:
        agent_id = int(agent_id) if agent_id else None
    except (TypeError, ValueError):
        agent_id = None

    return {
        "page":         _int("page", 1, min_val=1),
        "per_page":     _int("per_page", 20, min_val=1, max_val=100),
        "area":         area,
        "agent_id":     agent_id,
        "status":       status,
        "risk_level":   risk_level,
        "package_size": package_size,
        "is_urgent":    _bool("is_urgent"),
        "date_from":    _date("date_from"),
        "date_to":      _date("date_to"),
        "search":       (args.get("search") or "").strip() or None,
        "sort_by":      sort_by,
        "sort_dir":     sort_dir,
    }
