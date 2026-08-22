import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/api_error.dart';
import '../../state/auth_controller.dart';
import '../../state/orders_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/order_card.dart';
import 'order_detail_screen.dart';

class _Filter {
  const _Filter(this.label, this.status);
  final String label;
  final String? status;
}

const _filters = [
  _Filter('All', null),
  _Filter('Pending', 'pending'),
  _Filter('In transit', 'in_transit'),
  _Filter('Completed', 'delivered'),
  _Filter('Failed', 'failed'),
  _Filter('Postponed', 'postponed'),
];

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  int _filterIndex = 0;
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  OrderListQuery get _query => OrderListQuery(
        status: _filters[_filterIndex].status,
        search: _search.text.trim().isEmpty ? null : _search.text.trim(),
      );

  @override
  Widget build(BuildContext context) {
    final manager = ref.watch(authControllerProvider).user?.isManager == true;
    final async = ref.watch(ordersListProvider(_query));

    return Scaffold(
      appBar: AppBar(title: Text(manager ? 'All Orders' : 'Order History')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                hintText: 'Search order or customer',
                prefixIcon: Icon(Icons.search),
              ),
              onSubmitted: (_) => setState(() {}),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _filters.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final selected = i == _filterIndex;
                return ChoiceChip(
                  label: Text(_filters[i].label),
                  selected: selected,
                  onSelected: (_) => setState(() => _filterIndex = i),
                  selectedColor: AppColors.amber.withValues(alpha: 0.25),
                  labelStyle: TextStyle(
                    color: selected ? AppColors.amberSoft : AppColors.inkMuted,
                    fontWeight: FontWeight.w600,
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: async.when(
              loading: () => const LoadingWidget(),
              error: (e, _) => AppErrorWidget(
                message: e is ApiError ? e.userMessage : 'Unable to load orders.',
                onRetry: () => ref.invalidate(ordersListProvider(_query)),
              ),
              data: (res) {
                if (res.data.isEmpty) {
                  return const Center(
                    child: Text('No orders in this filter.', style: TextStyle(color: AppColors.inkMuted)),
                  );
                }
                return RefreshIndicator(
                  color: AppColors.amber,
                  onRefresh: () async => ref.refresh(ordersListProvider(_query).future),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: res.data.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, i) {
                      final order = res.data[i];
                      return OrderCard(
                        order: order,
                        onTap: () => OrderDetailScreen.open(context, order.id),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
