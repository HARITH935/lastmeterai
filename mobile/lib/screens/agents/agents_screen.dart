import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/analytics.dart';
import '../../models/api_error.dart';
import '../../state/ops_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/helpers.dart';
import '../../utils/validators.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/period_toggle.dart';

class AgentsScreen extends ConsumerStatefulWidget {
  const AgentsScreen({super.key});

  @override
  ConsumerState<AgentsScreen> createState() => _AgentsScreenState();
}

class _AgentsScreenState extends ConsumerState<AgentsScreen> {
  String _period = 'week';
  var _tab = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agents')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createAgent(context),
        backgroundColor: AppColors.amber,
        foregroundColor: AppColors.ground,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('New agent'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: PeriodToggle(
              value: _tab == 2 ? 'accounts' : _period,
              options: const [
                ('week', 'This Week'),
                ('month', 'This Month'),
              ],
              onChanged: (v) => setState(() {
                _tab = 0;
                _period = v;
              }),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                ChoiceChip(label: const Text('Leaderboard'), selected: _tab == 0, onSelected: (_) => setState(() => _tab = 0)),
                const SizedBox(width: 8),
                ChoiceChip(label: const Text('Accounts'), selected: _tab == 1, onSelected: (_) => setState(() => _tab = 1)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(child: _tab == 0 ? _Leaderboard(period: _period) : const _Accounts()),
        ],
      ),
    );
  }

  Future<void> _createAgent(BuildContext context) async {
    final username = TextEditingController();
    final password = TextEditingController();
    final name = TextEditingController();
    final phone = TextEditingController();
    var area = validAreas.first;
    final err = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.groundSoft,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('Create agent', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 16),
                    TextField(controller: username, decoration: const InputDecoration(labelText: 'Username')),
                    const SizedBox(height: 10),
                    TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
                    const SizedBox(height: 10),
                    TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
                    const SizedBox(height: 10),
                    TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: area,
                      items: [for (final a in validAreas) DropdownMenuItem(value: a, child: Text(a))],
                      onChanged: (v) => setLocal(() => area = v ?? area),
                      decoration: const InputDecoration(labelText: 'Area'),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () async {
                        final uErr = Validators.username(username.text);
                        final pErr = Validators.newPassword(password.text);
                        if (uErr != null || pErr != null || name.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(uErr ?? pErr ?? 'Name is required.')),
                          );
                          return;
                        }
                        try {
                          await ref.read(agentsServiceProvider).create(
                                username: username.text.trim(),
                                password: password.text,
                                name: name.text.trim(),
                                area: area,
                                phone: phone.text.trim(),
                              );
                          if (ctx.mounted) Navigator.pop(ctx, 'ok');
                        } catch (e) {
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(content: Text(e is ApiError ? e.userMessage : 'Could not create agent.')),
                            );
                          }
                        }
                      },
                      child: const Text('Create'),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
    username.dispose();
    password.dispose();
    name.dispose();
    phone.dispose();
    if (err == 'ok') ref.invalidate(agentAccountsProvider);
  }
}

class _Leaderboard extends ConsumerWidget {
  const _Leaderboard({required this.period});
  final String period;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(leaderboardProvider(period));
    return async.when(
      loading: () => const LoadingWidget(label: 'Loading agents'),
      error: (e, _) => AppErrorWidget(
        message: e is ApiError ? e.userMessage : 'Unable to load leaderboard.',
        onRetry: () => ref.invalidate(leaderboardProvider(period)),
      ),
      data: (rows) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final a = rows[i];
          return SurfaceCard(
            child: Row(
              children: [
                Text('#${a.rank}', style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.w800)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.agentName, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text('${a.area} · ${a.deliveredCount}/${a.orderCount} delivered', style: const TextStyle(color: AppColors.inkMuted, fontSize: 13)),
                    ],
                  ),
                ),
                Text(percent1(a.successRate), style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.go)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Accounts extends ConsumerWidget {
  const _Accounts();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(agentAccountsProvider);
    return async.when(
      loading: () => const LoadingWidget(label: 'Loading accounts'),
      error: (e, _) => AppErrorWidget(
        message: e is ApiError ? e.userMessage : 'Unable to load accounts.',
        onRetry: () => ref.invalidate(agentAccountsProvider),
      ),
      data: (rows) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final a = rows[i];
          return SurfaceCard(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text('@${a.username} · ${a.area ?? '—'}', style: const TextStyle(color: AppColors.inkMuted, fontSize: 13)),
                    ],
                  ),
                ),
                Switch(
                  value: a.isActive,
                  activeThumbColor: AppColors.amber,
                  onChanged: (v) async {
                    try {
                      await ref.read(agentsServiceProvider).setActive(id: a.id, isActive: v);
                      ref.invalidate(agentAccountsProvider);
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(e is ApiError ? e.userMessage : 'Could not update agent.')),
                        );
                      }
                    }
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
