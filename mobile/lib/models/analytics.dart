import 'order.dart';

const validAreas = [
  'Anna Nagar', 'T Nagar', 'Velachery', 'Adyar', 'Porur',
  'Mylapore', 'Nungambakkam', 'Guindy', 'Tambaram', 'Sholinganallur',
  'Thiruvanmiyur', 'Besant Nagar', 'Kilpauk', 'Egmore', 'Vadapalani',
  'Koyambedu', 'Ambattur', 'Perambur', 'Chromepet', 'Saidapet',
];

class CostSavingsMetrics {
  const CostSavingsMetrics({
    required this.totalOrders,
    required this.goCount,
    required this.noGoCount,
    required this.deliveriesAvoided,
    required this.fuelSavedLitres,
    required this.totalSavingsInr,
    required this.successRateWithAi,
    required this.baselineSuccessRate,
    required this.improvementPct,
  });

  final int totalOrders;
  final int goCount;
  final int noGoCount;
  final int deliveriesAvoided;
  final double fuelSavedLitres;
  final double totalSavingsInr;
  final double successRateWithAi;
  final double baselineSuccessRate;
  final double improvementPct;

  factory CostSavingsMetrics.fromJson(Map<String, dynamic> json) {
    return CostSavingsMetrics(
      totalOrders: asInt(json['total_orders']) ?? 0,
      goCount: asInt(json['go_count']) ?? 0,
      noGoCount: asInt(json['no_go_count']) ?? 0,
      deliveriesAvoided: asInt(json['deliveries_avoided']) ?? 0,
      fuelSavedLitres: asDouble(json['fuel_saved_litres']) ?? 0,
      totalSavingsInr: asDouble(json['total_savings_inr']) ?? 0,
      successRateWithAi: asDouble(json['success_rate_with_ai']) ?? 0,
      baselineSuccessRate: asDouble(json['baseline_success_rate']) ?? 0,
      improvementPct: asDouble(json['improvement_pct']) ?? 0,
    );
  }
}

class CostSavings {
  const CostSavings({
    required this.period,
    required this.scope,
    required this.metrics,
  });

  final String period;
  final String scope;
  final CostSavingsMetrics metrics;

