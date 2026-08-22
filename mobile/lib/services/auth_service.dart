import 'package:dio/dio.dart';

import '../models/api_error.dart';
import '../models/user.dart';
import 'api_service.dart';
import 'storage_service.dart';

class LoginResult {
  const LoginResult({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
  });

  final User user;
  final String accessToken;
  final String refreshToken;
}

class AuthService {
  AuthService({
    required this._api,
    required this._storage,
  });

  final ApiService _api;
  final StorageService _storage;

  Future<LoginResult> login(String username, String password) async {
    try {
      final res = await _api.client.post<Map<String, dynamic>>(
        '/api/auth/login',
        data: {'username': username.trim(), 'password': password},
        options: Options(extra: {'skipAuth': true}),
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      final user = User.fromJson(data['user'] as Map<String, dynamic>);
      final access = data['access_token'] as String;
      final refresh = data['refresh_token'] as String;
      await _storage.saveSession(
        accessToken: access,
        refreshToken: refresh,
        user: user,
      );
      return LoginResult(
        user: user,
        accessToken: access,
        refreshToken: refresh,
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<User> me() async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>('/api/auth/me');
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return User.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<User> updateProfile({
    String? name,
    String? phone,
    bool clearPhone = false,
    NotificationPrefs? prefs,
  }) async {
    try {
      final payload = <String, dynamic>{
        'name': ?name,
        'notification_prefs': ?prefs?.toJson(),
      };
      if (clearPhone) {
        payload['phone'] = null;
      } else if (phone != null) {
        payload['phone'] = phone;
      }
      final res = await _api.client.patch<Map<String, dynamic>>(
        '/api/auth/me/profile',
        data: payload,
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return User.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    try {
      await _api.client.patch(
        '/api/auth/me/password',
        data: {
          'current_password': currentPassword,
          'new_password': newPassword,
          'confirm_password': confirmPassword,
        },
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> logout() async {
    try {
      await _api.client.post('/api/auth/logout');
    } catch (_) {
      // Always clear local session even if the network call fails.
    } finally {
      await _storage.clear();
    }
  }
}
