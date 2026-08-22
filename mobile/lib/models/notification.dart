import 'order.dart';

class UnreadCounts {
  const UnreadCounts({
    this.aiAlert = 0,
    this.deliveryAlert = 0,
    this.weatherAlert = 0,
    this.systemAlert = 0,
    this.total = 0,
  });

  final int aiAlert;
  final int deliveryAlert;
  final int weatherAlert;
  final int systemAlert;
  final int total;

  factory UnreadCounts.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const UnreadCounts();
    return UnreadCounts(
      aiAlert: asInt(json['ai_alert']) ?? 0,
      deliveryAlert: asInt(json['delivery_alert']) ?? 0,
      weatherAlert: asInt(json['weather_alert']) ?? 0,
      systemAlert: asInt(json['system_alert']) ?? 0,
      total: asInt(json['total']) ?? 0,
    );
  }
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.userId,
    required this.category,
    required this.title,
    required this.message,
    required this.isRead,
    this.orderId,
    this.createdAt,
  });

  final int id;
  final int userId;
  final String category;
  final String title;
  final String message;
  final bool isRead;
  final int? orderId;
  final String? createdAt;

  String get categoryLabel {
    switch (category) {
      case 'ai_alert':
        return 'AI';
      case 'delivery_alert':
        return 'Delivery';
      case 'weather_alert':
        return 'Weather';
      case 'system_alert':
        return 'System';
      default:
        return category.replaceAll('_', ' ');
    }
  }

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: asInt(json['id']) ?? 0,
      userId: asInt(json['user_id']) ?? 0,
      category: json['category'] as String? ?? 'system_alert',
      title: json['title'] as String? ?? '',
      message: json['message'] as String? ?? '',
      isRead: json['is_read'] as bool? ?? false,
      orderId: asInt(json['order_id']),
      createdAt: json['created_at'] as String?,
    );
  }
}

class NotificationListResponse {
  const NotificationListResponse({
    required this.data,
    required this.pagination,
    this.unread = const UnreadCounts(),
  });

  final List<AppNotification> data;
  final Pagination pagination;
  final UnreadCounts unread;

  factory NotificationListResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['data'];
    return NotificationListResponse(
      data: raw is List
          ? raw.whereType<Map<String, dynamic>>().map(AppNotification.fromJson).toList()
          : const [],
      pagination: Pagination.fromJson(
        json['pagination'] as Map<String, dynamic>? ?? <String, dynamic>{},
      ),
      unread: UnreadCounts.fromJson(json['unread_counts'] as Map<String, dynamic>?),
    );
  }
}
