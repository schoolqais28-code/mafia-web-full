import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_service.dart';
import 'models.dart';

class SocketService {
  io.Socket? _socket;

  void Function(RoomModel room)? onRoomUpdate;
  void Function(String role)? onRole;
  void Function(ChatMessage message)? onChat;
  void Function(Map<String, dynamic> signal)? onVoiceSignal;
  void Function(String message)? onRoomClosed;
  void Function(String message)? onRoomKicked;
  void Function(String message)? onAccountDisabled;
  void Function(String announcement)? onAnnouncement;
  void Function(bool enabled, String message)? onMaintenance;

  String? get socketId => _socket?.id;

  Future<void> connect(String cookie) async {
    disconnect();
    _socket = io.io(
      ApiService.baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setExtraHeaders({'Cookie': cookie})
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );

    _socket!
      ..on('room:update', (data) => onRoomUpdate?.call(
          RoomModel.fromJson(Map<String, dynamic>.from(data as Map))))
      ..on('role', (data) => onRole?.call(data.toString()))
      ..on('chat', (data) => onChat?.call(
          ChatMessage.fromJson(Map<String, dynamic>.from(data as Map))))
      ..on('voice:signal', (data) =>
          onVoiceSignal?.call(Map<String, dynamic>.from(data as Map)))
      ..on('room:closed',
          (data) => onRoomClosed?.call(data?.toString() ?? 'تم إغلاق الغرفة'))
      ..on('room:kicked',
          (data) => onRoomKicked?.call(data?.toString() ?? 'تم إخراجك من الغرفة'))
      ..on('account:disabled', (data) =>
          onAccountDisabled?.call(data?.toString() ?? 'تم تعطيل الحساب'))
      ..on('site:announcement',
          (data) => onAnnouncement?.call(data?.toString() ?? ''))
      ..on('site:maintenance', (data) {
        final m = Map<String, dynamic>.from(data as Map);
        onMaintenance?.call(
          m['enabled'] == true,
          (m['message'] ?? '').toString(),
        );
      });

    _socket!.connect();

    final c = Completer<void>();
    _socket!.once('connect', (_) {
      if (!c.isCompleted) c.complete();
    });
    _socket!.once('connect_error', (e) {
      if (!c.isCompleted) {
        c.completeError(Exception(e?.toString() ?? 'تعذر الاتصال بالسيرفر'));
      }
    });
    await c.future.timeout(const Duration(seconds: 12));
  }

  Future<Map<String, dynamic>> _ack(String event, dynamic data) {
    final c = Completer<Map<String, dynamic>>();
    _socket?.emitWithAck(event, data, ack: (dynamic response) {
      if (c.isCompleted) return;
      if (response is Map) {
        c.complete(Map<String, dynamic>.from(response));
      } else {
        c.complete({'ok': false, 'error': 'رد غير صالح من السيرفر'});
      }
    });
    return c.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () => {'ok': false, 'error': 'لم يرد السيرفر'},
    );
  }

  Future<Map<String, dynamic>> createRoom() => _ack('room:create', {});
  Future<Map<String, dynamic>> joinRoom(String code) =>
      _ack('room:join', code.trim().toUpperCase());
  Future<Map<String, dynamic>> startGame() => _ack('game:start', {});
  Future<Map<String, dynamic>> leaveRoom() => _ack('room:leave', {});

  void sendChat(String text) => _socket?.emit('chat', text);

  void sendVoiceSignal(String to, Map<String, dynamic> data) {
    _socket?.emit('voice:signal', {'to': to, 'data': data});
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
