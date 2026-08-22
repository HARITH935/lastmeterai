import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/api_error.dart';
import '../../state/auth_controller.dart';
import '../../state/ops_controller.dart';
import '../../theme/app_theme.dart';

const _intentLabels = {
  'order_status': 'Order Status',
  'earnings_query': 'Earnings',
  'area_risk': 'Area Risk',
  'reassign_suggestion': 'Reassignment',
  'weather_query': 'Weather',
  'agent_performance': 'Agent Performance',
  'postpone_query': 'Postpone Query',
  'general': 'General',
};

class _Msg {
  const _Msg({required this.role, required this.text, this.intent, this.confidence});
  final String role;
  final String text;
  final String? intent;
  final double? confidence;
}

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <_Msg>[];
  String? _sessionId;
  var _pending = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  List<String> get _suggestions {
    final manager = ref.read(authControllerProvider).user?.isManager == true;
    return manager
        ? const [
            'Which area has the most failures?',
            'Suggest reassignments for today',
            'How are my agents performing this week?',
          ]
        : const [
            'How much will I earn today?',
            'Which orders should I deliver first?',
            'Which orders should be postponed?',
          ];
  }

  Future<void> _send(String raw) async {
    final text = raw.trim();
    if (text.isEmpty || _pending) return;
    setState(() {
      _messages.add(_Msg(role: 'user', text: text));
      _pending = true;
      _input.clear();
    });
    _jump();
    try {
      final res = await ref.read(chatServiceProvider).send(
            message: text,
            sessionId: _sessionId,
          );
      if (!mounted) return;
      setState(() {
        _sessionId = res.sessionId;
        _messages.add(_Msg(
          role: 'assistant',
          text: res.reply,
          intent: res.intent,
          confidence: res.intentConfidence,
        ));
        _pending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.add(_Msg(
          role: 'error',
          text: e is ApiError ? e.userMessage : "Couldn't reach the assistant. Try again.",
        ));
        _pending = false;
      });
    }
    _jump();
  }

  void _jump() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final manager = ref.watch(authControllerProvider).user?.isManager == true;

    return Scaffold(
      appBar: AppBar(title: const Text('AI Chat')),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty && !_pending
                ? _Empty(
                    isManager: manager,
                    suggestions: _suggestions,
                    onSuggest: _send,
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    itemCount: _messages.length + (_pending ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i >= _messages.length) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text('Thinking…', style: TextStyle(color: AppColors.inkMuted)),
                          ),
                        );
                      }
                      return _Bubble(msg: _messages[i]);
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      enabled: !_pending,
                      textInputAction: TextInputAction.send,
                      onSubmitted: _send,
                      decoration: const InputDecoration(
                        hintText: 'Ask me anything…',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _pending ? null : () => _send(_input.text),
                    style: IconButton.styleFrom(backgroundColor: AppColors.amber),
                    icon: const Icon(Icons.send, color: AppColors.ground),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({
    required this.isManager,
    required this.suggestions,
    required this.onSuggest,
  });

  final bool isManager;
  final List<String> suggestions;
  final ValueChanged<String> onSuggest;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      children: [
        const Text(
          'AI',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.amber,
            fontSize: 28,
            fontWeight: FontWeight.w800,
            letterSpacing: 4,
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'LastMeter Assistant',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          isManager
              ? 'Ask about area performance, agent assignments, failures, or weather impact.'
              : 'Ask about your deliveries, earnings, or what to prioritise today.',
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
        ),
        const SizedBox(height: 24),
        for (final s in suggestions) ...[
          OutlinedButton(
            onPressed: () => onSuggest(s),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.ink,
              side: const BorderSide(color: AppColors.line),
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
            child: Text(s),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.msg});
  final _Msg msg;

  @override
  Widget build(BuildContext context) {
    final isUser = msg.role == 'user';
    final isError = msg.role == 'error';
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320),
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: isUser
                ? AppColors.amber
                : isError
                    ? AppColors.nogo.withValues(alpha: 0.18)
                    : AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: isUser ? null : Border.all(color: AppColors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                msg.text,
                style: TextStyle(
                  color: isUser ? AppColors.ground : AppColors.ink,
                  height: 1.4,
                ),
              ),
              if (msg.intent != null && !isUser && !isError) ...[
                const SizedBox(height: 8),
                Text(
                  '${_intentLabels[msg.intent!] ?? msg.intent}'
                  '${msg.confidence != null && msg.confidence! > 0 ? ' · ${(msg.confidence! * 100).round()}%' : ''}',
                  style: const TextStyle(color: AppColors.inkDim, fontSize: 11),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
