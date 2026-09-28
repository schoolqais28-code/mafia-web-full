import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

class ApiService {
  static const baseUrl =
      'https://mafia-web-admin-production.up.railway.app';
  static const _cookieKey = 'mafia_session_cookie';

  String? sessionCookie;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    sessionCookie = prefs.getString(_cookieKey);
  }

  Future<void> _saveCookieFrom(http.Response response) async {
    final raw = response.headers['set-cookie'];
    if (raw == null || !raw.contains('connect.sid=')) return;
    final start = raw.indexOf('connect.sid=');
    final cookie = raw.substring(start).split(';').first.trim();
    final prefs = await SharedPreferences.getInstance();
    if (cookie == 'connect.sid=') {
      sessionCookie = null;
      await prefs.remove(_cookieKey);
    } else {
      sessionCookie = cookie;
      await prefs.setString(_cookieKey, cookie);
    }
  }

  Map<String, String> _headers() => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (sessionCookie != null) 'Cookie': sessionCookie!,
      };

  Future<http.Response> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    late http.Response r;
    if (method == 'GET') {
      r = await http.get(uri, headers: _headers());
    } else if (method == 'POST') {
      r = await http.post(uri,
          headers: _headers(), body: jsonEncode(body ?? const {}));
    } else if (method == 'DELETE') {
      r = await http.delete(uri, headers: _headers());
    } else {
      throw ApiException('طريقة طلب غير مدعومة');
    }
    await _saveCookieFrom(r);
    return r;
  }

  Map<String, dynamic> _decode(http.Response r) {
    dynamic data;
    try {
      data = jsonDecode(utf8.decode(r.bodyBytes));
    } catch (_) {
      data = <String, dynamic>{};
    }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      final msg = data is Map ? data['error']?.toString() : null;
      throw ApiException(msg ?? 'حدث خطأ في الاتصال بالسيرفر');
    }
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return <String, dynamic>{};
  }

  Future<SiteInfo> getSite() async =>
      SiteInfo.fromJson(_decode(await _request('GET', '/api/site')));

  Future<UserModel?> getMe() async {
    final j = _decode(await _request('GET', '/api/me'));
    final raw = j['user'];
    if (raw == null) return null;
    return UserModel.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<UserModel> login(String username, String password) async {
    final j = _decode(await _request('POST', '/api/login',
        body: {'username': username, 'password': password}));
    return UserModel.fromJson(Map<String, dynamic>.from(j['user'] as Map));
  }

  Future<UserModel> register(String username, String password) async {
    final j = _decode(await _request('POST', '/api/register',
        body: {'username': username, 'password': password}));
    return UserModel.fromJson(Map<String, dynamic>.from(j['user'] as Map));
  }

  Future<void> logout() async {
    try {
      await _request('POST', '/api/logout');
    } finally {
      sessionCookie = null;
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_cookieKey);
    }
  }

  Future<UserModel> updateUsername(String username) async {
    final j = _decode(await _request('POST', '/api/settings/profile',
        body: {'username': username}));
    return UserModel.fromJson(Map<String, dynamic>.from(j['user'] as Map));
  }

  Future<void> updatePassword(String oldPassword, String newPassword) async {
    _decode(await _request('POST', '/api/settings/password', body: {
      'currentPassword': oldPassword,
      'newPassword': newPassword,
    }));
  }

  Future<UserModel> updatePreferences({
    required String theme,
    required bool reduceMotion,
    required bool soundsEnabled,
  }) async {
    final j = _decode(await _request('POST', '/api/settings/preferences', body: {
      'theme': theme,
      'reduceMotion': reduceMotion,
      'soundsEnabled': soundsEnabled,
    }));
    return UserModel.fromJson(Map<String, dynamic>.from(j['user'] as Map));
  }

  Future<Map<String, dynamic>> adminOverview() async =>
      _decode(await _request('GET', '/api/admin/overview'));

  Future<List<UserModel>> adminUsers([String query = '']) async {
    final q = query.trim();
    final path = q.isEmpty
        ? '/api/admin/users'
        : '/api/admin/users?q=${Uri.encodeComponent(q)}';
    final j = _decode(await _request('GET', path));
    return ((j['users'] ?? []) as List)
        .map((e) => UserModel.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<Map<String, dynamic>>> adminRooms() async {
    final j = _decode(await _request('GET', '/api/admin/rooms'));
    return ((j['rooms'] ?? []) as List)
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<List<Map<String, dynamic>>> adminAudit() async {
    final j = _decode(await _request('GET', '/api/admin/audit'));
    return ((j['logs'] ?? []) as List)
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<void> adminUserAction(int id, String action) async {
    _decode(await _request('POST', '/api/admin/users/$id/action',
        body: {'action': action}));
  }

  Future<void> adminDeleteUser(int id) async {
    _decode(await _request('DELETE', '/api/admin/users/$id'));
  }

  Future<void> adminCloseRoom(String code) async {
    _decode(await _request('POST', '/api/admin/rooms/$code/close'));
  }

  Future<void> adminKickPlayer(String code, String socketId) async {
    _decode(await _request('POST', '/api/admin/rooms/$code/kick',
        body: {'socketId': socketId}));
  }

  Future<int> adminCloseAllRooms() async {
    final j = _decode(await _request('POST', '/api/admin/rooms/close-all'));
    return (j['closed'] ?? 0) as int;
  }

  Future<void> adminAnnouncement(String message) async {
    _decode(await _request('POST', '/api/admin/announcement',
        body: {'message': message}));
  }

  Future<void> adminMaintenance(bool enabled, String message) async {
    _decode(await _request('POST', '/api/admin/maintenance',
        body: {'enabled': enabled, 'message': message}));
  }

  Future<void> adminRegistration(bool open) async {
    _decode(await _request('POST', '/api/admin/registration',
        body: {'open': open}));
  }

  Future<void> adminClearAudit() async {
    _decode(await _request('DELETE', '/api/admin/audit'));
  }

  Future<String> adminExportUsersJson() async {
    final r = await _request('GET', '/api/admin/export/users');
    if (r.statusCode < 200 || r.statusCode >= 300) _decode(r);
    return utf8.decode(r.bodyBytes);
  }
}
