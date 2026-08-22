import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../config/api_config.dart';
import '../../models/order.dart';
import '../../services/location_service.dart';
import '../../state/orders_controller.dart';
import '../../state/tracking_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/complete_delivery_sheet.dart';
import '../../widgets/order_card.dart';
import '../orders/order_detail_screen.dart';

class MapScreen extends ConsumerWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(todayOrdersProvider);
    final route = ref.watch(optimizedRouteProvider).valueOrNull;
    final tracking = ref.watch(trackingControllerProvider);
    final stops = today.valueOrNull?.data
            .where((o) => o.status == 'pending' || o.status == 'in_transit')
            .toList() ??
        const <Order>[];
    final active = _activeStop(stops, tracking.activeOrderId);
    final meters = tracking.fix != null && active != null
        ? tracking.fix!.distanceMetersTo(active.latitude, active.longitude)
        : null;
    final nearStop = meters != null && meters <= LocationFix.arrivalRadiusM;

    return Scaffold(
      appBar: AppBar(title: const Text('Map')),
      body: Column(
        children: [
          Expanded(
            child: _MapCanvas(
              stops: stops,
              route: route,
              tracking: tracking,
              active: active,
            ),
          ),
          if (tracking.arrival != null)
            _ArrivalBanner(
              notice: tracking.arrival!,
              onDismiss: () => ref.read(trackingControllerProvider.notifier).dismissArrival(),
              onComplete: active != null && active.id == tracking.arrival!.orderId
                  ? () => _complete(context, active)
                  : () => OrderDetailScreen.open(context, tracking.arrival!.orderId),
            ),
          if (tracking.error != null && tracking.isTracking)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(tracking.error!, style: const TextStyle(color: AppColors.nogo)),
            ),
          if (tracking.isTracking)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
              child: Column(
                children: [
                  Text(
                    nearStop || tracking.arrival?.orderId == tracking.activeOrderId
                        ? 'ARRIVED AT STOP'
                        : 'DELIVERY IN PROGRESS',
                    style: const TextStyle(
                      color: AppColors.amber,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1,
                    ),
                  ),
                  if (active != null && meters != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        nearStop
                            ? 'Within ${LocationFix.arrivalRadiusM.round()} m of ${active.customerName}'
                            : '${meters.round()} m from ${active.customerName}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                      ),
                    ),
                  if (tracking.fix != null && !tracking.fix!.inChennaiBbox)
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text(
                        'You are outside the Chennai service area. The map still shows you; the server will not store this position.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.inkMuted, fontSize: 12, height: 1.35),
                      ),
                    ),
                  if (active != null && active.status == 'in_transit') ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: tracking.busy ? null : () => _complete(context, active),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.go,
                          foregroundColor: AppColors.ground,
                        ),
                        child: const Text('COMPLETE DELIVERY'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          SizedBox(
            height: 156,
            child: stops.isEmpty
                ? const Center(
                    child: Text('No active stops today.', style: TextStyle(color: AppColors.inkMuted)),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: stops.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final o = stops[i];
                      return _StopTile(order: o, highlight: o.id == tracking.activeOrderId);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  static Order? _activeStop(List<Order> stops, int? id) {
    if (id == null) return null;
    for (final o in stops) {
      if (o.id == id) return o;
    }
    return null;
  }

  static Future<void> _complete(BuildContext context, Order order) async {
    final ok = await showCompleteDeliverySheet(context: context, order: order);
    if (!ok || !context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${order.orderNumber} updated.')),
    );
  }
}

class _ArrivalBanner extends StatelessWidget {
  const _ArrivalBanner({
    required this.notice,
    required this.onDismiss,
    required this.onComplete,
  });

  final ArrivalNotice notice;
  final VoidCallback onDismiss;
  final VoidCallback onComplete;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.go.withValues(alpha: 0.16),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
        child: Row(
          children: [
            const Icon(Icons.place, color: AppColors.go),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Arrived at ${notice.customerName} (${notice.orderNumber})',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            TextButton(onPressed: onComplete, child: const Text('Complete')),
            IconButton(onPressed: onDismiss, icon: const Icon(Icons.close, size: 20)),
          ],
        ),
      ),
    );
  }
}

class _StopTile extends StatelessWidget {
  const _StopTile({required this.order, this.highlight = false});

  final Order order;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: highlight ? AppColors.groundSoft : AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => OrderDetailScreen.open(context, order.id),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(
                Icons.location_on,
                color: order.status == 'in_transit' ? AppColors.amber : riskColor(order.effectiveRiskLevel),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(
                      order.customerName,
                      style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                    ),
                  ],
                ),
              ),
              StatusBadge(status: order.status),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapCanvas extends StatefulWidget {
  const _MapCanvas({
    required this.stops,
    required this.route,
    required this.tracking,
    required this.active,
  });

  final List<Order> stops;
  final OptimizedRoute? route;
  final TrackingState tracking;
  final Order? active;

  @override
  State<_MapCanvas> createState() => _MapCanvasState();
}

