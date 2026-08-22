import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/analytics.dart';
import '../models/order.dart';
import '../services/agents_service.dart';
import '../services/analytics_service.dart';
import '../services/chat_service.dart';
import 'auth_controller.dart';
import 'orders_controller.dart';

final analyticsServiceProvider = Provider<AnalyticsService>((ref) {
  return AnalyticsService(api: ref.watch(apiServiceProvider));
});

final chatServiceProvider = Provider<ChatService>((ref) {
  return ChatService(api: ref.watch(apiServiceProvider));
});

final agentsServiceProvider = Provider<AgentsService>((ref) {
  return AgentsService(api: ref.watch(apiServiceProvider));
});

final costSavingsProvider = FutureProvider.family<CostSavings, String>((ref, period) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).costSavings(period: period);
});

final earningsOrdersProvider = FutureProvider.family<OrderListResponse, String>((ref, period) {
  ref.watch(authControllerProvider);
  String? dateFrom;
  if (period != 'all') {
    final days = period == 'month' ? 30 : 7;
    final d = DateTime.now().subtract(Duration(days: days));
    dateFrom =
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }
  return ref.watch(orderServiceProvider).list(
        dateFrom: dateFrom,
        perPage: 100,
        sortBy: 'created_at',
        sortDir: 'desc',
      );
});

final managerDashboardProvider = FutureProvider<DashboardAnalytics>((ref) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).dashboard();
});

final dailySummaryProvider = FutureProvider<DailySummary>((ref) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).dailySummary();
});

final currentWeatherProvider = FutureProvider<CurrentWeather?>((ref) async {
  ref.watch(authControllerProvider);
  try {
    return await ref.watch(analyticsServiceProvider).currentWeather();
  } catch (_) {
    return null;
  }
});

final kpiProvider = FutureProvider.family<KpiReport, String>((ref, period) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).kpi(period: period);
});

final weatherImpactProvider = FutureProvider.family<WeatherImpact, String>((ref, period) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).weatherImpact(period: period);
});

final heatmapProvider = FutureProvider<List<HeatmapZone>>((ref) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).heatmap();
});

final leaderboardProvider = FutureProvider.family<List<LeaderboardAgent>, String>((ref, period) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).leaderboard(period: period);
});

final areaIntelligenceProvider = FutureProvider.family<AreaIntelligence, String>((ref, area) {
  ref.watch(authControllerProvider);
  return ref.watch(analyticsServiceProvider).areaIntelligence(area);
});

final agentAccountsProvider = FutureProvider<List<AgentAccount>>((ref) {
  ref.watch(authControllerProvider);
  return ref.watch(agentsServiceProvider).list();
});
