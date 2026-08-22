import '../models/api_error.dart';
import 'api_service.dart';

class ChatReply {
  const ChatReply({
    required this.sessionId,
    required this.intent,
    required this.intentConfidence,
    required this.reply,
  });

  final String sessionId;
  final String intent;
  final double intentConfidence;
  final String reply;
}

class ChatService {
  // ignore: prefer_initializing_formals
  ChatService({required ApiService api}) : _api = api;

  final ApiService _api;

  Future<ChatReply> send({required String message, String? sessionId}) async {
    try {
      final res = await _api.client.post<Map<String, dynamic>>(
        '/api/chat/message',
        data: {
          'message': message,
          if (sessionId != null && sessionId.isNotEmpty) 'session_id': sessionId,
        },
      );
      final data = res.data;
      if (data == null) throw ApiError.unknown();
      return ChatReply(
        sessionId: data['session_id'] as String? ?? '',
        intent: data['intent'] as String? ?? 'general',
        intentConfidence: (data['intent_confidence'] as num?)?.toDouble() ?? 0,
        reply: data['reply'] as String? ?? '',
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
