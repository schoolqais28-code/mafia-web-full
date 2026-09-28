import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';

class RoomPage extends StatefulWidget {
  final AppController controller;
  const RoomPage({super.key, required this.controller});

  @override
  State<RoomPage> createState() => _RoomPageState();
}

class _RoomPageState extends State<RoomPage> {
  final chat = TextEditingController();
  final scroll = ScrollController();
  bool busy = false;

  String roleText(String? role) {
    switch (role) {
      case 'mafia':
        return '🔪 أنت المافيا — اخفِ هويتك';
      case 'doctor':
        return '🩺 أنت الطبيب — احمِ المدينة';
      case 'citizen':
        return '🕵️ أنت مواطن — اكتشف المافيا';
      default:
        return '';
    }
  }

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
    final room = c.room!;
    final isHost = room.host == c.socket.socketId;
    final role = roleText(c.role);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scroll.hasClients) {
        scroll.jumpTo(scroll.position.maxScrollExtent);
      }
    });

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: busy ? null : () => run(c.leaveRoom),
          icon: const Icon(Icons.arrow_back),
        ),
        title: InkWell(
          onTap: () {
            Clipboard.setData(ClipboardData(text: room.code));
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('تم نسخ رمز الغرفة')),
            );
          },
          child: Text('الغرفة ${room.code}'),
        ),
        actions: [
          IconButton(
            onPressed: () =>
                c.voice.enabled ? c.toggleMute() : run(c.enableVoice),
            icon: Icon(
              !c.voice.enabled
                  ? Icons.mic_none_rounded
                  : c.voice.muted
                      ? Icons.mic_off_rounded
                      : Icons.mic_rounded,
              color: c.voice.enabled && !c.voice.muted
                  ? Colors.greenAccent
                  : null,
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (role.isNotEmpty)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.all(12),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF3B0710),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(role,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.bold)),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                      '${room.players.length} لاعب • ${room.started ? 'الجولة بدأت' : 'بانتظار البدء'}'),
                ),
                if (isHost && !room.started)
                  FilledButton(
                    onPressed: busy ? null : () => run(c.startGame),
                    child: Text(room.players.length < room.minPlayers
                        ? 'يلزم ${room.minPlayers}'
                        : 'ابدأ الجولة'),
                  ),
              ],
            ),
          ),
          SizedBox(
            height: 78,
            child: ListView.separated(
              padding: const EdgeInsets.all(10),
              scrollDirection: Axis.horizontal,
              itemCount: room.players.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final p = room.players[i];
                return Container(
                  width: 120,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF100E13),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                          child: Text(p.name.isEmpty
                              ? '?'
                              : p.name[0].toUpperCase())),
                      const SizedBox(width: 8),
                      Expanded(
                          child: Text(p.name,
                              overflow: TextOverflow.ellipsis)),
                    ],
                  ),
                );
              },
            ),
          ),
          const Divider(),
          Expanded(
            child: ListView.builder(
              controller: scroll,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: c.chats.length,
              itemBuilder: (_, i) {
                final m = c.chats[i];
                final mine = m.name == c.user?.username;
                return Align(
                  alignment:
                      mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.all(11),
                    constraints: const BoxConstraints(maxWidth: 320),
                    decoration: BoxDecoration(
                      color: mine
                          ? Theme.of(context)
                              .colorScheme
                              .primary
                              .withValues(alpha: .23)
                          : const Color(0xFF16131A),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(m.name,
                            style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.white60)),
                        Text(m.text),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: chat,
                      onSubmitted: (_) {
                        c.sendChat(chat.text);
                        chat.clear();
                      },
                      decoration:
                          const InputDecoration(hintText: 'اكتب رسالة'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: () {
                      c.sendChat(chat.text);
                      chat.clear();
                    },
                    icon: const Icon(Icons.send_rounded),
                  )
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
