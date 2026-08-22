import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/api_error.dart';
import '../../models/order.dart';
import '../../state/orders_controller.dart';
import '../../state/tracking_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/delivery_outcome.dart';
import '../../utils/helpers.dart';
import '../../widgets/complete_delivery_sheet.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/order_card.dart';
import '../../widgets/risk_card.dart';

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final int orderId;

  static Future<void> open(BuildContext context, int orderId) {
    return Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: orderId)),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(orderDetailProvider(orderId));
    final eta = ref.watch(orderEtaProvider(orderId)).valueOrNull;

    return Scaffold(
      appBar: AppBar(title: const Text('Order')),
      body: async.when(
        loading: () => const LoadingWidget(),
        error: (e, _) => AppErrorWidget(
          message: e is ApiError ? e.userMessage : 'Unable to load this order.',
          onRetry: () {
            ref.invalidate(orderDetailProvider(orderId));
            ref.invalidate(orderEtaProvider(orderId));
          },
        ),
        data: (order) => Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                color: AppColors.amber,
                onRefresh: () async {
                  await Future.wait([
                    ref.refresh(orderDetailProvider(orderId).future),
                    ref.refresh(orderEtaProvider(orderId).future),
                  ]);
                },
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                  children: [
                    Row(
                      children: [
                        Text(
                          order.orderNumber,
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(width: 10),
                        StatusBadge(status: order.status),
                      ],
                    ),
                    if (order.isUrgent)
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          'URGENT — deadline is today',
                          style: TextStyle(color: AppColors.urgent, fontWeight: FontWeight.w700),
                        ),
                      ),
                    const SizedBox(height: 16),
                    RiskCard(order: order),
                    const SizedBox(height: 16),
                    _section('Customer', [
                      _kv('Name', order.customerName),
                      _kv('Phone', order.customerPhone ?? '—'),
                      _kv('Address', order.customerAddress),
                      _kv('Area', order.area),
                    ]),
                    const SizedBox(height: 16),
                    _section('Delivery', [
                      _kv('Package', order.packageSize),
                      _kv('Window', order.timeWindow),
                      _kv('Deadline', order.deadline.isEmpty ? '—' : formatTime(order.deadline)),
                      _kv('Amount', formatInr(order.paymentAmount)),
                      _kv('Residence', order.residenceType ?? '—'),
                      if (eta?.distanceKm != null) _kv('Distance', '${eta!.distanceKm!.toStringAsFixed(1)} km'),
                      if (eta != null) _kv('ETA', '${eta.predictedMin} min${eta.etaTime != null ? '  (${eta.etaTime})' : ''}'),
                      if (order.failureReason != null && order.failureReason!.isNotEmpty)
                        _kv('Reason', order.failureReason!),
                    ]),
                  ],
                ),
              ),
            ),
            _DeliveryActions(order: order),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(color: AppColors.inkDim, fontSize: 11, letterSpacing: 1, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 92, child: Text(k, style: const TextStyle(color: AppColors.inkDim))),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _DeliveryActions extends ConsumerWidget {
  const _DeliveryActions({required this.order});

  final Order order;

  void _goToMap(BuildContext context, WidgetRef ref) {
    Navigator.of(context).pop();
    ref.read(shellTabProvider.notifier).state = 2;
  }

  Future<void> _openOutcome(
    BuildContext context,
    Order order, {
    List<String> allowed = DeliveryOutcome.inTransitOptions,
  }) async {
    final ok = await showCompleteDeliverySheet(
      context: context,
      order: order,
      allowed: allowed,
    );
    if (!ok || !context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${order.orderNumber} updated.')),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tracking = ref.watch(trackingControllerProvider);
    if (order.status == 'pending') {
      return _bar(
        error: tracking.error,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FilledButton(
              onPressed: tracking.busy
                  ? null
                  : () async {
                      final ok = await ref
                          .read(trackingControllerProvider.notifier)
                          .startDelivery(order.id);
                      if (!ok || !context.mounted) return;
                      _goToMap(context, ref);
                    },
              child: tracking.busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ground),
                    )
                  : const Text('START DELIVERY'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: tracking.busy
                  ? null
                  : () => _openOutcome(
                        context,
                        order,
                        allowed: DeliveryOutcome.pendingOptions,
                      ),
              child: const Text('Postpone'),
            ),
          ],
        ),
      );
    }

    if (order.status == 'in_transit') {
      final trackingThis = tracking.activeOrderId == order.id;
      return _bar(
        error: tracking.error,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              trackingThis ? 'DELIVERY IN PROGRESS' : 'OUT FOR DELIVERY',
              style: const TextStyle(
                color: AppColors.amber,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 10),
            FilledButton(
              onPressed: tracking.busy ? null : () => _openOutcome(context, order),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.go,
                foregroundColor: AppColors.ground,
              ),
              child: const Text('COMPLETE DELIVERY'),
            ),
            const SizedBox(height: 8),
            if (!trackingThis)
              FilledButton(
                onPressed: tracking.busy
                    ? null
                    : () async {
                        final ok = await ref
                            .read(trackingControllerProvider.notifier)
                            .resumeGps(order.id);
                        if (!ok || !context.mounted) return;
                        _goToMap(context, ref);
                      },
                child: tracking.busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ground),
                      )
                    : const Text('RESUME GPS'),
              ),
            if (!trackingThis) const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => _goToMap(context, ref),
              child: const Text('VIEW MAP'),
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }

  Widget _bar({required Widget child, String? error}) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (error != null) ...[
              Text(error, style: const TextStyle(color: AppColors.nogo)),
              const SizedBox(height: 8),
            ],
            SizedBox(width: double.infinity, child: child),
          ],
        ),
      ),
    );
  }
}