class _MapCanvasState extends State<_MapCanvas> {
  final _controller = MapController();
  var _ready = false;
  var _follow = true;

  @override
  void didUpdateWidget(covariant _MapCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = widget.tracking.fix;
    final prev = oldWidget.tracking.fix;
    if (_follow &&
        next != null &&
        (prev == null || next.latitude != prev.latitude || next.longitude != prev.longitude)) {
      _moveTo(next, keepZoom: true);
    }
  }

  void _moveTo(LocationFix fix, {required bool keepZoom}) {
    if (!_ready) return;
    final zoom = keepZoom ? _controller.camera.zoom : 15.0;
    _controller.move(LatLng(fix.latitude, fix.longitude), zoom);
  }

  @override
  Widget build(BuildContext context) {
    final agent = widget.tracking.fix;
    final stops = widget.stops;
    final center = agent != null
        ? LatLng(agent.latitude, agent.longitude)
        : stops.isNotEmpty
            ? LatLng(stops.first.latitude, stops.first.longitude)
            : const LatLng(13.06, 80.25);

    final geom = widget.route?.routeGeometry ?? const <List<double>>[];
    final polyline = [
      for (final p in geom)
        if (p.length >= 2) LatLng(p[0], p[1]),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxHeight < 8 || constraints.maxWidth < 8) {
          return const ColoredBox(color: AppColors.ground);
        }
        return Stack(
      children: [
        FlutterMap(
          mapController: _controller,
          options: MapOptions(
            initialCenter: center,
            initialZoom: agent != null ? 15 : 12.4,
            onMapReady: () {
              _ready = true;
              if (agent != null) _moveTo(agent, keepZoom: false);
            },
            onPositionChanged: (camera, hasGesture) {
              if (hasGesture && _follow) {
                setState(() => _follow = false);
              }
            },
          ),
          children: [
            _basemap(),
            if (polyline.length >= 2 && stops.isNotEmpty)
              PolylineLayer(
                polylines: [
                  Polyline(points: polyline, strokeWidth: 4, color: AppColors.amber),
                ],
              ),
            MarkerLayer(
              markers: [
                for (final s in stops)
                  Marker(
                    point: LatLng(s.latitude, s.longitude),
                    width: 36,
                    height: 36,
                    child: Icon(
                      Icons.location_on,
                      color: s.id == widget.active?.id
                          ? AppColors.amber
                          : s.status == 'in_transit'
                              ? AppColors.amberSoft
                              : riskColor(s.effectiveRiskLevel),
                      size: 32,
                    ),
                  ),
                if (agent != null)
                  Marker(
                    point: LatLng(agent.latitude, agent.longitude),
                    width: 28,
                    height: 28,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.go,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.ink, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
        if (widget.tracking.isTracking && !_follow && agent != null)
          Positioned(
            right: 12,
            bottom: 12,
            child: FloatingActionButton.small(
              backgroundColor: AppColors.surface,
              foregroundColor: AppColors.amber,
              onPressed: () {
                setState(() => _follow = true);
                _moveTo(agent, keepZoom: false);
              },
              child: const Icon(Icons.my_location),
            ),
          ),
      ],
        );
      },
    );
  }

  TileLayer _basemap() {
    const ua = 'com.lastmeter.lastmeter_ai';
    if (ApiConfig.hasMapbox) {
      return TileLayer(
        urlTemplate:
            'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}@2x?access_token={access_token}',
        additionalOptions: {'access_token': ApiConfig.mapboxToken},
        tileDimension: 512,
        zoomOffset: -1,
        userAgentPackageName: ua,
        fallbackUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        subdomains: const ['a', 'b', 'c', 'd'],
      );
    }
    // Light street map (same look as before). Voyager first because OSM's
    // public tiles often block phone apps; OSM is the fallback.
    return TileLayer(
      urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      fallbackUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: const ['a', 'b', 'c', 'd'],
      userAgentPackageName: ua,
      maxNativeZoom: 19,
    );
  }
}
