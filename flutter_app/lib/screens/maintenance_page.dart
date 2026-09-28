import 'package:flutter/material.dart';

import '../app_controller.dart';

class MaintenancePage extends StatefulWidget {
  final AppController controller;
  const MaintenancePage({super.key, required this.controller});

  @override
  State<MaintenancePage> createState() => _MaintenancePageState();
}

class _MaintenancePageState extends State<MaintenancePage> {
  bool busy = false;

  Future<void> refresh() async {
    setState(() => busy = true);
    try {
      await widget.controller.refreshSite();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(26),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.build_circle_outlined,
                      size: 74, color: Colors.orangeAccent),
                  const SizedBox(height: 14),
                  const Text('الموقع تحت الصيانة',
                      style: TextStyle(
                          fontSize: 28, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  Text(
                    widget.controller.site.maintenanceMessage.isEmpty
                        ? 'نعمل حاليًا على تحديث الموقع وسنعود قريبًا'
                        : widget.controller.site.maintenanceMessage,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: busy ? null : refresh,
                    icon: const Icon(Icons.refresh),
                    label: const Text('إعادة المحاولة'),
                  ),
                  TextButton(
                    onPressed: widget.controller.logout,
                    child: const Text('تسجيل الخروج'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
