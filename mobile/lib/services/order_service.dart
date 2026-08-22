import '../models/api_error.dart';
import '../models/order.dart';
import 'api_service.dart';

class OrderService {
  // Public named param `api` is required at call sites outside this library.
  // ignore: prefer_initializing_formals
  OrderService({required ApiService api}) : _api = api;

  final ApiService _api;

  Future<OrderListResponse> list({
    String? status,
    String? riskLevel,
    String? dateFrom,
    String? search,
    int page = 1,
    int perPage = 100,
    String sortBy = 'deadline',
    String sortDir = 'asc',
  }) async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>(
        '/api/orders',
        queryParameters: {
          'page': page,
          'per_page': perPage,
          'sort_by': sortBy,
          'sort_dir': sortDir,
          if (status != null && status.isNotEmpty) 'status': status,
          if (riskLevel != null && riskLevel.isNotEmpty) 'risk_level': riskLevel,
          if (dateFrom != null && dateFrom.isNotEmpty) 'date_from': dateFrom,
          if (search != null && search.isNotEmpty) 'search': search,
        },
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return OrderListResponse.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<Order> getById(int id) async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>('/api/orders/$id');
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return Order.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<OrderEta> eta(int id) async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>('/api/orders/$id/eta');
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return OrderEta.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({int id, String orderNumber, String status})> updateStatus({
    required int id,
    required String status,
    String? failureReason,
  }) async {
    try {
      final res = await _api.client.patch<Map<String, dynamic>>(
        '/api/orders/$id/status',
        data: {
          'status': status,
          'failure_reason': ?failureReason,
        },
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return (
        id: asInt(data['id']) ?? id,
        orderNumber: data['order_number'] as String? ?? '',
        status: data['status'] as String? ?? status,
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<OptimizedRoute> optimizedRoute() async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>(
        '/api/orders/optimized-route',
        queryParameters: {'optimize': 'time'},
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return OptimizedRoute.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
