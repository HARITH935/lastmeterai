class NotificationPrefs {
  const NotificationPrefs({
    this.aiAlert = true,
    this.deliveryAlert = true,
    this.weatherAlert = true,
    this.systemAlert = true,
  });

  final bool aiAlert;
  final bool deliveryAlert;
  final bool weatherAlert;
  final bool systemAlert;

  factory NotificationPrefs.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const NotificationPrefs();
    return NotificationPrefs(
      aiAlert: json['ai_alert'] as bool? ?? true,
      deliveryAlert: json['delivery_alert'] as bool? ?? true,
      weatherAlert: json['weather_alert'] as bool? ?? true,
      systemAlert: json['system_alert'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'ai_alert': aiAlert,
        'delivery_alert': deliveryAlert,
        'weather_alert': weatherAlert,
        'system_alert': systemAlert,
      };

  NotificationPrefs copyWith({
    bool? aiAlert,
    bool? deliveryAlert,
    bool? weatherAlert,
    bool? systemAlert,
  }) {
    return NotificationPrefs(
      aiAlert: aiAlert ?? this.aiAlert,
      deliveryAlert: deliveryAlert ?? this.deliveryAlert,
      weatherAlert: weatherAlert ?? this.weatherAlert,
      systemAlert: systemAlert ?? this.systemAlert,
    );
  }
}

class User {
  const User({
    required this.id,
    required this.username,
    required this.role,
    required this.name,
    this.phone,
    this.area,
    this.city = 'Chennai',
    this.isActive = true,
    this.notificationPrefs = const NotificationPrefs(),
    this.createdAt,
  });

  final int id;
  final String username;
  final String role;
  final String name;
  final String? phone;
  final String? area;
  final String city;
  final bool isActive;
  final NotificationPrefs notificationPrefs;
  final String? createdAt;

  bool get isAgent => role == 'agent';
  bool get isManager => role == 'manager';

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as int,
      username: json['username'] as String,
      role: json['role'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String?,
      area: json['area'] as String?,
      city: (json['city'] as String?) ?? 'Chennai',
      isActive: json['is_active'] as bool? ?? true,
      notificationPrefs: NotificationPrefs.fromJson(
        json['notification_prefs'] as Map<String, dynamic>?,
      ),
      createdAt: json['created_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'role': role,
        'name': name,
        'phone': phone,
        'area': area,
        'city': city,
        'is_active': isActive,
        'notification_prefs': notificationPrefs.toJson(),
        'created_at': createdAt,
      };

  User copyWith({
    String? name,
    String? phone,
    bool clearPhone = false,
    NotificationPrefs? notificationPrefs,
  }) {
    return User(
      id: id,
      username: username,
      role: role,
      name: name ?? this.name,
      phone: clearPhone ? null : (phone ?? this.phone),
      area: area,
      city: city,
      isActive: isActive,
      notificationPrefs: notificationPrefs ?? this.notificationPrefs,
      createdAt: createdAt,
    );
  }
}
