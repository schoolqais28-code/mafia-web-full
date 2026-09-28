import 'package:flutter/foundation.dart';

import 'api_service.dart';
import 'models.dart';
import 'socket_service.dart';
import 'voice_service.dart';

class AppController extends ChangeNotifier {
  final ApiService api = ApiService();
  final SocketService socket = SocketService();
  late final VoiceService voice = VoiceService(socket);

  UserModel? user;
  SiteInfo site = const SiteInfo();
  RoomModel? room;
  String? role;
  final List<ChatMessage> chats = [];
  bool loading = true;
  String? message;

  Future<void> init() async {
    try {
      await api.init();
      site = await api.getSite();
      user = await api.getMe();
      if (user != null && api.sessionCookie != null) await _connectSocket();
    } catch (e) {
      message = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> _connectSocket() async {
    final cookie = api.sessionCookie;
    if (cookie == null) return;

    socket.onRoomUpdate = (r) async {
      room = r;
      await voice.ensurePeers(r.players.map((p) => p.id), socket.socketId);
      notifyListeners();
    };
    socket.onRole = (r) {
      role = r;
      notifyListeners();
    };
    socket.onChat = (m) {
      chats.add(m);
      notifyListeners();
    };
    socket.onVoiceSignal = voice.handleSignal;
    socket.onAnnouncement = (a) {
      site = SiteInfo(
        announcement: a,
        minPlayers: site.minPlayers,
        maintenance: site.maintenance,
        maintenanceMessage: site.maintenanceMessage,
        registrationOpen: site.registrationOpen,
      );
      notifyListeners();
    };
    socket.onMaintenance = (enabled, msg) {
      site = SiteInfo(
        announcement: site.announcement,
        minPlayers: site.minPlayers,
        maintenance: enabled,
        maintenanceMessage: msg,
        registrationOpen: site.registrationOpen,
      );
      if (enabled && user?.isAdmin != true) {
        room = null;
        role = null;
        chats.clear();
        voice.stop();
      }
      notifyListeners();
    };
    socket.onRoomClosed = _roomEnded;
    socket.onRoomKicked = _roomEnded;
    socket.onAccountDisabled = (m) async {
      message = m;
      await voice.stop();
      socket.disconnect();
      user = null;
      room = null;
      role = null;
      chats.clear();
      notifyListeners();
    };

    await socket.connect(cookie);
  }

  void _roomEnded(String m) {
    message = m;
    room = null;
    role = null;
    chats.clear();
    voice.stop();
    notifyListeners();
  }

  Future<void> login(String username, String password) async {
    user = await api.login(username, password);
    site = await api.getSite();
    await _connectSocket();
    message = null;
    notifyListeners();
  }

  Future<void> register(String username, String password) async {
    user = await api.register(username, password);
    site = await api.getSite();
    await _connectSocket();
    message = null;
    notifyListeners();
  }

  Future<void> logout() async {
    await voice.stop();
    socket.disconnect();
    await api.logout();
    user = null;
    room = null;
    role = null;
    chats.clear();
    notifyListeners();
  }

  Future<void> refreshSite() async {
    site = await api.getSite();
    notifyListeners();
  }

  Future<void> createRoom() async {
    final r = await socket.createRoom();
    if (r['ok'] != true) {
      throw ApiException((r['error'] ?? 'تعذر إنشاء الغرفة').toString());
    }
  }

  Future<void> joinRoom(String code) async {
    final r = await socket.joinRoom(code);
    if (r['ok'] != true) {
      throw ApiException((r['error'] ?? 'تعذر دخول الغرفة').toString());
    }
  }

  Future<void> leaveRoom() async {
    try {
      await socket.leaveRoom();
    } catch (_) {}
    await voice.stop();
    room = null;
    role = null;
    chats.clear();
    notifyListeners();
  }

  Future<void> startGame() async {
    final r = await socket.startGame();
    if (r['ok'] != true) {
      throw ApiException((r['error'] ?? 'تعذر بدء اللعبة').toString());
    }
  }

  void sendChat(String text) {
    final v = text.trim();
    if (v.isNotEmpty) socket.sendChat(v);
  }

  Future<void> enableVoice() async {
    final r = room;
    if (r == null) return;
    await voice.enable(r.players.map((p) => p.id), socket.socketId);
    notifyListeners();
  }

  void toggleMute() {
    voice.toggleMute();
    notifyListeners();
  }

  Future<void> setUsername(String username) async {
    user = await api.updateUsername(username);
    notifyListeners();
  }

  Future<void> setPassword(String oldPassword, String newPassword) =>
      api.updatePassword(oldPassword, newPassword);

  Future<void> setPreferences({
    required String theme,
    required bool reduceMotion,
    required bool soundsEnabled,
  }) async {
    user = await api.updatePreferences(
      theme: theme,
      reduceMotion: reduceMotion,
      soundsEnabled: soundsEnabled,
    );
    notifyListeners();
  }
}