  factory CostSavings.fromJson(Map<String, dynamic> json) {
    return CostSavings(
      period: json['period'] as String? ?? '',
      scope: json['scope'] as String? ?? '',
      metrics: CostSavingsMetrics.fromJson(
        json['metrics'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class DashboardCards {
  const DashboardCards({
    required this.totalOrdersToday,
    required this.deliveriesCompleted,
    required this.highRiskOrders,
    required this.revenueToday,
    required this.estimatedSavings,
    required this.activeAgents,
  });

  final int totalOrdersToday;
  final int deliveriesCompleted;
  final int highRiskOrders;
  final double revenueToday;
  final double estimatedSavings;
  final int activeAgents;

  factory DashboardCards.fromJson(Map<String, dynamic> json) {
    return DashboardCards(
      totalOrdersToday: asInt(json['total_orders_today']) ?? 0,
      deliveriesCompleted: asInt(json['deliveries_completed']) ?? 0,
      highRiskOrders: asInt(json['high_risk_orders']) ?? 0,
      revenueToday: asDouble(json['revenue_today']) ?? 0,
      estimatedSavings: asDouble(json['estimated_savings']) ?? 0,
      activeAgents: asInt(json['active_agents']) ?? 0,
    );
  }
}

class NamedRate {
  const NamedRate({required this.label, required this.value});
  final String label;
  final double value;
}

class DashboardAnalytics {
  const DashboardAnalytics({
    required this.cards,
    required this.successOverTime,
    required this.failureByArea,
    required this.revenueByDay,
  });

  final DashboardCards cards;
  final List<NamedRate> successOverTime;
  final List<NamedRate> failureByArea;
  final List<NamedRate> revenueByDay;

  factory DashboardAnalytics.fromJson(Map<String, dynamic> json) {
    final cards = DashboardCards.fromJson(
      json['cards'] as Map<String, dynamic>? ?? const {},
    );
    final trends = json['trends'] as Map<String, dynamic>? ?? const {};
    return DashboardAnalytics(
      cards: cards,
      successOverTime: _series(trends['success_rate_over_time'], 'date', 'success_rate'),
      failureByArea: _series(trends['failure_rate_by_area'], 'area', 'failure_rate'),
      revenueByDay: _series(trends['revenue_by_day'], 'date', 'revenue'),
    );
  }

  static List<NamedRate> _series(dynamic raw, String labelKey, String valueKey) {
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((row) {
      final map = Map<String, dynamic>.from(row);
      return NamedRate(
        label: map[labelKey]?.toString() ?? '',
        value: asDouble(map[valueKey]) ?? 0,
      );
    }).toList();
  }
}

class AgentPerf {
  const AgentPerf({
    required this.agentName,
    required this.area,
    required this.orderCount,
    required this.deliveredCount,
    required this.successRate,
    required this.performanceScore,
  });

  final String agentName;
  final String area;
  final int orderCount;
  final int deliveredCount;
  final double successRate;
  final double performanceScore;

  factory AgentPerf.fromJson(Map<String, dynamic> json) {
    return AgentPerf(
      agentName: json['agent_name'] as String? ?? '',
      area: json['area'] as String? ?? '',
      orderCount: asInt(json['order_count']) ?? 0,
      deliveredCount: asInt(json['delivered_count']) ?? 0,
      successRate: asDouble(json['success_rate']) ?? 0,
      performanceScore: asDouble(json['performance_score']) ?? 0,
    );
  }
}

class AreaPerf {
  const AreaPerf({
    required this.area,
    required this.totalOrders,
    required this.successCount,
    required this.failureCount,
    required this.avgRiskScore,
  });

  final String area;
  final int totalOrders;
  final int successCount;
  final int failureCount;
  final double avgRiskScore;

  factory AreaPerf.fromJson(Map<String, dynamic> json) {
    return AreaPerf(
      area: json['area'] as String? ?? '',
      totalOrders: asInt(json['total_orders']) ?? 0,
      successCount: asInt(json['success_count']) ?? 0,
      failureCount: asInt(json['failure_count']) ?? 0,
      avgRiskScore: asDouble(json['avg_risk_score']) ?? 0,
    );
  }
}

class KpiReport {
  const KpiReport({
    required this.period,
    required this.totalOrders,
    required this.totalDelivered,
    required this.failedDeliveryPct,
    required this.avgDeliveryTimeMinutes,
    required this.agentPerformance,
    required this.areaPerformance,
  });

  final String period;
  final int totalOrders;
  final int totalDelivered;
  final double failedDeliveryPct;
  final double avgDeliveryTimeMinutes;
  final List<AgentPerf> agentPerformance;
  final List<AreaPerf> areaPerformance;

  factory KpiReport.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? const {};
    return KpiReport(
      period: json['period'] as String? ?? '',
      totalOrders: asInt(summary['total_orders']) ?? 0,
      totalDelivered: asInt(summary['total_delivered']) ?? 0,
      failedDeliveryPct: asDouble(summary['failed_delivery_pct']) ?? 0,
      avgDeliveryTimeMinutes: asDouble(summary['avg_delivery_time_minutes']) ?? 0,
      agentPerformance: (json['agent_performance'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => AgentPerf.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      areaPerformance: (json['area_performance'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => AreaPerf.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class WeatherDay {
  const WeatherDay({
    required this.date,
    required this.condition,
    required this.successRate,
    required this.orderCount,
  });

  final String date;
  final String condition;
  final double successRate;
  final int orderCount;

  factory WeatherDay.fromJson(Map<String, dynamic> json) {
    return WeatherDay(
      date: json['date'] as String? ?? '',
      condition: json['weather_condition'] as String? ?? '',
      successRate: asDouble(json['success_rate']) ?? 0,
      orderCount: asInt(json['order_count']) ?? 0,
    );
  }
}

class WeatherImpact {
  const WeatherImpact({
    required this.period,
    required this.daily,
    required this.clearAvg,
    required this.lightRainAvg,
    required this.heavyRainAvg,
    required this.revenueLostInr,
  });

  final String period;
  final List<WeatherDay> daily;
  final double clearAvg;
  final double lightRainAvg;
  final double heavyRainAvg;
  final double revenueLostInr;

  factory WeatherImpact.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? const {};
    return WeatherImpact(
      period: json['period'] as String? ?? '',
      daily: (json['daily_correlation'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => WeatherDay.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      clearAvg: asDouble(summary['clear_avg_success']) ?? 0,
      lightRainAvg: asDouble(summary['light_rain_avg_success']) ?? 0,
      heavyRainAvg: asDouble(summary['heavy_rain_avg_success']) ?? 0,
      revenueLostInr: asDouble(summary['estimated_revenue_lost_to_weather_inr']) ?? 0,
    );
  }
}

class AreaIntelligence {
  const AreaIntelligence({
    required this.area,
    required this.successRate,
    required this.bestDeliveryTime,
    required this.rainImpact,
    required this.weatherSensitivity,
    required this.riskLevel,
    required this.morning,
    required this.afternoon,
    required this.evening,
  });

  final String area;
  final double? successRate;
  final String? bestDeliveryTime;
  final double? rainImpact;
  final String? weatherSensitivity;
  final String? riskLevel;
  final double? morning;
  final double? afternoon;
  final double? evening;

  factory AreaIntelligence.fromJson(Map<String, dynamic> json) {
    final pred = json['predictions_by_time'] as Map<String, dynamic>? ?? const {};
    return AreaIntelligence(
      area: json['area'] as String? ?? '',
      successRate: asDouble(json['success_rate']),
      bestDeliveryTime: json['best_delivery_time'] as String?,
      rainImpact: asDouble(json['rain_impact']),
      weatherSensitivity: json['weather_sensitivity'] as String?,
      riskLevel: json['risk_level'] as String?,
      morning: asDouble(pred['morning']),
      afternoon: asDouble(pred['afternoon']),
      evening: asDouble(pred['evening']),
    );
  }
}

class CustomerInsightOrder {
  const CustomerInsightOrder({
    required this.orderNumber,
    required this.date,
    required this.status,
    required this.timeWindow,
  });

  final String orderNumber;
  final String date;
  final String status;
  final String timeWindow;

  factory CustomerInsightOrder.fromJson(Map<String, dynamic> json) {
    return CustomerInsightOrder(
      orderNumber: json['order_number'] as String? ?? '',
      date: json['date'] as String? ?? '',
      status: json['status'] as String? ?? '',
      timeWindow: json['time_window'] as String? ?? '',
    );
  }
}

class CustomerInsight {
  const CustomerInsight({
    required this.address,
    required this.totalOrders,
    required this.delivered,
    required this.failed,
    required this.postponed,
    required this.successRate,
    required this.riskLevel,
    required this.preferredDeliveryTime,
    required this.recentOrders,
  });

  final String address;
  final int totalOrders;
  final int delivered;
  final int failed;
  final int postponed;
  final double successRate;
  final String riskLevel;
  final String preferredDeliveryTime;
  final List<CustomerInsightOrder> recentOrders;

  factory CustomerInsight.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? const {};
    return CustomerInsight(
      address: json['address'] as String? ?? '',
      totalOrders: asInt(summary['total_orders']) ?? 0,
      delivered: asInt(summary['delivered']) ?? 0,
      failed: asInt(summary['failed']) ?? 0,
      postponed: asInt(summary['postponed']) ?? 0,
      successRate: asDouble(summary['success_rate']) ?? 0,
      riskLevel: summary['risk_level'] as String? ?? '',
      preferredDeliveryTime: json['preferred_delivery_time'] as String? ?? '',
      recentOrders: (json['recent_orders'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => CustomerInsightOrder.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class LeaderboardAgent {
  const LeaderboardAgent({
    required this.rank,
    required this.agentId,
    required this.agentName,
    required this.area,
    required this.orderCount,
    required this.deliveredCount,
    required this.failedCount,
    required this.successRate,
    required this.performanceScore,
    required this.earningsInr,
  });

  final int rank;
  final int agentId;
  final String agentName;
  final String area;
  final int orderCount;
  final int deliveredCount;
  final int failedCount;
  final double successRate;
  final double performanceScore;
  final double earningsInr;

  factory LeaderboardAgent.fromJson(Map<String, dynamic> json) {
    return LeaderboardAgent(
      rank: asInt(json['rank']) ?? 0,
      agentId: asInt(json['agent_id']) ?? 0,
      agentName: json['agent_name'] as String? ?? '',
      area: json['area'] as String? ?? '—',
      orderCount: asInt(json['order_count']) ?? 0,
      deliveredCount: asInt(json['delivered_count']) ?? 0,
      failedCount: asInt(json['failed_count']) ?? 0,
      successRate: asDouble(json['success_rate']) ?? 0,
      performanceScore: asDouble(json['performance_score']) ?? 0,
      earningsInr: asDouble(json['earnings_inr']) ?? 0,
    );
  }
}

class HeatmapZone {
  const HeatmapZone({
    required this.area,
    required this.orderCount,
    required this.failureRate,
    required this.riskBand,
  });

  final String area;
  final int orderCount;
  final double failureRate;
  final String riskBand;

  factory HeatmapZone.fromJson(Map<String, dynamic> json) {
    return HeatmapZone(
      area: json['area'] as String? ?? '',
      orderCount: asInt(json['order_count']) ?? 0,
      failureRate: asDouble(json['failure_rate']) ?? asDouble(json['live_failure_rate']) ?? 0,
      riskBand: json['risk_band'] as String? ?? '',
    );
  }
}

class DailySummary {
  const DailySummary({
    required this.summary,
    required this.generatedAt,
  });

  final String summary;
  final String generatedAt;

  factory DailySummary.fromJson(Map<String, dynamic> json) {
    return DailySummary(
      summary: json['summary'] as String? ?? '',
      generatedAt: json['generated_at'] as String? ?? '',
    );
  }
}

class CurrentWeather {
  const CurrentWeather({
    required this.condition,
    required this.description,
    required this.tempC,
    required this.humidityPct,
    required this.windKmh,
    required this.riskLevel,
  });

  final String condition;
  final String description;
  final double tempC;
  final int humidityPct;
  final double windKmh;
  final String riskLevel;

  factory CurrentWeather.fromJson(Map<String, dynamic> json) {
    return CurrentWeather(
      condition: json['condition'] as String? ?? '',
      description: json['description'] as String? ?? '',
      tempC: asDouble(json['temp_c']) ?? 0,
      humidityPct: asInt(json['humidity_pct']) ?? 0,
      windKmh: asDouble(json['wind_kmh']) ?? 0,
      riskLevel: json['risk_level'] as String? ?? 'low',
    );
  }
}

class AgentAccount {
  const AgentAccount({
    required this.id,
    required this.username,
    required this.name,
    required this.area,
    required this.phone,
    required this.isActive,
  });

  final int id;
  final String username;
  final String name;
  final String? area;
  final String? phone;
  final bool isActive;

  factory AgentAccount.fromJson(Map<String, dynamic> json) {
    return AgentAccount(
      id: asInt(json['id']) ?? 0,
      username: json['username'] as String? ?? '',
      name: json['name'] as String? ?? '',
      area: json['area'] as String?,
      phone: json['phone'] as String?,
      isActive: json['is_active'] as bool? ?? true,
    );
  }
}
