import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/api_error.dart';
import '../models/order.dart';
import '../services/location_service.dart';
import '../services/socket_service.dart';
import '../utils/delivery_outcome.dart';
import 'auth_controller.dart';
import 'orders_controller.dart';

final locationServiceProvider = Provider<LocationService>((ref) => LocationService());

final socketServiceProvider = Provider<SocketService>((ref) {
  return SocketService(storage: ref.watch(storageServiceProvider));
});

class ArrivalNotice {
  const ArrivalNotice({
    required this.orderId,
    required this.orderNumber,
    required this.customerName,
  });

  final int orderId;
  final String orderNumber;
  final String customerName;
}

class TrackingState {
  const TrackingState({
    this.activeOrderId,
    this.fix,
    this.error,
    this.busy = false,
    this.arrival,
  });

  final int? activeOrderId;
  final LocationFix? fix;
  final String? error;
  final bool busy;
  final ArrivalNotice? arrival;

  bool get isTracking => activeOrderId != null;

  TrackingState copyWith({
    int? activeOrderId,
    LocationFix? fix,
    String? error,
    bool? busy,
    ArrivalNotice? arrival,
    bool clearOrder = false,
    bool clearError = false,
    bool clearArrival = false,
  }) {
    return TrackingState(
      activeOrderId: clearOrder ? null : (activeOrderId ?? this.activeOrderId),
      fix: fix ?? this.fix,
      error: clearError ? null : (error ?? this.error),
      busy: busy ?? this.busy,
      arrival: clearArrival ? null : (arrival ?? this.arrival),
    );
  }
}

class TrackingController extends Notifier<TrackingState> {
  StreamSubscription<LocationFix>? _sub;
  late final void Function(dynamic) _onArrival = _handleArrival;
  late final void Function(dynamic) _onUpdated = _handleUpdated;

  @override
  TrackingState build() {
    ref.onDispose(() {
      _sub?.cancel();
      final socket = ref.read(socketServiceProvider);
      socket.off('order_arrival', _onArrival);
      socket.off('order_updated', _onUpdated);
    });
    return const TrackingState();
  }

  /// One GPS read for the map, without starting a delivery.
  Future<void> peekLocation() async {
    if (state.isTracking) return;
    final locError = await ref.read(locationServiceProvider).ensurePermission();
    if (locError != null) {
      state = state.copyWith(error: locError);
      return;
    }
    try {
      final fix = await ref.read(locationServiceProvider).current();
      state = state.copyWith(fix: fix, clearError: true);
    } catch (_) {
      state = state.copyWith(error: 'Could not read GPS. Check that location is on.');
    }
  }

  Future<bool> startDelivery(int orderId) async {
    state = state.copyWith(busy: true, clearError: true);
    final locError = await ref.read(locationServiceProvider).ensurePermission();
    if (locError != null) {
      state = state.copyWith(busy: false, error: locError);
      return false;
    }

    try {
      final fix = await ref.read(locationServiceProvider).current();
      await ref.read(orderServiceProvider).updateStatus(
            id: orderId,
            status: 'in_transit',
          );
      await _beginTracking(orderId, fix);
      _invalidateOrders(orderId);
      return true;
    } on ApiError catch (e) {
      state = state.copyWith(busy: false, error: e.userMessage);
      return false;
    } catch (_) {
      state = state.copyWith(
        busy: false,
        error: 'Could not start delivery. Try again.',
      );
      return false;
    }
  }

  /// Already in_transit (app restart). Does not PATCH status again.
  Future<bool> resumeGps(int orderId) async {
    state = state.copyWith(busy: true, clearError: true);
    final locError = await ref.read(locationServiceProvider).ensurePermission();
    if (locError != null) {
      state = state.copyWith(busy: false, error: locError);
      return false;
    }
    try {
      final fix = await ref.read(locationServiceProvider).current();
      await _beginTracking(orderId, fix);
      return true;
    } catch (_) {
      state = state.copyWith(busy: false, error: 'Could not start GPS. Try again.');
      return false;
    }
  }

