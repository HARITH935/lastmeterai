import 'dart:math' as math;

import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

class LocationFix {
  const LocationFix({
    required this.latitude,
    required this.longitude,
    this.heading,
    this.speedKmh,
  });

  final double latitude;
  final double longitude;
  final double? heading;
  final double? speedKmh;

  /// Mirrors backend AgentLocation CHECK / socket drop box.
  bool get inChennaiBbox =>
      latitude >= 12.80 &&
      latitude <= 13.25 &&
      longitude >= 80.10 &&
      longitude <= 80.35;

  /// Same 130 m radius the server uses for geofence arrival.
  static const arrivalRadiusM = 130.0;

  double distanceMetersTo(double lat, double lon) {
    const r = 6371000.0;
    final dLat = _rad(lat - latitude);
    final dLon = _rad(lon - longitude);
    final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_rad(latitude)) * math.cos(_rad(lat)) * math.sin(dLon / 2) * math.sin(dLon / 2);
    return r * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
  }

  bool arrivedAt(double lat, double lon) => distanceMetersTo(lat, lon) <= arrivalRadiusM;

  static double _rad(double deg) => deg * math.pi / 180;
}

class LocationService {
  Future<String?> ensurePermission() async {
    final service = await Geolocator.isLocationServiceEnabled();
    if (!service) {
      return 'Turn on GPS to start a delivery.';
    }

    var status = await Permission.locationWhenInUse.status;
    if (status.isDenied) {
      status = await Permission.locationWhenInUse.request();
    }
    if (status.isPermanentlyDenied) {
      return 'Location permission is blocked. Enable it in system settings.';
    }
    if (!status.isGranted) {
      return 'Location permission is required to start a delivery.';
    }
    return null;
  }

  Future<LocationFix> current() async {
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
    return _from(pos);
  }

  Stream<LocationFix> watch() {
    return Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25,
      ),
    ).map(_from);
  }

  static LocationFix _from(Position pos) {
    return LocationFix(
      latitude: pos.latitude,
      longitude: pos.longitude,
      heading: pos.heading >= 0 ? pos.heading : null,
      speedKmh: pos.speed > 0 ? pos.speed * 3.6 : null,
    );
  }
}
