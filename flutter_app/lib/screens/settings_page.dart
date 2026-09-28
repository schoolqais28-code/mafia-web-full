import 'package:flutter/material.dart';

import '../app_controller.dart';

class SettingsPage extends StatefulWidget {
  final AppController controller;
  const SettingsPage({super.key, required this.controller});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final TextEditingController username;
  final oldPass = TextEditingController();
  final newPass = TextEditingController();
  late String theme;
  late bool reduceMotion;
  late bool sounds;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    final u = widget.controller.user!;
    username = TextEditingController(text: u.username);
    theme = u.theme;
    reduceMotion = u.reduceMotion;
    sounds = u.soundsEnabled;
  }

  Future<void> run(Future<void> Function() fn, String success) async {
    setState(() => busy = true);
    try {
      await fn();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(success)));
      }
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
    final u = widget.controller.user!;
    return Scaffold(
      appBar: AppBar(title: const Text('الإعدادات')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('الألعاب ${u.games} • الفوز ${u.wins}'),
                  const SizedBox(height: 12),
                  TextField(
                    controller: username,
                    decoration:
                        const InputDecoration(labelText: 'اسم المستخدم'),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () => run(
                              () => widget.controller
                                  .setUsername(username.text),
                              'تم حفظ الاسم',
                            ),
                    child: const Text('حفظ الاسم'),
                  ),
                ],
              ),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: theme,
                    decoration: const InputDecoration(labelText: 'الثيم'),
                    items: const [
                      DropdownMenuItem(value: 'dark', child: Text('داكن')),
                      DropdownMenuItem(
                          value: 'midnight',
                          child: Text('منتصف الليل')),
                      DropdownMenuItem(
                          value: 'red', child: Text('أحمر مافيا')),
                    ],
                    onChanged: (v) =>
                        setState(() => theme = v ?? 'dark'),
                  ),
                  SwitchListTile(
                    value: reduceMotion,
                    onChanged: (v) => setState(() => reduceMotion = v),
                    title: const Text('تقليل الحركة والمؤثرات'),
                  ),
                  SwitchListTile(
                    value: sounds,
                    onChanged: (v) => setState(() => sounds = v),
                    title: const Text('أصوات التنبيهات'),
                  ),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () => run(
                              () => widget.controller.setPreferences(
                                theme: theme,
                                reduceMotion: reduceMotion,
                                soundsEnabled: sounds,
                              ),
                              'تم حفظ التفضيلات',
                            ),
                    child: const Text('حفظ التفضيلات'),
                  ),
                ],
              ),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  TextField(
                    controller: oldPass,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: 'كلمة المرور الحالية'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: newPass,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: 'كلمة المرور الجديدة'),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () => run(
                              () => widget.controller
                                  .setPassword(oldPass.text, newPass.text),
                              'تم تغيير كلمة المرور',
                            ),
                    child: const Text('تغيير كلمة المرور'),
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
