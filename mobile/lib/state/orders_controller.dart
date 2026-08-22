import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../services/order_service.dart';
import 'auth_controller.dart';

final orderServiceProvider = Provider<OrderService>((ref) {
  return OrderService(api: ref.watch(apiServiceProvider));
});

String todayLocalMidnightIso() {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day).toUtc().toIso8601String();
}

/// Today's area orders (same query the web agent dashboard uses).
final todayOrdersProvider = FutureProvider<OrderListResponse>((ref) {
  ref.watch(authControllerProvider);
  return ref.watch(orderServiceProvider).list(
        dateFrom: todayLocalMidnightIso(),
        perPage: 100,
        sortBy: 'deadline',
        sortDir: 'asc',
      );
});

class OrderListQuery {
  const OrderListQuery({this.status, this.search});

  final String? status;
  final String? search;

  @override
  bool operator ==(Object other) =>
      other is OrderListQuery && other.status == status && other.search == search;

  @override
  int get hashCode => Object.hash(status, search);
}

final ordersListProvider =
    FutureProvider.family<OrderListResponse, OrderListQuery>((ref, query) {
  ref.watch(authControllerProvider);
  return ref.watch(orderServiceProvider).list(
        status: query.status,
        search: query.search,
        perPage: 100,
        sortBy: 'created_at',
        sortDir: 'desc',
      );
});

final orderDetailProvider = FutureProvider.family<Order, int>((ref, id) {
  ref.watch(authControllerProvider);
  return ref.watch(orderServiceProvider).getById(id);
});

final orderEtaProvider = FutureProvider.family<OrderEta?, int>((ref, id) async {
  ref.watch(authControllerProvider);
  try {
    return await ref.watch(orderServiceProvider).eta(id);
  } catch (_) {
    return null;
  }
});

/// Bottom-nav index for [AgentShell].
final shellTabProvider = StateProvider<int>((ref) => 0);

/// Sum of payment_amount on delivered area orders — same client-side total as web.
final deliveredEarningsProvider = FutureProvider<({double total, int count})>((ref) async {
  ref.watch(authControllerProvider);
  final api = ref.watch(orderServiceProvider);
  var page = 1;
  var total = 0.0;
  var count = 0;
  var pages = 1;
  do {
    final res = await api.list(
      status: 'delivered',
      page: page,
      perPage: 100,
      sortBy: 'created_at',
      sortDir: 'desc',
    );
    pages = res.pagination.pages == 0 ? 1 : res.pagination.pages;
    count += res.data.length;
    total += res.data.fold<double>(0, (sum, o) => sum + o.paymentAmount);
    page++;
  } while (page <= pages && page <= 20);
  return (total: total, count: count);
});
