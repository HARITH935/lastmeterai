import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/analytics.dart';
import '../../models/api_error.dart';
import '../../state/ops_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/period_toggle.dart';
import '../../widgets/stat_card.dart';

class CustomerInsightsScreen extends ConsumerStatefulWidget {
  const CustomerInsightsScreen({super.key});

  @override
  ConsumerState<CustomerInsightsScreen> createState() => _CustomerInsightsScreenState();
}

class _CustomerInsightsScreenState extends ConsumerState<CustomerInsightsScreen> {
  final _address = TextEditingController();
  CustomerInsight? _data;
  String? _error;
  var _loading = false;

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final q = _address.text.trim();
    if (q.isEmpty) {
      setState(() => _error = 'Enter a customer address.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _data = null;
    });
    try {
      final data = await ref.read(analyticsServiceProvider).customer(q);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e is ApiError ? e.userMessage : 'Unable to load customer history.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Customer Insights')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          const Text(
            'Look up repeat-delivery history for an address.',
            style: TextStyle(color: AppColors.inkMuted, height: 1.4),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _address,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _search(),
            decoration: const InputDecoration(
              labelText: 'Address',
              hintText: '7 Main Road, Adyar, Chennai',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _loading ? null : _search, child: Text(_loading ? 'Searching…' : 'Look up')),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(color: AppColors.nogo, height: 1.35)),
          ],
          if (_data != null) ...[
            const SizedBox(height: 20),
            Text(_data!.address, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: StatCard(label: 'Orders', value: '${_data!.totalOrders}')),
                const SizedBox(width: 8),
                Expanded(child: StatCard(label: 'Success', value: percent1(_data!.successRate), emphasis: AppColors.go)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: StatCard(label: 'Failed', value: '${_data!.failed}', emphasis: AppColors.nogo)),
                const SizedBox(width: 8),
                Expanded(child: StatCard(label: 'Risk', value: _data!.riskLevel)),
              ],
            ),
            const SizedBox(height: 8),
            StatCard(label: 'Preferred window', value: _data!.preferredDeliveryTime),
            const SizedBox(height: 16),
            const SectionLabel('Recent orders'),
            ..._data!.recentOrders.map(
              (o) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SurfaceCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(o.orderNumber, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text('${o.date} · ${o.timeWindow}', style: const TextStyle(color: AppColors.inkMuted, fontSize: 13)),
                          ],
                        ),
                      ),
                      Text(statusLabel(o.status)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
