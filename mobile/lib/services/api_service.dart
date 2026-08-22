import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/api_config.dart';
import '../models/api_error.dart';
import 'storage_service.dart';

/// Shared HTTP client. Mirrors frontend/src/api/authFetch.ts:
/// attach Bearer token, refresh once on TOKEN_EXPIRED / TOKEN_INVALID.
class ApiService {
  ApiService({
    required this._storage,
    Dio? dio,
  }) {
    _dio = dio ??
        Dio(
          BaseOptions(
            baseUrl: ApiConfig.baseUrl,
            connectTimeout: const Duration(seconds: 60),
            receiveTimeout: const Duration(seconds: 60),
            headers: const {'Content-Type': 'application/json'},
          ),
        );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: _onRequest,
        onError: _onError,
      ),
    );
  }

  final StorageService _storage;
  late final Dio _dio;
  Future<String?>? _inflightRefresh;

  Dio get client => _dio;

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final skipAuth = options.extra['skipAuth'] == true;
    if (!skipAuth) {
      final token = await _storage.accessToken;
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final status = err.response?.statusCode;
    if (status != 401) {
      handler.next(err);
      return;
    }

    final code = _errorCode(err.response?.data);
    const refreshOn = {'TOKEN_EXPIRED', 'TOKEN_INVALID'};
    if (code == null || !refreshOn.contains(code)) {
      handler.next(err);
      return;
    }

    if (err.requestOptions.extra['retried'] == true) {
      handler.next(err);
      return;
    }

    final newToken = await _refreshAccessToken();
    if (newToken == null) {
      handler.next(err);
      return;
    }

    final opts = err.requestOptions;
    opts.headers['Authorization'] = 'Bearer $newToken';
    opts.extra['retried'] = true;
    try {
      final response = await _dio.fetch(opts);
      handler.resolve(response);
    } catch (e) {
      handler.next(e is DioException ? e : err);
    }
  }

  Future<String?> _refreshAccessToken() {
    if (_inflightRefresh != null) return _inflightRefresh!;
    _inflightRefresh = () async {
      try {
        final refresh = await _storage.refreshToken;
        if (refresh == null || refresh.isEmpty) return null;
        final res = await _dio.post<Map<String, dynamic>>(
          '/api/auth/refresh',
          data: {'refresh_token': refresh},
          options: Options(extra: {'skipAuth': true}),
        );
        final access = res.data?['access_token'] as String?;
        final newRefresh = res.data?['refresh_token'] as String?;
        if (access == null || newRefresh == null) return null;
        await _storage.updateTokens(
          accessToken: access,
          refreshToken: newRefresh,
        );
        return access;
      } catch (_) {
        return null;
      } finally {
        _inflightRefresh = null;
      }
    }();
    return _inflightRefresh!;
  }

  static String? _errorCode(dynamic data) {
    if (data is Map && data['error'] is String) return data['error'] as String;
    return null;
  }
}

ApiError mapDioError(Object error) {
  if (error is ApiError) return error;
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiError.timeout();
      case DioExceptionType.connectionError:
        return kIsWeb ? ApiError.webPreview() : ApiError.network();
      default:
        break;
    }
    if (!kIsWeb && error.error is SocketException) return ApiError.network();
    final data = error.response?.data;
    if (data is Map<String, dynamic>) {
      return ApiError.fromBody(data, statusCode: error.response?.statusCode);
    }
    final status = error.response?.statusCode;
    if (status == 429) {
      return const ApiError(
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many attempts. Wait a minute and try again.',
        statusCode: 429,
      );
    }
    if (status != null && status >= 500) {
      return ApiError(
        code: 'SERVER_ERROR',
        message: 'Server error. Please try again shortly.',
        statusCode: status,
      );
    }
  }
  return ApiError.unknown();
}
