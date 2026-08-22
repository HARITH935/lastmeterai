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

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  String _period = 'week';

  @override
  Widget build(BuildContext context) {
    final kpi = ref.watch(kpiProvider(_period));
    final weather = ref.watch(weatherImpactProvider(_period));
    final savings = ref.watch(costSavingsProvider('all'));

    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          PeriodToggle(
            value: _period,
            options: const [('week', 'Last 7 days'), ('month', 'Last 30 days')],
            onChanged: (v) => setState(() => _period = v),
          ),
          const SizedBox(height: 16),
          kpi.when(
            loading: () => const LoadingWidget(label: 'Loading report'),
            error: (e, _) => AppErrorWidget(
              message: e is ApiError ? e.userMessage : 'Unable to load report.',
              onRetry: () => ref.invalidate(kpiProvider(_period)),
            ),
            data: (k) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Summary'),
                Row(
                  children: [
                    Expanded(child: StatCard(label: 'Orders', value: '${k.totalOrders}')),
                    const SizedBox(width: 8),
                    Expanded(child: StatCard(label: 'Delivered', value: '${k.totalDelivered}')),
                  ],
                ),
                const SizedBox(height: 8),
                StatCard(label: 'Failed delivery', value: percent1(k.failedDeliveryPct), emphasis: AppColors.nogo),
                const SizedBox(height: 16),
                const SectionLabel('Agent performance'),
                ...k.agentPerformance.take(20).map(
                      (a) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: SurfaceCard(
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(a.agentName, style: const TextStyle(fontWeight: FontWeight.w700)),
                                    Text(a.area, style: const TextStyle(color: AppColors.inkMuted, fontSize: 13)),
                                  ],
                                ),
                              ),
                              Text(percent1(a.successRate), style: const TextStyle(fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                      ),
                    ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          weather.when(
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
            data: (w) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Weather impact'),
                Row(
                  children: [
                    Expanded(child: StatCard(label: 'Clear', value: percent1(w.clearAvg), emphasis: AppColors.go)),
                    const SizedBox(width: 8),
                    Expanded(child: StatCard(label: 'Heavy rain', value: percent1(w.heavyRainAvg), emphasis: AppColors.nogo)),
                  ],
                ),
                const SizedBox(height: 8),
                StatCard(label: 'Revenue lost to weather', value: formatInr(w.revenueLostInr)),
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
                const SectionLabel('Cost savings (all time)'),
                StatCard(label: 'Total savings', value: formatInr(s.metrics.totalSavingsInr), emphasis: AppColors.go),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
