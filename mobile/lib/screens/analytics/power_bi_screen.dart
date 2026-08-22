import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/period_toggle.dart';

class PowerBiScreen extends StatelessWidget {
  const PowerBiScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const steps = [
      ('Get your data', 'Open Analytics on the website and download the CSV exports. Those files are the data source.'),
      ('Sign in to Power BI', 'Go to app.powerbi.com and sign in with a work or college email.'),
      ('Build a report', 'Upload a CSV, drag fields onto the canvas, and save the report.'),
      ('Publish to web', 'In Power BI: File → Embed report → Publish to web. Copy the public link.'),
      ('Connect it here', 'Set VITE_POWERBI_EMBED_URL on the website deploy. This phone app shows the same setup until that link exists.'),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Power BI')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          const Text(
            'Not connected yet. Follow these steps to embed your Power BI report — same as the website.',
            style: TextStyle(color: AppColors.inkMuted, height: 1.4),
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < steps.length; i++) ...[
            SurfaceCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: AppColors.amber,
                    foregroundColor: AppColors.ground,
                    child: Text('${i + 1}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(steps[i].$1, style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(steps[i].$2, style: const TextStyle(color: AppColors.inkMuted, height: 1.4)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}
