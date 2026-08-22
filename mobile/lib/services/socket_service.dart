import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/api_config.dart';
import 'location_service.dart';
import 'storage_service.dart';

class SocketService {
  // Public named param `storage` is required at call sites outside this library.
  // ignore: prefer_initializing_formals
  SocketService({required StorageService storage}) : _storage = storage;

  final StorageService _storage;
  io.Socket? _socket;
  final _listeners = <String, List<void Function(dynamic)>>{};

  bool get connected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (_socket?.connected == true) return;
    final token = await _storage.accessToken;
    if (token == null || token.isEmpty) return;

    _socket?.dispose();
    final ready = Completer<void>();
    _socket = io.io(
      ApiConfig.baseUrl,
      io.OptionBuilder()
          .setTransports(['polling', 'websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableForceNew()
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(2000)
          .build(),
    );
    _wireAll();
    _socket!.onConnect((_) {
      _wireAll();
      if (!ready.isCompleted) ready.complete();
    });
    _socket!.onConnectError((err) {
      if (!ready.isCompleted) {
        ready.completeError(StateError('$err'));
      }
    });
    _socket!.connect();
    await ready.future.timeout(const Duration(seconds: 12));
  }

  void on(String event, void Function(dynamic data) handler) {
    _listeners.putIfAbsent(event, () => []).add(handler);
    _wire(event);
  }

  void off(String event, void Function(dynamic data) handler) {
    _listeners[event]?.remove(handler);
  }

  void emitLocation(LocationFix fix) {
    _socket?.emit('agent_location_update', {
      'lat': fix.latitude,
      'lon': fix.longitude,
      if (fix.heading != null) 'heading': fix.heading,
      if (fix.speedKmh != null) 'speed_kmh': fix.speedKmh,
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  void _wireAll() {
    for (final event in _listeners.keys) {
      _wire(event);
    }
  }

  void _wire(String event) {
    final socket = _socket;
    if (socket == null) return;
    socket.off(event);
    socket.on(event, (data) {
      for (final handler in List<void Function(dynamic)>.from(_listeners[event] ?? const [])) {
        handler(data);
      }
    });
  }
}
