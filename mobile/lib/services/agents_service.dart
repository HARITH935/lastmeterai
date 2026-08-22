import '../models/analytics.dart';
import '../models/api_error.dart';
import 'api_service.dart';

class AgentsService {
  // ignore: prefer_initializing_formals
  AgentsService({required ApiService api}) : _api = api;

  final ApiService _api;

  Future<List<AgentAccount>> list() async {
    try {
      final res = await _api.client.get<Map<String, dynamic>>('/api/agents');
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return (data['agents'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => AgentAccount.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<AgentAccount> create({
    required String username,
    required String password,
    required String name,
    required String area,
    String? phone,
  }) async {
    try {
      final res = await _api.client.post<Map<String, dynamic>>(
        '/api/agents',
        data: {
          'username': username,
          'password': password,
          'name': name,
          'area': area,
          if (phone != null && phone.isNotEmpty) 'phone': phone,
        },
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return AgentAccount.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<AgentAccount> setActive({required int id, required bool isActive}) async {
    try {
      final res = await _api.client.patch<Map<String, dynamic>>(
        '/api/agents/$id',
        data: {'is_active': isActive},
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return AgentAccount.fromJson(data);
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
