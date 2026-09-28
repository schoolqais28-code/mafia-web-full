import 'package:flutter/material.dart';

import '../app_controller.dart';
import 'admin_page.dart';
import 'settings_page.dart';

class HomePage extends StatefulWidget {
  final AppController controller;
  const HomePage({super.key, required this.controller});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final roomCode = TextEditingController();
  bool busy = false;

  Future<void> run(Future<void> Function() fn) async {
    setState(() => busy = true);
    try {
      await fn();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final u = c.user!;
    return Scaffold(
      appBar: AppBar(
        title: const Text('MAFIA'),
        actions: [
          IconButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => SettingsPage(controller: c)),
            ),
            icon: const Icon(Icons.settings_rounded),
          ),
          if (u.isAdmin)
            IconButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => AdminPage(controller: c)),
              ),
              icon: const Icon(Icons.admin_panel_settings_rounded),
            ),
          IconButton(onPressed: c.logout, icon: const Icon(Icons.logout_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: c.refreshSite,
        child: ListView(
          padding: const EdgeInsets.all(18),
          children: [
            if (c.site.announcement.isNotEmpty)
              Card(
                child: ListTile(
                  leading:
                      const Icon(Icons.campaign, color: Colors.orangeAccent),
                  title: const Text('إعلان الإدارة'),
                  subtitle: Text(c.site.announcement),
                ),
              ),
            const SizedBox(height: 8),
            Text('أهلًا ${u.username}',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _Stat('الألعاب', '${u.games}')),
                const SizedBox(width: 10),
                Expanded(child: _Stat('الفوز', '${u.wins}')),
              ],
            ),
            const SizedBox(height: 18),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('ابدأ اللعب',
                        style: TextStyle(
                            fontSize: 21, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Text(
                        'أقل عدد لبدء الجولة ${c.site.minPlayers} لاعبين والحد الأعلى غير محدود',
                        style: const TextStyle(color: Colors.white60)),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: busy ? null : () => run(c.createRoom),
                      icon: const Icon(Icons.add_circle_outline_rounded),
                      label: const Text('إنشاء غرفة جديدة'),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: roomCode,
                      textCapitalization: TextCapitalization.characters,
                      decoration:
                          const InputDecoration(labelText: 'رمز الغرفة'),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: busy
                          ? null
                          : () => run(() => c.joinRoom(roomCode.text)),
                      icon: const Icon(Icons.login_rounded),
                      label: const Text('دخول الغرفة'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String title;
  final String value;
  const _Stat(this.title, this.value);

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(value,
                style:
                    const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            Text(title, style: const TextStyle(color: Colors.white60)),
          ],
        ),
      ),
    );
  }
}
