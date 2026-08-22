import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/user.dart';
import '../../state/auth_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/validators.dart';
import '../../widgets/period_toggle.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _currentPw = TextEditingController();
  final _newPw = TextEditingController();
  final _confirmPw = TextEditingController();
  String? _pwError;
  var _savingPw = false;

  @override
  void dispose() {
    _currentPw.dispose();
    _newPw.dispose();
    _confirmPw.dispose();
    super.dispose();
  }

  Future<void> _savePrefs(NotificationPrefs prefs) async {
    final err = await ref.read(authControllerProvider.notifier).updateProfile(prefs: prefs);
    if (!mounted) return;
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    }
  }

  Future<void> _changePassword() async {
    final current = _currentPw.text;
    final next = _newPw.text;
    final confirm = _confirmPw.text;
    final err = Validators.newPassword(next) ??
        (confirm != next ? 'New password and confirmation do not match.' : null);
    if (current.isEmpty) {
      setState(() => _pwError = 'Current password is required.');
      return;
    }
    if (err != null) {
      setState(() => _pwError = err);
      return;
    }
    setState(() {
      _savingPw = true;
      _pwError = null;
    });
    final result = await ref.read(authControllerProvider.notifier).changePassword(
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        );
    if (!mounted) return;
    setState(() {
      _savingPw = false;
      _pwError = result;
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).user;
    final prefs = user?.notificationPrefs ?? const NotificationPrefs();

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          SurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Alert preferences'),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('AI alerts'),
                  value: prefs.aiAlert,
                  activeThumbColor: AppColors.amber,
                  onChanged: (v) => _savePrefs(prefs.copyWith(aiAlert: v)),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Delivery alerts'),
                  value: prefs.deliveryAlert,
                  activeThumbColor: AppColors.amber,
                  onChanged: (v) => _savePrefs(prefs.copyWith(deliveryAlert: v)),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Weather alerts'),
                  value: prefs.weatherAlert,
                  activeThumbColor: AppColors.amber,
                  onChanged: (v) => _savePrefs(prefs.copyWith(weatherAlert: v)),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('System alerts'),
                  value: prefs.systemAlert,
                  activeThumbColor: AppColors.amber,
                  onChanged: (v) => _savePrefs(prefs.copyWith(systemAlert: v)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Password'),
                TextField(
                  controller: _currentPw,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Current password'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _newPw,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'New password'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _confirmPw,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Confirm new password'),
                ),
                if (_pwError != null) ...[
                  const SizedBox(height: 8),
                  Text(_pwError!, style: const TextStyle(color: AppColors.nogo)),
                ],
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _savingPw ? null : _changePassword,
                  child: Text(_savingPw ? 'Updating…' : 'Change password'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const SurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionLabel('Appearance'),
                Text(
                  'This app uses the LastMeter dark navy theme, matching the website night mode.',
                  style: TextStyle(color: AppColors.inkMuted, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
