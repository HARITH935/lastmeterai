import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/api_error.dart';
import '../../state/ops_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/period_toggle.dart';
import '../../widgets/stat_card.dart';

class ManagerHomeScreen extends ConsumerWidget {
  const ManagerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(managerDashboardProvider);
    final summary = ref.watch(dailySummaryProvider);
    final weather = ref.watch(currentWeatherProvider);

    return Scaffold(
      body: SafeArea(
        child: dash.when(
          loading: () => const LoadingWidget(label: 'Loading dashboard'),
          error: (e, _) => AppErrorWidget(
            message: e is ApiError ? e.userMessage : 'Unable to load dashboard.',
            onRetry: () => ref.invalidate(managerDashboardProvider),
          ),
          data: (data) {
            final c = data.cards;
            return RefreshIndicator(
              color: AppColors.amber,
              onRefresh: () async {
                ref.invalidate(managerDashboardProvider);
                ref.invalidate(dailySummaryProvider);
                ref.invalidate(currentWeatherProvider);
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  Text(greetingForNow(DateTime.now()), style: const TextStyle(color: AppColors.inkMuted)),
                  const SizedBox(height: 4),
                  const Text('Operations', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 16),
                  weather.when(
                    data: (w) => w == null
                        ? const SizedBox.shrink()
                        : Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: SurfaceCard(
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(w.description, style: const TextStyle(fontWeight: FontWeight.w600)),
                                        Text(
                                          '${w.tempC.round()}°C · Wind ${w.windKmh.round()} km/h · Humidity ${w.humidityPct}%',
                                          style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    '${w.riskLevel} risk',
                                    style: TextStyle(
                                      color: w.riskLevel == 'high'
                                          ? AppColors.nogo
                                          : w.riskLevel == 'medium'
                                              ? AppColors.urgent
                                              : AppColors.go,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                  summary.when(
                    data: (s) => Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: SurfaceCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SectionLabel('AI daily summary'),
                            Text(s.summary, style: const TextStyle(height: 1.45)),
                          ],
                        ),
                      ),
                    ),
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                  Row(
                    children: [
                      Expanded(child: StatCard(label: 'Orders today', value: '${c.totalOrdersToday}')),
                      const SizedBox(width: 8),
                      Expanded(child: StatCard(label: 'Delivered', value: '${c.deliveriesCompleted}', emphasis: AppColors.go)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: StatCard(label: 'High risk', value: '${c.highRiskOrders}', emphasis: AppColors.nogo)),
                      const SizedBox(width: 8),
                      Expanded(child: StatCard(label: 'Active agents', value: '${c.activeAgents}')),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: StatCard(label: 'Revenue today', value: formatInr(c.revenueToday))),
                      const SizedBox(width: 8),
                      Expanded(child: StatCard(label: 'Est. savings', value: formatInr(c.estimatedSavings), emphasis: AppColors.go)),
                    ],
                  ),
                  if (data.failureByArea.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    const SectionLabel('Failure rate by area'),
                    ...data.failureByArea.take(8).map(
                          (r) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: SurfaceCard(
                              child: Row(
                                children: [
                                  Expanded(child: Text(r.label)),
                                  Text(percent1(r.value), style: const TextStyle(fontWeight: FontWeight.w700)),
                                ],
                              ),
                            ),
                          ),
                        ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
