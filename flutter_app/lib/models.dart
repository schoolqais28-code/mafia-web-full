class UserModel {
  final int id;
  final String username;
  final int wins;
  final int games;
  final bool isAdmin;
  final bool isBanned;
  final String theme;
  final bool reduceMotion;
  final bool soundsEnabled;
  final String? lastLoginAt;
  final String? lastIp;

  const UserModel({
    required this.id,
    required this.username,
    required this.wins,
    required this.games,
    required this.isAdmin,
    this.isBanned = false,
    this.theme = 'dark',
    this.reduceMotion = false,
    this.soundsEnabled = true,
    this.lastLoginAt,
    this.lastIp,
  });

  factory UserModel.fromJson(Map<String, dynamic> j) => UserModel(
        id: (j['id'] ?? 0) as int,
        username: (j['username'] ?? '').toString(),
        wins: (j['wins'] ?? 0) as int,
        games: (j['games'] ?? 0) as int,
        isAdmin: (j['isAdmin'] ?? j['is_admin'] ?? false) == true ||
            (j['is_admin'] == 1),
        isBanned: (j['isBanned'] ?? j['is_banned'] ?? false) == true ||
            (j['is_banned'] == 1),
        theme: (j['theme'] ?? 'dark').toString(),
        reduceMotion:
            (j['reduceMotion'] ?? j['reduce_motion'] ?? false) == true ||
                (j['reduce_motion'] == 1),
        soundsEnabled:
            (j['soundsEnabled'] ?? j['sounds_enabled'] ?? true) != false &&
                (j['sounds_enabled'] != 0),
        lastLoginAt: j['last_login_at']?.toString(),
        lastIp: j['last_ip']?.toString(),
      );
}

class SiteInfo {
  final String announcement;
  final int minPlayers;
  final bool maintenance;
  final String maintenanceMessage;
  final bool registrationOpen;

  const SiteInfo({
    this.announcement = '',
    this.minPlayers = 6,
    this.maintenance = false,
    this.maintenanceMessage = '',
    this.registrationOpen = true,
  });

  factory SiteInfo.fromJson(Map<String, dynamic> j) => SiteInfo(
        announcement: (j['announcement'] ?? '').toString(),
        minPlayers: (j['minPlayers'] ?? 6) as int,
        maintenance: j['maintenance'] == true,
        maintenanceMessage: (j['maintenanceMessage'] ?? '').toString(),
        registrationOpen: j['registrationOpen'] != false,
      );
}

class RoomPlayer {
  final String id;
  final int? userId;
  final String name;
  final bool alive;

  const RoomPlayer({
    required this.id,
    required this.name,
    this.userId,
    this.alive = true,
  });

  factory RoomPlayer.fromJson(Map<String, dynamic> j) => RoomPlayer(
        id: (j['id'] ?? '').toString(),
        userId: j['userId'] is int ? j['userId'] as int : null,
        name: (j['name'] ?? '').toString(),
        alive: j['alive'] != false,
      );
}

class RoomModel {
  final String code;
  final String host;
  final bool started;
  final int minPlayers;
  final List<RoomPlayer> players;

  const RoomModel({
    required this.code,
    required this.host,
    required this.started,
    required this.minPlayers,
    required this.players,
  });

  factory RoomModel.fromJson(Map<String, dynamic> j) => RoomModel(
        code: (j['code'] ?? '').toString(),
        host: (j['host'] ?? '').toString(),
        started: j['started'] == true,
        minPlayers: (j['minPlayers'] ?? 6) as int,
        players: ((j['players'] ?? []) as List)
            .map((e) => RoomPlayer.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

class ChatMessage {
  final String name;
  final String text;
  final int at;

  const ChatMessage({
    required this.name,
    required this.text,
    required this.at,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        name: (j['name'] ?? '').toString(),
        text: (j['text'] ?? '').toString(),
        at: (j['at'] ?? 0) as int,
      );
}
