import 'package:flutter/material.dart';

import '../models/order.dart';
import '../theme/app_theme.dart';
import '../utils/helpers.dart';
import 'order_card.dart';

/// Backend GO/NO-GO + SHAP visualization. Does not compute predictions.
class RiskCard extends StatelessWidget {
  const RiskCard({super.key, required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final d = order.latestDecision;
    if (d == null && order.effectiveDecision.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: const Text(
          'No AI prediction is stored for this order yet.',
          style: TextStyle(color: AppColors.inkMuted),
        ),
      );
    }

    final decision = d?.decision ?? order.effectiveDecision;
    final urgentGo = order.isUrgent && decision == 'GO';
    final go = decision == 'GO';
    final accent = go ? AppColors.go : AppColors.nogo;
    final label = urgentGo ? 'URGENT GO' : decision;
    final prob = d?.successProbability;
    final risk = d?.riskLevel ?? order.effectiveRiskLevel;
    final score = d?.riskScore ?? order.effectiveRiskScore ?? 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'AI DELIVERY PREDICTION',
            style: TextStyle(
              color: AppColors.inkDim,
              fontSize: 11,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'RISK SCORE',
            style: TextStyle(color: riskColor(risk), fontSize: 11, letterSpacing: 1, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                '$score',
                style: TextStyle(color: riskColor(risk), fontSize: 36, fontWeight: FontWeight.w800),
              ),
              const Text(' / 100', style: TextStyle(color: AppColors.inkDim, fontSize: 16)),
              const Spacer(),
              Text(risk.toUpperCase(), style: TextStyle(color: riskColor(risk), fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 8),
          _Meter(value: score / 100, color: riskColor(risk)),
          const SizedBox(height: 20),
          Center(
            child: Text(
              label,
              style: TextStyle(color: accent, fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: 1.2),
            ),
          ),
          if (prob != null) ...[
            const SizedBox(height: 16),
            const Text('SUCCESS PROBABILITY', style: TextStyle(color: AppColors.inkDim, fontSize: 11, letterSpacing: 1, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Row(
              children: [
                Text(percent(prob), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                const SizedBox(width: 12),
                Expanded(child: _Meter(value: prob, color: AppColors.go)),
              ],
            ),
          ],
          if (d != null && d.topFactors.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text('WHY', style: TextStyle(color: AppColors.inkDim, fontSize: 11, letterSpacing: 1, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text(
              'From the model (SHAP). Positive pushes NO-GO.',
              style: TextStyle(color: AppColors.inkDim, fontSize: 12),
            ),
            const SizedBox(height: 12),
            _ShapBars(factors: d.topFactors),
          ],
          if (d != null && d.weather.hasData) ...[
            const SizedBox(height: 16),
            Text(
              [
                d.weather.condition ?? d.weather.description,
                if (d.weather.tempC != null) '${d.weather.tempC!.round()}°C',
                if (d.weather.humidity != null) '${d.weather.humidity}% humidity',
              ].whereType<String>().join('  ·  '),
              style: const TextStyle(color: AppColors.inkMuted),
            ),
          ],
          if (d != null && d.reschedule.hasData) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.groundSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                [
                  if (d.reschedule.suggestedDate != null)
                    'Suggested: ${d.reschedule.suggestedDate} ${d.reschedule.suggestedWindow ?? ''}'.trim(),
                  if (d.reschedule.predictedSuccessProbability != null)
                    'Predicted success ${percent(d.reschedule.predictedSuccessProbability!)}',
                  d.reschedule.reason,
                ].whereType<String>().where((s) => s.isNotEmpty).join('\n'),
                style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Meter extends StatelessWidget {
  const _Meter({required this.value, required this.color});

  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0.0, 1.0);
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: LinearProgressIndicator(
        value: v,
        minHeight: 8,
        color: color,
        backgroundColor: AppColors.groundSoft,
      ),
    );
  }
}

class _ShapBars extends StatelessWidget {
  const _ShapBars({required this.factors});

  final List<ShapFactor> factors;

  @override
  Widget build(BuildContext context) {
    final maxAbs = factors.fold<double>(0, (m, f) => f.contribution.abs() > m ? f.contribution.abs() : m);
    final scale = maxAbs == 0 ? 1.0 : maxAbs;

    return Column(
      children: factors.map((f) {
        final frac = (f.contribution.abs() / scale).clamp(0.0, 1.0);
        final towardNogo = f.contribution >= 0;
        final color = towardNogo ? AppColors.nogo : AppColors.go;
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(f.label, style: const TextStyle(color: AppColors.inkMuted, fontSize: 13))),
                  Text(
                    '${towardNogo ? '+' : ''}${f.contribution.toStringAsFixed(1)}',
                    style: TextStyle(color: color, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              _Meter(value: frac, color: color),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class DecisionBadge extends StatelessWidget {
  const DecisionBadge({super.key, required this.decision, this.urgent = false});

  final String decision;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    if (decision.isEmpty) return const SizedBox.shrink();
    final go = decision == 'GO';
    final color = go ? AppColors.go : AppColors.nogo;
    final text = urgent && go ? 'URGENT' : decision;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.4),
      ),
    );
  }
}
