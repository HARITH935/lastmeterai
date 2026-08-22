import 'package:flutter_test/flutter_test.dart';

import 'package:lastmeter_ai/models/api_error.dart';
import 'package:lastmeter_ai/models/notification.dart';
import 'package:lastmeter_ai/models/order.dart';
import 'package:lastmeter_ai/models/user.dart';
import 'package:lastmeter_ai/services/location_service.dart';
import 'package:lastmeter_ai/utils/delivery_outcome.dart';
import 'package:lastmeter_ai/utils/validators.dart';

void main() {
  group('Validators', () {
    test('rejects empty username', () {
      expect(Validators.username(''), isNotNull);
    });
    test('rejects username with spaces', () {
      expect(Validators.username('ravi kumar'), isNotNull);
    });
    test('accepts dotted username', () {
      expect(Validators.username('ravi.kumar'), isNull);
    });
    test('rejects short password', () {
      expect(Validators.password('123'), isNotNull);
    });
    test('accepts 6+ password', () {
      expect(Validators.password('agent123'), isNull);
    });
  });

  group('ApiError', () {
    test('maps invalid credentials to a friendly message', () {
      final err = ApiError.fromBody({
        'error': 'INVALID_CREDENTIALS',
        'message': 'Invalid credentials.',
      }, statusCode: 401);
      expect(err.userMessage, 'Wrong username or password.');
    });
  });

  group('User', () {
    test('parses login user payload', () {
      final user = User.fromJson({
        'id': 3,
        'username': 'ravi.kumar',
        'role': 'agent',
        'name': 'Ravi Kumar',
        'phone': '9876543210',
        'area': 'Adyar',
        'city': 'Chennai',
        'is_active': true,
        'notification_prefs': {
          'ai_alert': true,
          'delivery_alert': true,
          'weather_alert': true,
          'system_alert': true,
        },
        'created_at': '2026-06-21T08:00:00Z',
      });
      expect(user.isAgent, isTrue);
      expect(user.area, 'Adyar');
      expect(user.notificationPrefs.aiAlert, isTrue);
    });
  });

  group('Order', () {
    test('parses list row and nested decision', () {
      final order = Order.fromJson({
        'id': 1,
        'order_number': 'LM-0001',
        'customer_name': 'Anitha Suresh',
        'customer_phone': '9876500001',
        'customer_address': '7 Main Road, Adyar, Chennai',
        'area': 'Adyar',
        'city': 'Chennai',
        'latitude': 13.00635,
        'longitude': 80.26040,
        'residence_type': 'apartment',
        'agent_id': 2,
        'agent_name': 'Ravi Kumar',
        'package_size': 'medium',
        'time_window': 'morning',
        'deadline': '2026-06-26T23:59:00Z',
        'status': 'pending',
        'failure_reason': null,
        'payment_amount': 350.0,
        'is_urgent': false,
        'created_at': '2026-06-21T08:30:00Z',
        'updated_at': '2026-06-21T08:30:00Z',
        'latest_decision': {
          'id': 1,
          'decision': 'NO-GO',
          'success_probability': 0.34,
          'risk_score': 66,
          'risk_level': 'high',
          'top_factors': [
            {'factor': 'weather_risk', 'contribution': 35.2},
          ],
        },
      });
      expect(order.effectiveDecision, 'NO-GO');
      expect(order.latestDecision!.successProbability, 0.34);
      expect(order.latestDecision!.topFactors.first.label, 'Weather');
    });

    test('parses ETA payload', () {
      final eta = OrderEta.fromJson({
        'order_id': 1,
        'predicted_min': 22,
        'eta_low_min': 18,
        'eta_high_min': 28,
        'eta_time': '10:45 AM',
        'distance_km': 4.2,
      });
      expect(eta.predictedMin, 22);
      expect(eta.distanceKm, 4.2);
    });

    test('parses optimized route geometry as lat,lon pairs', () {
      final route = OptimizedRoute.fromJson({
        'total_distance_km': 6.4,
        'total_duration_min': 22,
        'stops': [
          {
            'order_id': 1,
            'order_number': 'ORD-1',
            'sequence': 1,
            'customer_name': 'Asha',
            'latitude': 13.006,
            'longitude': 80.26,
            'status': 'pending',
            'risk_level': 'low',
          },
        ],
        'route_geometry': [
          [13.006, 80.26],
          [13.01, 80.27],
        ],
      });
      expect(route.stops, hasLength(1));
      expect(route.routeGeometry[1][0], 13.01);
    });
  });

  group('LocationFix', () {
    test('accepts Adyar inside the Chennai box', () {
      const fix = LocationFix(latitude: 13.006, longitude: 80.26);
      expect(fix.inChennaiBbox, isTrue);
    });
    test('drops a point outside the Chennai box', () {
      const fix = LocationFix(latitude: 12.97, longitude: 77.59);
      expect(fix.inChennaiBbox, isFalse);
    });
    test('treats a nearby Adyar point as arrived', () {
      const fix = LocationFix(latitude: 13.00635, longitude: 80.26040);
      expect(fix.arrivedAt(13.00640, 80.26045), isTrue);
    });
    test('does not treat a kilometre away as arrived', () {
      const fix = LocationFix(latitude: 13.00635, longitude: 80.26040);
      expect(fix.arrivedAt(13.015, 80.27), isFalse);
    });
  });

  group('DeliveryOutcome', () {
    test('requires a reason for failed and postponed', () {
      expect(DeliveryOutcome.needsReason('failed'), isTrue);
      expect(DeliveryOutcome.needsReason('postponed'), isTrue);
      expect(DeliveryOutcome.needsReason('delivered'), isFalse);
      expect(DeliveryOutcome.validate(status: 'failed', reason: ''), isNotNull);
      expect(DeliveryOutcome.validate(status: 'postponed', reason: '  '), isNotNull);
      expect(DeliveryOutcome.validate(status: 'delivered', reason: null), isNull);
      expect(DeliveryOutcome.validate(status: 'failed', reason: 'Customer not home'), isNull);
    });
  });

  group('Notifications', () {
    test('parses inbox row and unread totals', () {
      final res = NotificationListResponse.fromJson({
        'data': [
          {
            'id': 9,
            'user_id': 3,
            'category': 'delivery_alert',
            'title': 'Arrived at delivery location',
            'message': 'You have arrived.',
            'is_read': false,
            'order_id': 12,
            'created_at': '2026-08-13T10:00:00Z',
          },
        ],
        'pagination': {'page': 1, 'per_page': 20, 'total': 1, 'pages': 1},
        'unread_counts': {
          'ai_alert': 0,
          'delivery_alert': 2,
          'weather_alert': 0,
          'system_alert': 1,
          'total': 3,
        },
      });
      expect(res.data.first.categoryLabel, 'Delivery');
      expect(res.data.first.orderId, 12);
      expect(res.unread.total, 3);
    });
  });

  group('Password rules', () {
    test('new password must be 8+ characters', () {
      expect(Validators.newPassword('short'), isNotNull);
      expect(Validators.newPassword('agent123'), isNull);
    });
    test('phone allows empty and 10-digit values', () {
      expect(Validators.phone(''), isNull);
      expect(Validators.phone('9876543210'), isNull);
      expect(Validators.phone('98 76'), isNotNull);
    });
  });
}
