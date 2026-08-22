import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/api_error.dart';
import '../../models/notification.dart';
import '../../state/inbox_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';
import '../orders/order_detail_screen.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  String? _category;
  bool? _isRead;

  NotificationQuery get _query => NotificationQuery(category: _category, isRead: _isRead);

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(notificationsListProvider(_query));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Alerts'),
        actions: [
          TextButton(
            onPressed: () async {
              try {
                await ref.read(notificationServiceProvider).markAllRead(category: _category);
              } catch (_) {}
              ref.invalidate(notificationsListProvider);
              await ref.read(inboxControllerProvider.notifier).refreshUnread();
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              children: [
                _chip('All', _isRead == null && _category == null, () {
                  setState(() {
                    _isRead = null;
                    _category = null;
                  });
                }),
                _chip('Unread', _isRead == false, () {
                  setState(() => _isRead = false);
                }),
                _chip('AI', _category == 'ai_alert', () {
                  setState(() => _category = 'ai_alert');
                }),
                _chip('Delivery', _category == 'delivery_alert', () {
                  setState(() => _category = 'delivery_alert');
                }),
                _chip('Weather', _category == 'weather_alert', () {
                  setState(() => _category = 'weather_alert');
                }),
                _chip('System', _category == 'system_alert', () {
                  setState(() => _category = 'system_alert');
                }),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const LoadingWidget(label: 'Loading alerts'),
              error: (e, _) => AppErrorWidget(
                message: e is ApiError ? e.userMessage : 'Unable to load alerts.',
                onRetry: () => ref.invalidate(notificationsListProvider(_query)),
              ),
              data: (res) {
                if (res.data.isEmpty) {
                  return const Center(
                    child: Text('No alerts yet.', style: TextStyle(color: AppColors.inkMuted)),
                  );
                }
                return RefreshIndicator(
                  color: AppColors.amber,
                  onRefresh: () => Future.wait([
                    ref.refresh(notificationsListProvider(_query).future),
                    ref.read(inboxControllerProvider.notifier).refreshUnread(),
                  ]),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemCount: res.data.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) => _NotifTile(item: res.data[i], query: _query),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        showCheckmark: false,
        selectedColor: AppColors.amber,
        labelStyle: TextStyle(
          color: selected ? AppColors.ground : AppColors.ink,
          fontWeight: FontWeight.w600,
        ),
        onSelected: (_) => onTap(),
      ),
    );
  }
}

class _NotifTile extends ConsumerWidget {
  const _NotifTile({required this.item, required this.query});

  final AppNotification item;
  final NotificationQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Dismissible(
      key: ValueKey(item.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(color: AppColors.nogo, borderRadius: BorderRadius.circular(14)),
        child: const Icon(Icons.delete_outline, color: AppColors.ink),
      ),
      onDismissed: (_) async {
        try {
          await ref.read(notificationServiceProvider).delete(item.id);
        } catch (_) {}
        ref.invalidate(notificationsListProvider);
        await ref.read(inboxControllerProvider.notifier).refreshUnread();
      },
      child: Material(
        color: item.isRead ? AppColors.surface : AppColors.groundSoft,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () async {
            if (!item.isRead) {
              try {
                await ref.read(notificationServiceProvider).markRead(item.id);
              } catch (_) {}
              ref.invalidate(notificationsListProvider);
              await ref.read(inboxControllerProvider.notifier).refreshUnread();
            }
            if (item.orderId != null && context.mounted) {
              await OrderDetailScreen.open(context, item.orderId!);
            }
          },
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 6, right: 10),
                  child: Icon(
                    Icons.circle,
                    size: 8,
                    color: item.isRead ? Colors.transparent : AppColors.amber,
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _CatPill(category: item.category, label: item.categoryLabel),
                          const Spacer(),
                          Text(
                            formatNotifTime(item.createdAt),
                            style: const TextStyle(color: AppColors.inkDim, fontSize: 12),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(item.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(item.message, style: const TextStyle(color: AppColors.inkMuted, height: 1.35)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CatPill extends StatelessWidget {
  const _CatPill({required this.category, required this.label});

  final String category;
  final String label;

  @override
  Widget build(BuildContext context) {
    final color = switch (category) {
      'ai_alert' => AppColors.amber,
      'delivery_alert' => AppColors.go,
      'weather_alert' => AppColors.urgent,
      _ => AppColors.inkMuted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.6),
      ),
    );
  }
}
