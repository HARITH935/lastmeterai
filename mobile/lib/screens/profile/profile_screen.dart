import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/api_error.dart';
import '../../models/user.dart';
import '../../state/auth_controller.dart';
import '../../state/orders_controller.dart';
import '../../theme/app_theme.dart';
import '../../utils/helpers.dart';
import '../../utils/validators.dart';
import '../../widgets/error_widget.dart';
import '../../widgets/loading_widget.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _currentPw = TextEditingController();
  final _newPw = TextEditingController();
  final _confirmPw = TextEditingController();
  String? _profileError;
  String? _pwError;
  var _savingProfile = false;
  var _savingPw = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).user;
    _name.text = user?.name ?? '';
    _phone.text = user?.phone ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _currentPw.dispose();
    _newPw.dispose();
    _confirmPw.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _profileError = 'Name is required.');
      return;
    }
    final phoneErr = Validators.phone(_phone.text);
    if (phoneErr != null) {
      setState(() => _profileError = phoneErr);
      return;
    }
    setState(() {
      _savingProfile = true;
      _profileError = null;
    });
    final phone = _phone.text.trim();
    final err = await ref.read(authControllerProvider.notifier).updateProfile(
          name: name,
          phone: phone.isEmpty ? null : phone,
          clearPhone: phone.isEmpty,
        );
    if (!mounted) return;
    setState(() {
      _savingProfile = false;
      _profileError = err;
    });
    if (err == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile saved.')),
      );
    }
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
    final earnings = ref.watch(deliveredEarningsProvider);
    final prefs = user?.notificationPrefs ?? const NotificationPrefs();

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(user?.name ?? '', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(user?.username ?? '', style: const TextStyle(color: AppColors.inkMuted)),
          const SizedBox(height: 16),
          _kv('Role', user?.role ?? ''),
          _kv('Area', user?.area ?? '—'),
          _kv('City', user?.city ?? ''),
          _kv('Status', user?.isActive == true ? 'Active' : 'Disabled'),
          const SizedBox(height: 16),
          earnings.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: LoadingWidget(label: 'Loading earnings'),
            ),
            error: (e, _) => AppErrorWidget(
              message: e is ApiError ? e.userMessage : 'Unable to load earnings.',
              onRetry: () => ref.invalidate(deliveredEarningsProvider),
            ),
            data: (sum) => _card(
              title: 'Earnings',
              children: [
                Text(
                  formatInr(sum.total),
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.go),
                ),
                const SizedBox(height: 4),
                Text(
                  '${sum.count} delivered in your area · sum of payment amount (no earnings API)',
                  style: const TextStyle(color: AppColors.inkMuted, height: 1.35),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _card(
            title: 'Account',
            children: [
              TextField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone'),
              ),
              if (_profileError != null) ...[
                const SizedBox(height: 8),
                Text(_profileError!, style: const TextStyle(color: AppColors.nogo)),
              ],
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _savingProfile ? null : _saveProfile,
                child: Text(_savingProfile ? 'Saving…' : 'Save profile'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _card(
            title: 'Alert preferences',
            children: [
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
          const SizedBox(height: 16),
          _card(
            title: 'Password',
            children: [
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
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.nogo,
              foregroundColor: AppColors.ink,
            ),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
  }

  Widget _card({required String title, required List<Widget> children}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              color: AppColors.inkDim,
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: const TextStyle(color: AppColors.inkDim)),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
