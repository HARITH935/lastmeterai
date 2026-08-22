import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/analytics.dart';
import '../../models/api_error.dart';
import '../../state/ops_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/period_toggle.dart';
import '../../widgets/stat_card.dart';

class AreaIntelligenceScreen extends ConsumerStatefulWidget {
  const AreaIntelligenceScreen({super.key});

  @override
  ConsumerState<AreaIntelligenceScreen> createState() => _AreaIntelligenceScreenState();
}

class _AreaIntelligenceScreenState extends ConsumerState<AreaIntelligenceScreen> {
  String _area = 'Adyar';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(areaIntelligenceProvider(_area));

    return Scaffold(
      appBar: AppBar(title: const Text('Area Intelligence')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          DropdownButtonFormField<String>(
            initialValue: _area,
            items: [for (final a in validAreas) DropdownMenuItem(value: a, child: Text(a))],
            onChanged: (v) {
              if (v != null) setState(() => _area = v);
            },
            decoration: const InputDecoration(labelText: 'Area'),
          ),
          const SizedBox(height: 16),
          async.when(
            loading: () => const LoadingWidget(label: 'Loading area intelligence'),
            error: (e, _) => AppErrorWidget(
              message: e is ApiError ? e.userMessage : 'Unable to load area intelligence.',
              onRetry: () => ref.invalidate(areaIntelligenceProvider(_area)),
            ),
            data: (a) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: StatCard(
                        label: 'Success rate',
                        value: a.successRate == null ? '—' : percent1(a.successRate!),
                        emphasis: AppColors.go,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: StatCard(label: 'Risk', value: a.riskLevel ?? '—')),
                  ],
                ),
                const SizedBox(height: 8),
                StatCard(label: 'Best window', value: a.bestDeliveryTime ?? '—'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: StatCard(label: 'Weather sensitivity', value: a.weatherSensitivity ?? '—')),
                    const SizedBox(width: 8),
                    Expanded(
                      child: StatCard(
                        label: 'Rain impact',
                        value: a.rainImpact == null ? '—' : percent1(a.rainImpact!),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const SectionLabel('Predicted success by window'),
                SurfaceCard(
                  child: Column(
                    children: [
                      _slot('Morning', a.morning),
                      const Divider(color: AppColors.line),
                      _slot('Afternoon', a.afternoon),
                      const Divider(color: AppColors.line),
                      _slot('Evening', a.evening),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _slot(String label, double? value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(value == null ? '—' : percent1(value), style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
