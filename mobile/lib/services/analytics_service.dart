import '../models/analytics.dart';
import '../models/api_error.dart';
import 'api_service.dart';

class AnalyticsService {
  // ignore: prefer_initializing_formals
  AnalyticsService({required ApiService api}) : _api = api;

  final ApiService _api;

  Future<CostSavings> costSavings({String period = 'week'}) async {
    return _get('/api/analytics/cost-savings', {'period': period}, CostSavings.fromJson);
  }

  Future<DashboardAnalytics> dashboard() async {
    return _get('/api/analytics/dashboard', const {}, DashboardAnalytics.fromJson);
  }

  Future<KpiReport> kpi({String period = 'week'}) async {
    return _get('/api/analytics/kpi', {'period': period}, KpiReport.fromJson);
  }

  Future<WeatherImpact> weatherImpact({String period = 'week'}) async {
    return _get('/api/analytics/weather-impact', {'period': period}, WeatherImpact.fromJson);
  }

  Future<AreaIntelligence> areaIntelligence(String area) async {
    return _get(
      '/api/analytics/area-intelligence/${Uri.encodeComponent(area)}',
      const {},
      AreaIntelligence.fromJson,
    );
  }

  Future<CustomerInsight> customer(String address) async {
    return _get('/api/analytics/customer', {'address': address}, CustomerInsight.fromJson);
  }

  Future<List<LeaderboardAgent>> leaderboard({String period = 'week'}) async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>(
        '/api/analytics/leaderboard',
        queryParameters: {'period': period},
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return (data['agents'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => LeaderboardAgent.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<HeatmapZone>> heatmap() async {
    try {
      final res = await _api.client.get<dynamic>('/api/analytics/heatmap');
      final data = res.data;
      final list = data is Map ? data['zones'] : data;
      if (list is! List) return const [];
      return list
          .whereType<Map>()
          .map((e) => HeatmapZone.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<DailySummary> dailySummary() async {
    return _get('/api/analytics/daily-summary', const {}, DailySummary.fromJson);
  }

  Future<CurrentWeather> currentWeather() async {
    return _get('/api/weather/current', const {}, CurrentWeather.fromJson);
  }

  Future<T> _get<T>(
    String path,
    Map<String, dynamic> query,
    T Function(Map<String, dynamic>) parse,
  ) async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>(
        path,
        queryParameters: query.isEmpty ? null : query,
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return parse(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
