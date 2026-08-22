import '../models/api_error.dart';
import '../models/notification.dart';
import '../models/order.dart';
import 'api_service.dart';

class NotificationService {
  // ignore: prefer_initializing_formals
  NotificationService({required ApiService api}) : _api = api;

  final ApiService _api;

  Future<NotificationListResponse> list({
    String? category,
    bool? isRead,
    int page = 1,
    int perPage = 20,
  }) async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>(
        '/api/notifications',
        queryParameters: {
          'page': page,
          'per_page': perPage,
          if (category != null && category.isNotEmpty) 'category': category,
          if (isRead != null) 'is_read': isRead ? 'true' : 'false',
        },
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return NotificationListResponse.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<AppNotification> markRead(int id) async {
    try {
      final res = await _api.client.patch<Map<String, dynamic>>(
        '/api/notifications/$id/read',
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return AppNotification.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<int> markAllRead({String? category}) async {
    try {
      final res = await _api.client.patch<Map<String, dynamic>>(
        '/api/notifications/read-all',
        data: {
          if (category != null && category.isNotEmpty) 'category': category,
        },
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return asInt(data['updated_count']) ?? 0;
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> delete(int id) async {
    try {
      await _api.client.delete('/api/notifications/$id');
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
