double? asDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

int? asInt(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString());
}

class Pagination {
  const Pagination({
    required this.page,
    required this.perPage,
    required this.total,
    required this.pages,
  });

  final int page;
  final int perPage;
  final int total;
  final int pages;

  factory Pagination.fromJson(Map<String, dynamic> json) {
    return Pagination(
      page: asInt(json['page']) ?? 1,
      perPage: asInt(json['per_page']) ?? 20,
      total: asInt(json['total']) ?? 0,
      pages: asInt(json['pages']) ?? 0,
    );
  }
}

class ShapFactor {
  const ShapFactor({required this.factor, required this.contribution});

  final String factor;
  final double contribution;

  factory ShapFactor.fromJson(Map<String, dynamic> json) {
    return ShapFactor(
      factor: json['factor'] as String? ?? '',
      contribution: asDouble(json['contribution']) ?? 0,
    );
  }

  String get label {
    const labels = {
      'weather_risk': 'Weather',
      'customer_history_score': 'Customer history',
      'traffic_impact': 'Traffic',
      'agent_profit_score': 'Agent profit vs effort',
      'distance_score': 'Distance',
      'time_of_day_score': 'Time of day',
      'package_size_score': 'Package size',
    };
    return labels[factor] ?? factor.replaceAll('_', ' ');
  }
}

class WeatherSnapshot {
  const WeatherSnapshot({
    this.condition,
    this.tempC,
    this.humidity,
    this.windKmh,
    this.description,
  });

  final String? condition;
  final double? tempC;
  final int? humidity;
  final double? windKmh;
  final String? description;

  factory WeatherSnapshot.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const WeatherSnapshot();
    return WeatherSnapshot(
      condition: json['condition'] as String?,
      tempC: asDouble(json['temp_c']),
      humidity: asInt(json['humidity']),
      windKmh: asDouble(json['wind_kmh']),
      description: json['description'] as String?,
    );
  }

  bool get hasData =>
      condition != null || tempC != null || description != null;
}

class RescheduleSuggestion {
  const RescheduleSuggestion({
    this.suggestedDate,
    this.suggestedWindow,
    this.predictedSuccessProbability,
    this.reason,
  });

  final String? suggestedDate;
  final String? suggestedWindow;
  final double? predictedSuccessProbability;
  final String? reason;

  factory RescheduleSuggestion.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const RescheduleSuggestion();
    return RescheduleSuggestion(
      suggestedDate: json['suggested_date'] as String?,
      suggestedWindow: json['suggested_window'] as String?,
      predictedSuccessProbability: asDouble(json['predicted_success_probability']),
      reason: json['reason'] as String?,
    );
  }

  bool get hasData =>
      (reason != null && reason!.isNotEmpty) || suggestedDate != null;
}

class DecisionSummary {
  const DecisionSummary({
    required this.id,
    required this.decision,
    required this.successProbability,
    required this.riskScore,
    required this.riskLevel,
    this.modelName,
    this.modelVersion,
    this.topFactors = const [],
    this.weather = const WeatherSnapshot(),
    this.reschedule = const RescheduleSuggestion(),
    this.createdAt,
  });

  final int id;
  final String decision;
  final double successProbability;
  final int riskScore;
  final String riskLevel;
  final String? modelName;
  final String? modelVersion;
  final List<ShapFactor> topFactors;
  final WeatherSnapshot weather;
  final RescheduleSuggestion reschedule;
  final String? createdAt;

  bool get isGo => decision == 'GO';
  bool get isNoGo => decision == 'NO-GO';

  factory DecisionSummary.fromJson(Map<String, dynamic> json) {
    final factorsRaw = json['top_factors'];
    return DecisionSummary(
      id: asInt(json['id']) ?? 0,
      decision: json['decision'] as String? ?? '',
      successProbability: asDouble(json['success_probability']) ?? 0,
      riskScore: asInt(json['risk_score']) ?? 0,
      riskLevel: json['risk_level'] as String? ?? 'medium',
      modelName: json['model_name'] as String?,
      modelVersion: json['model_version'] as String?,
      topFactors: factorsRaw is List
          ? factorsRaw
              .whereType<Map<String, dynamic>>()
              .map(ShapFactor.fromJson)
              .toList()
          : const [],
      weather: WeatherSnapshot.fromJson(json['weather_snapshot'] as Map<String, dynamic>?),
      reschedule: RescheduleSuggestion.fromJson(
        json['reschedule_suggestion'] as Map<String, dynamic>?,
      ),
      createdAt: json['created_at'] as String?,
    );
  }
}

class Order {
  const Order({
    required this.id,
    required this.orderNumber,
    required this.customerName,
    this.customerPhone,
    required this.customerAddress,
    required this.area,
    this.city = 'Chennai',
    required this.latitude,
    required this.longitude,
    this.residenceType,
    this.agentId,
    this.agentName,
    required this.packageSize,
    required this.timeWindow,
    required this.deadline,
    required this.status,
    this.failureReason,
    required this.paymentAmount,
    this.isUrgent = false,
    this.decision,
    this.riskScore,
    this.riskLevel,
    this.createdAt,
    this.updatedAt,
    this.createdBy,
    this.trackingToken,
    this.latestDecision,
  });

  final int id;
  final String orderNumber;
  final String customerName;
  final String? customerPhone;
  final String customerAddress;
  final String area;
  final String city;
  final double latitude;
  final double longitude;
  final String? residenceType;
  final int? agentId;
  final String? agentName;
  final String packageSize;
  final String timeWindow;
  final String deadline;
  final String status;
  final String? failureReason;
  final double paymentAmount;
  final bool isUrgent;
  final String? decision;
  final int? riskScore;
  final String? riskLevel;
  final String? createdAt;
  final String? updatedAt;
  final int? createdBy;
  final String? trackingToken;
  final DecisionSummary? latestDecision;

