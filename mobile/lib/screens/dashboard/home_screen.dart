import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/api_error.dart';
import '../../models/order.dart';
import '../../state/auth_controller.dart';
import '../../state/orders_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/order_card.dart';
import '../../widgets/stat_card.dart';
import '../orders/order_detail_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final async = ref.watch(todayOrdersProvider);

    return Scaffold(
      body: SafeArea(
        child: async.when(
          loading: () => const LoadingWidget(label: 'Loading today\'s deliveries'),
          error: (e, _) => AppErrorWidget(
            message: e is ApiError ? e.userMessage : 'Unable to load dashboard.',
            onRetry: () => ref.invalidate(todayOrdersProvider),
          ),
          data: (res) => RefreshIndicator(
            color: AppColors.amber,
            onRefresh: () async => ref.refresh(todayOrdersProvider.future),
            child: _DashboardBody(userName: user?.name, area: user?.area, response: res),
          ),
        ),
      ),
    );
  }
}

class _DashboardBody extends ConsumerWidget {
  const _DashboardBody({
    required this.userName,
    required this.area,
    required this.response,
  });

  final String? userName;
  final String? area;
  final OrderListResponse response;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = response.data;
    int count(String s) => orders.where((o) => o.status == s).length;
    final delivered = count('delivered');
    final pending = count('pending');
    final inTransit = count('in_transit');
    final failed = count('failed');
    final highRisk = orders.where((o) => o.effectiveRiskLevel == 'high').toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Text(
          '${greetingForNow(DateTime.now())},',
          style: const TextStyle(color: AppColors.inkMuted, fontSize: 15),
        ),
        const SizedBox(height: 4),
        Text(
          userName ?? 'Agent',
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        Text(
          '${area?.toUpperCase() ?? '—'}  ·  ${formatDay(DateTime.now()).toUpperCase()}',
          style: const TextStyle(color: AppColors.amberSoft, fontSize: 12, letterSpacing: 0.7),
        ),
        const SizedBox(height: 20),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.35,
          children: [
            StatCard(label: "Today's deliveries", value: '${response.pagination.total}', sub: 'in your area'),
            StatCard(
              label: 'Pending',
              value: '$pending',
              sub: inTransit > 0 ? '$inTransit in transit' : 'awaiting start',
              emphasis: pending > 0 ? AppColors.urgent : null,
            ),
            StatCard(
              label: 'Completed',
              value: '$delivered',
              sub: failed > 0 ? '$failed failed' : 'delivered today',
              emphasis: delivered > 0 ? AppColors.go : null,
            ),
            StatCard(
              label: 'High risk',
              value: '${highRisk.length}',
              sub: 'need attention',
              emphasis: highRisk.isEmpty ? AppColors.ink : AppColors.nogo,
            ),
          ],
        ),
        const SizedBox(height: 28),
        const Text('High-risk deliveries', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 10),
        if (highRisk.isEmpty)
          const Text('No high-risk orders today.', style: TextStyle(color: AppColors.inkMuted))
        else
          ...highRisk.take(5).map(
                (o) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: OrderCard(
                    order: o,
                    onTap: () => OrderDetailScreen.open(context, o.id),
                  ),
                ),
              ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => ref.read(shellTabProvider.notifier).state = 1,
          child: const Text('View all orders'),
        ),
      ],
    );
  }
}
