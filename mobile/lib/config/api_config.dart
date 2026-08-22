/// Central API base URL.
///
/// Override at build/run time:
///   flutter run --dart-define=API_BASE=http://10.0.2.2:5001
/// Android emulator → host machine: 10.0.2.2
/// Physical device on LAN: http://YOUR_PC_IP:5001
class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://lastmeterai.onrender.com',
  );

  /// Mapbox public token (pk.…). Never commit a secret token.
  ///   flutter run --dart-define=MAPBOX_TOKEN=pk.eyJ...
  static const String mapboxToken = String.fromEnvironment('MAPBOX_TOKEN');

  static bool get hasMapbox => mapboxToken.isNotEmpty;
}