  Future<bool> updateOutcome({
    required int orderId,
    required String status,
    String? failureReason,
  }) async {
    final invalid = DeliveryOutcome.validate(status: status, reason: failureReason);
    if (invalid != null) {
      state = state.copyWith(error: invalid);
      return false;
    }

    state = state.copyWith(busy: true, clearError: true);
    try {
      await ref.read(orderServiceProvider).updateStatus(
            id: orderId,
            status: status,
            failureReason: DeliveryOutcome.needsReason(status) ? failureReason!.trim() : null,
          );
      if (state.activeOrderId == orderId) {
        await stop();
      } else {
        state = state.copyWith(busy: false);
      }
      _invalidateOrders(orderId);
      return true;
    } on ApiError catch (e) {
      state = state.copyWith(busy: false, error: e.userMessage);
      return false;
    } catch (_) {
      state = state.copyWith(
        busy: false,
        error: 'Could not update this order. Try again.',
      );
      return false;
    }
  }

  void dismissArrival() {
    state = state.copyWith(clearArrival: true);
  }

  Future<void> _beginTracking(int orderId, LocationFix fix) async {
    try {
      await ref.read(socketServiceProvider).connect();
      _bindSocket();
      ref.read(socketServiceProvider).emitLocation(fix);
    } catch (_) {
      // REST start already succeeded; local GPS still shows on the map.
    }
    await _sub?.cancel();
    _sub = ref.read(locationServiceProvider).watch().listen((next) {
      state = state.copyWith(fix: next);
      ref.read(socketServiceProvider).emitLocation(next);
    });
    state = TrackingState(activeOrderId: orderId, fix: fix, busy: false);
  }

  void _bindSocket() {
    final socket = ref.read(socketServiceProvider);
    socket.off('order_arrival', _onArrival);
    socket.off('order_updated', _onUpdated);
    socket.on('order_arrival', _onArrival);
    socket.on('order_updated', _onUpdated);
  }

  void _handleArrival(dynamic data) {
    final map = _asMap(data);
    if (map == null) return;
    final id = (map['order_id'] as num?)?.toInt();
    if (id == null) return;
    state = state.copyWith(
      arrival: ArrivalNotice(
        orderId: id,
        orderNumber: map['order_number'] as String? ?? '',
        customerName: map['customer_name'] as String? ?? '',
      ),
    );
    _invalidateOrders(id);
  }

  void _handleUpdated(dynamic data) {
    final map = _asMap(data);
    if (map == null) return;
    final id = (map['order_id'] as num?)?.toInt();
    final status = map['status'] as String?;
    if (id == null) return;
    _invalidateOrders(id);
    if (state.activeOrderId == id &&
        status != null &&
        status != 'pending' &&
        status != 'in_transit') {
      unawaited(stop());
    }
  }

  void _invalidateOrders(int orderId) {
    ref.invalidate(orderDetailProvider(orderId));
    ref.invalidate(todayOrdersProvider);
    ref.invalidate(ordersListProvider);
    ref.invalidate(optimizedRouteProvider);
    ref.invalidate(orderEtaProvider(orderId));
    ref.invalidate(deliveredEarningsProvider);
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    final socket = ref.read(socketServiceProvider);
    socket.off('order_arrival', _onArrival);
    socket.off('order_updated', _onUpdated);
    state = const TrackingState();
  }
}

Map<String, dynamic>? _asMap(dynamic data) {
  if (data is Map<String, dynamic>) return data;
  if (data is Map) return Map<String, dynamic>.from(data);
  return null;
}

final trackingControllerProvider =
    NotifierProvider<TrackingController, TrackingState>(TrackingController.new);

final optimizedRouteProvider = FutureProvider<OptimizedRoute?>((ref) async {
  ref.watch(authControllerProvider);
  try {
    return await ref.watch(orderServiceProvider).optimizedRoute();
  } catch (_) {
    return null;
  }
});
