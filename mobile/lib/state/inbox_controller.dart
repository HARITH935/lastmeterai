import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/notification.dart';
import '../services/notification_service.dart';
import 'auth_controller.dart';
import 'orders_controller.dart';
import 'tracking_controller.dart';

final notificationServiceProvider = Provider<NotificationService>((ref) {
  return NotificationService(api: ref.watch(apiServiceProvider));
});

class InboxToast {
  const InboxToast({required this.id, required this.title, this.message});

  final int id;
  final String title;
  final String? message;
}

class InboxState {
  const InboxState({this.unread = 0, this.toast});

  final int unread;
  final InboxToast? toast;

  InboxState copyWith({int? unread, InboxToast? toast, bool clearToast = false}) {
    return InboxState(
      unread: unread ?? this.unread,
      toast: clearToast ? null : (toast ?? this.toast),
    );
  }
}

class InboxController extends Notifier<InboxState> {
  var _toastSeq = 0;
  late final void Function(dynamic) _onNotification = _handleNotification;
  late final void Function(dynamic) _onAssigned = _handleAssigned;

  @override
  InboxState build() {
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated &&
          prev?.status != AuthStatus.authenticated) {
        unawaited(_start());
      } else if (prev?.status == AuthStatus.authenticated &&
          next.status != AuthStatus.authenticated) {
        unawaited(_stop());
      }
    }, fireImmediately: true);

    ref.onDispose(() {
      unawaited(_stop());
    });
    return const InboxState();
  }

  Future<void> refreshUnread() async {
    try {
      final res = await ref.read(notificationServiceProvider).list(perPage: 1);
      state = state.copyWith(unread: res.unread.total);
    } catch (_) {}
  }

  Future<void> _start() async {
    try {
      await ref.read(socketServiceProvider).connect();
    } catch (_) {}
    final socket = ref.read(socketServiceProvider);
    socket.off('new_notification', _onNotification);
    socket.off('new_order_assigned', _onAssigned);
    socket.on('new_notification', _onNotification);
    socket.on('new_order_assigned', _onAssigned);
    await refreshUnread();
  }

  Future<void> _stop() async {
    await ref.read(trackingControllerProvider.notifier).stop();
    final socket = ref.read(socketServiceProvider);
    socket.off('new_notification', _onNotification);
    socket.off('new_order_assigned', _onAssigned);
    socket.disconnect();
    state = const InboxState();
  }

  void _handleNotification(dynamic data) {
    final map = _asMap(data);
    _toastSeq += 1;
    state = state.copyWith(
      unread: state.unread + 1,
      toast: InboxToast(
        id: _toastSeq,
        title: map?['title'] as String? ?? 'New notification',
        message: map?['message'] as String?,
      ),
    );
    ref.invalidate(notificationsListProvider);
  }

  void _handleAssigned(dynamic data) {
    final map = _asMap(data);
    final number = map?['order_number'] as String?;
    _toastSeq += 1;
    state = state.copyWith(
      toast: InboxToast(
        id: _toastSeq,
        title: 'New order assigned',
        message: number == null ? null : 'Order $number added to your route',
      ),
    );
    ref.invalidate(todayOrdersProvider);
    ref.invalidate(ordersListProvider);
    ref.invalidate(optimizedRouteProvider);
  }
}

Map<String, dynamic>? _asMap(dynamic data) {
  if (data is Map<String, dynamic>) return data;
  if (data is Map) return Map<String, dynamic>.from(data);
  return null;
}

class NotificationQuery {
  const NotificationQuery({this.category, this.isRead});

  final String? category;
  final bool? isRead;

  @override
  bool operator ==(Object other) =>
      other is NotificationQuery && other.category == category && other.isRead == isRead;

  @override
  int get hashCode => Object.hash(category, isRead);
}

final inboxControllerProvider =
    NotifierProvider<InboxController, InboxState>(InboxController.new);

final notificationsListProvider =
    FutureProvider.family<NotificationListResponse, NotificationQuery>((ref, query) {
  ref.watch(authControllerProvider);
  return ref.watch(notificationServiceProvider).list(
        category: query.category,
        isRead: query.isRead,
        perPage: 50,
      );
});
