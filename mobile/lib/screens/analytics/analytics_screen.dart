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

class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen> {
  String _period = 'week';

  @override
  Widget build(BuildContext context) {
    final kpi = ref.watch(kpiProvider(_period));
    final savings = ref.watch(costSavingsProvider(_period));
    final heatmap = ref.watch(heatmapProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Analytics')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          PeriodToggle(
            value: _period,
            options: const [('week', 'This Week'), ('month', 'This Month')],
            onChanged: (v) => setState(() => _period = v),
          ),
          const SizedBox(height: 16),
          kpi.when(
            loading: () => const LoadingWidget(label: 'Loading analytics'),
            error: (e, _) => AppErrorWidget(
              message: e is ApiError ? e.userMessage : 'Unable to load analytics.',
              onRetry: () => ref.invalidate(kpiProvider(_period)),
            ),
            data: (k) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: StatCard(label: 'Total orders', value: '${k.totalOrders}')),
                    const SizedBox(width: 8),
                    Expanded(child: StatCard(label: 'Delivered', value: '${k.totalDelivered}', emphasis: AppColors.go)),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: StatCard(label: 'Failed %', value: percent1(k.failedDeliveryPct), emphasis: AppColors.nogo)),
                    const SizedBox(width: 8),
                    Expanded(child: StatCard(label: 'Avg time', value: '${k.avgDeliveryTimeMinutes.round()} min')),
                  ],
                ),
                const SizedBox(height: 16),
                const SectionLabel('Area performance'),
                ...k.areaPerformance.map(
                  (a) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: SurfaceCard(
                      child: Row(
                        children: [
                          Expanded(child: Text(a.area, style: const TextStyle(fontWeight: FontWeight.w600))),
                          Text('${a.successCount}/${a.totalOrders} · risk ${a.avgRiskScore.toStringAsFixed(1)}'),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          savings.when(
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
            data: (s) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('AI cost savings'),
                StatCard(label: 'Total savings', value: formatInr(s.metrics.totalSavingsInr), emphasis: AppColors.go),
              ],
            ),
          ),
          const SizedBox(height: 16),
          heatmap.when(
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
            data: (zones) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Heatmap zones'),
                ...zones.map(
                  (z) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: SurfaceCard(
                      child: Row(
                        children: [
                          Expanded(child: Text(z.area)),
                          Text(
                            '${z.riskBand} · ${percent1(z.failureRate)}',
                            style: TextStyle(
                              color: z.riskBand == 'high' ? AppColors.nogo : z.riskBand == 'medium' ? AppColors.urgent : AppColors.go,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