  String get effectiveDecision => latestDecision?.decision ?? decision ?? '';
  String get effectiveRiskLevel => latestDecision?.riskLevel ?? riskLevel ?? '';
  int? get effectiveRiskScore => latestDecision?.riskScore ?? riskScore;

  factory Order.fromJson(Map<String, dynamic> json) {
    final latest = json['latest_decision'];
    return Order(
      id: asInt(json['id']) ?? 0,
      orderNumber: json['order_number'] as String? ?? '',
      customerName: json['customer_name'] as String? ?? '',
      customerPhone: json['customer_phone'] as String?,
      customerAddress: json['customer_address'] as String? ?? '',
      area: json['area'] as String? ?? '',
      city: json['city'] as String? ?? 'Chennai',
      latitude: asDouble(json['latitude']) ?? 0,
      longitude: asDouble(json['longitude']) ?? 0,
      residenceType: json['residence_type'] as String?,
      agentId: asInt(json['agent_id']),
      agentName: json['agent_name'] as String?,
      packageSize: json['package_size'] as String? ?? '',
      timeWindow: json['time_window'] as String? ?? '',
      deadline: json['deadline'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      failureReason: json['failure_reason'] as String?,
      paymentAmount: asDouble(json['payment_amount']) ?? 0,
      isUrgent: json['is_urgent'] as bool? ?? false,
      decision: json['decision'] as String?,
      riskScore: asInt(json['risk_score']),
      riskLevel: json['risk_level'] as String?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
      createdBy: asInt(json['created_by']),
      trackingToken: json['tracking_token'] as String?,
      latestDecision: latest is Map<String, dynamic>
          ? DecisionSummary.fromJson(latest)
          : null,
    );
  }
}

class OrderListResponse {
  const OrderListResponse({required this.data, required this.pagination});

  final List<Order> data;
  final Pagination pagination;

  factory OrderListResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['data'];
    return OrderListResponse(
      data: raw is List
          ? raw.whereType<Map<String, dynamic>>().map(Order.fromJson).toList()
          : const [],
      pagination: Pagination.fromJson(
        json['pagination'] as Map<String, dynamic>? ?? <String, dynamic>{},
      ),
    );
  }
}

class OrderEta {
  const OrderEta({
    required this.orderId,
    required this.predictedMin,
    this.etaLowMin,
    this.etaHighMin,
    this.etaTime,
    this.distanceKm,
  });

  final int orderId;
  final int predictedMin;
  final int? etaLowMin;
  final int? etaHighMin;
  final String? etaTime;
  final double? distanceKm;

  factory OrderEta.fromJson(Map<String, dynamic> json) {
    return OrderEta(
      orderId: asInt(json['order_id']) ?? 0,
      predictedMin: asInt(json['predicted_min']) ?? 0,
      etaLowMin: asInt(json['eta_low_min']),
      etaHighMin: asInt(json['eta_high_min']),
      etaTime: json['eta_time'] as String?,
      distanceKm: asDouble(json['distance_km']),
    );
  }
}

class RouteStop {
  const RouteStop({
    required this.orderId,
    required this.orderNumber,
    required this.sequence,
    required this.customerName,
    required this.latitude,
    required this.longitude,
    required this.status,
    this.riskLevel,
    this.isUrgent = false,
  });

  final int orderId;
  final String orderNumber;
  final int sequence;
  final String customerName;
  final double latitude;
  final double longitude;
  final String status;
  final String? riskLevel;
  final bool isUrgent;

  factory RouteStop.fromJson(Map<String, dynamic> json) {
    return RouteStop(
      orderId: asInt(json['order_id']) ?? 0,
      orderNumber: json['order_number'] as String? ?? '',
      sequence: asInt(json['sequence']) ?? 0,
      customerName: json['customer_name'] as String? ?? '',
      latitude: asDouble(json['latitude']) ?? 0,
      longitude: asDouble(json['longitude']) ?? 0,
      status: json['status'] as String? ?? '',
      riskLevel: json['risk_level'] as String?,
      isUrgent: json['is_urgent'] as bool? ?? false,
    );
  }
}

class OptimizedRoute {
  const OptimizedRoute({
    this.stops = const [],
    this.totalDistanceKm = 0,
    this.totalDurationMin = 0,
    this.routeGeometry = const [],
  });

  final List<RouteStop> stops;
  final double totalDistanceKm;
  final double totalDurationMin;
  /// Backend sends [lat, lon] pairs (Leaflet order).
  final List<List<double>> routeGeometry;

  factory OptimizedRoute.fromJson(Map<String, dynamic> json) {
    final stopsRaw = json['stops'];
    final geomRaw = json['route_geometry'];
    return OptimizedRoute(
      stops: stopsRaw is List
          ? stopsRaw.whereType<Map<String, dynamic>>().map(RouteStop.fromJson).toList()
          : const [],
      totalDistanceKm: asDouble(json['total_distance_km']) ?? 0,
      totalDurationMin: asDouble(json['total_duration_min']) ?? 0,
      routeGeometry: geomRaw is List
          ? [
              for (final p in geomRaw)
                if (p is List && p.length >= 2)
                  [asDouble(p[0]) ?? 0, asDouble(p[1]) ?? 0],
            ]
          : const [],
    );
  }
}
