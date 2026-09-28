import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../models.dart';

class AdminPage extends StatefulWidget {
  final AppController controller;
  const AdminPage({super.key, required this.controller});

  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage>
    with SingleTickerProviderStateMixin {
  late final TabController tabs = TabController(length: 4, vsync: this);
  Map<String, dynamic> overview = {};
  List<UserModel> users = [];
  List<Map<String, dynamic>> rooms = [];
  List<Map<String, dynamic>> logs = [];
  final search = TextEditingController();
  final announcement = TextEditingController();
  final maintenanceMessage = TextEditingController();
  bool loading = true;

  @override
  void initState() {
    super.initState();
    refreshAll();
  }

  Future<void> refreshAll() async {
    setState(() => loading = true);
    try {
      final results = await Future.wait([
        widget.controller.api.adminOverview(),
        widget.controller.api.adminUsers(search.text),
        widget.controller.api.adminRooms(),
        widget.controller.api.adminAudit(),
      ]);
      overview = results[0] as Map<String, dynamic>;
      users = results[1] as List<UserModel>;
      rooms = results[2] as List<Map<String, dynamic>>;
      logs = results[3] as List<Map<String, dynamic>>;
      announcement.text = (overview['announcement'] ?? '').toString();
      maintenanceMessage.text =
          (overview['maintenanceMessage'] ?? '').toString();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> act(Future<void> Function() fn) async {
    try {
      await fn();
      await refreshAll();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('لوحة الإدارة'),
        bottom: TabBar(
          controller: tabs,
          isScrollable: true,
          tabs: const [
            Tab(text: 'الرئيسية'),
            Tab(text: 'الحسابات'),
            Tab(text: 'الغرف'),
            Tab(text: 'السجل'),
          ],
        ),
        actions: [
          IconButton(onPressed: refreshAll, icon: const Icon(Icons.refresh))
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: tabs,
              children: [
                _overviewTab(),
                _usersTab(),
                _roomsTab(),
                _auditTab(),
              ],
            ),
    );
  }

  Widget _overviewTab() {
    final maintenance = overview['maintenanceMode'] == true;
    final registration = overview['registrationOpen'] != false;
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _metric('الحسابات', overview['totalUsers']),
            _metric('الغرف', overview['activeRooms']),
            _metric('اللاعبون الآن', overview['activePlayers']),
            _metric('المتصلون', overview['connectedSockets']),
            _metric('المحظورون', overview['bannedUsers']),
            _metric('المشرفون', overview['admins']),
          ],
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                SwitchListTile(
                  value: maintenance,
                  title: Text(maintenance ? 'الموقع متوقف' : 'الموقع يعمل'),
                  onChanged: (v) => act(() => widget.controller.api
                      .adminMaintenance(v, maintenanceMessage.text)),
                ),
                TextField(
                  controller: maintenanceMessage,
                  decoration:
                      const InputDecoration(labelText: 'رسالة الصيانة'),
                ),
                OutlinedButton(
                  onPressed: () => act(() => widget.controller.api
                      .adminMaintenance(maintenance, maintenanceMessage.text)),
                  child: const Text('حفظ رسالة الصيانة'),
                ),
                SwitchListTile(
                  value: registration,
                  title: const Text('السماح بإنشاء حسابات'),
                  onChanged: (v) =>
                      act(() => widget.controller.api.adminRegistration(v)),
                ),
                TextField(
                  controller: announcement,
                  decoration:
                      const InputDecoration(labelText: 'الإعلان العام'),
                ),
                FilledButton(
                  onPressed: () => act(() => widget.controller.api
                      .adminAnnouncement(announcement.text)),
                  child: const Text('حفظ الإعلان'),
                ),
              ],
            ),
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonal(
                  onPressed: () => act(() async {
                    await widget.controller.api.adminCloseAllRooms();
                  }),
                  child: const Text('إغلاق جميع الغرف'),
                ),
                FilledButton.tonal(
                  onPressed: () async {
                    final value =
                        await widget.controller.api.adminExportUsersJson();
                    await Clipboard.setData(ClipboardData(text: value));
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('تم نسخ بيانات الحسابات JSON')),
                      );
                    }
                  },
                  child: const Text('نسخ الحسابات JSON'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _metric(String label, dynamic value) {
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Text('${value ?? 0}',
                  style: const TextStyle(
                      fontSize: 27, fontWeight: FontWeight.bold)),
              Text(label),
            ],
          ),
        ),
      ),
    );
  }

  Widget _usersTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: search,
            onSubmitted: (_) => refreshAll(),
            decoration: InputDecoration(
              labelText: 'بحث باسم المستخدم',
              suffixIcon: IconButton(
                  onPressed: refreshAll, icon: const Icon(Icons.search)),
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: users.length,
            itemBuilder: (_, i) {
              final u = users[i];
              return Card(
                child: ExpansionTile(
                  title: Text(u.username),
                  subtitle: Text(
                      '#${u.id} • ${u.isAdmin ? 'مشرف' : 'لاعب'} • ${u.isBanned ? 'محظور' : 'نشط'}'),
                  children: [
                    Wrap(
                      spacing: 6,
                      children: [
                        TextButton(
                          onPressed: () => act(() => widget.controller.api
                              .adminUserAction(
                                  u.id, u.isBanned ? 'unban' : 'ban')),
                          child:
                              Text(u.isBanned ? 'فك الحظر' : 'حظر الحساب'),
                        ),
                        TextButton(
                          onPressed: () => act(() => widget.controller.api
                              .adminUserAction(
                                  u.id,
                                  u.isAdmin
                                      ? 'revoke_admin'
                                      : 'grant_admin')),
                          child: Text(
                              u.isAdmin ? 'إلغاء الإدارة' : 'جعله مشرف'),
                        ),
                        TextButton(
                          onPressed: () => act(() => widget.controller.api
                              .adminUserAction(u.id, 'reset_stats')),
                          child: const Text('تصفير'),
                        ),
                        TextButton(
                          onPressed: () => act(
                              () => widget.controller.api.adminDeleteUser(u.id)),
                          child: const Text('حذف'),
                        ),
                      ],
                    )
                  ],
                ),
              );
            },
          ),
        )
      ],
    );
  }

  Widget _roomsTab() {
    if (rooms.isEmpty) return const Center(child: Text('لا توجد غرف نشطة'));
    return ListView.builder(
      itemCount: rooms.length,
      itemBuilder: (_, i) {
        final r = rooms[i];
        final code = (r['code'] ?? '').toString();
        final players = (r['players'] ?? []) as List;
        return Card(
          child: ExpansionTile(
            title: Text('الغرفة $code'),
            subtitle: Text('${players.length} لاعب'),
            trailing: IconButton(
              onPressed: () =>
                  act(() => widget.controller.api.adminCloseRoom(code)),
              icon: const Icon(Icons.close, color: Colors.redAccent),
            ),
            children: players.map((p) {
              final m = Map<String, dynamic>.from(p as Map);
              return ListTile(
                title: Text((m['name'] ?? '').toString()),
                trailing: TextButton(
                  onPressed: () => act(() => widget.controller.api
                      .adminKickPlayer(code, (m['id'] ?? '').toString())),
                  child: const Text('إخراج'),
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }

  Widget _auditTab() {
    return Column(
      children: [
        OutlinedButton(
          onPressed: () => act(widget.controller.api.adminClearAudit),
          child: const Text('مسح سجل الإدارة'),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: logs.length,
            itemBuilder: (_, i) {
              final l = logs[i];
              return Card(
                child: ListTile(
                  title: Text((l['action'] ?? '').toString()),
                  subtitle: Text(
                      '${l['details'] ?? ''}\n${l['admin_username'] ?? 'system'} • ${l['created_at'] ?? ''}'),
                ),
              );
            },
          ),
        )
      ],
    );
  }
}
