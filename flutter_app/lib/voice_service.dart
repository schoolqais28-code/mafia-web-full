import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import 'socket_service.dart';

class VoiceService {
  final SocketService socket;
  MediaStream? _localStream;
  final Map<String, RTCPeerConnection> _peers = {};
  final Map<String, RTCVideoRenderer> _renderers = {};

  bool enabled = false;
  bool muted = false;

  VoiceService(this.socket);

  Future<void> enable(Iterable<String> peerIds, String? myId) async {
    final permission = await Permission.microphone.request();
    if (!permission.isGranted) {
      throw Exception('اسمح للتطبيق باستخدام الميكروفون');
    }

    _localStream ??= await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': false,
    });

    enabled = true;
    muted = false;
    await ensurePeers(peerIds, myId);
  }

  Future<void> ensurePeers(Iterable<String> peerIds, String? myId) async {
    if (!enabled || _localStream == null) return;
    final wanted = peerIds.where((id) => id != myId).toSet();

    for (final old in _peers.keys.toList()) {
      if (!wanted.contains(old)) await _closePeer(old);
    }
    for (final id in wanted) {
      if (!_peers.containsKey(id)) await _makePeer(id, offerer: true);
    }
  }

  Future<RTCPeerConnection> _makePeer(
    String id, {
    bool offerer = false,
  }) async {
    final existing = _peers[id];
    if (existing != null) return existing;

    final pc = await createPeerConnection({
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'}
      ]
    });
    _peers[id] = pc;

    for (final track in _localStream!.getTracks()) {
      await pc.addTrack(track, _localStream!);
    }

    pc.onIceCandidate = (candidate) {
      final value = candidate.candidate;
      if (value == null) return;
      socket.sendVoiceSignal(id, {
        'candidate': {
          'candidate': value,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        }
      });
    };

    pc.onTrack = (event) async {
      if (event.streams.isEmpty) return;
      final old = _renderers[id];
      if (old != null) {
        old.srcObject = event.streams.first;
        return;
      }
      final renderer = RTCVideoRenderer();
      await renderer.initialize();
      renderer.srcObject = event.streams.first;
      _renderers[id] = renderer;
    };

    if (offerer) {
      final offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.sendVoiceSignal(id, {
        'sdp': {'sdp': offer.sdp, 'type': offer.type}
      });
    }
    return pc;
  }

  Future<void> handleSignal(Map<String, dynamic> payload) async {
    if (!enabled || _localStream == null) return;
    final from = (payload['from'] ?? '').toString();
    if (from.isEmpty) return;
    final data = Map<String, dynamic>.from(payload['data'] as Map? ?? {});
    final pc = await _makePeer(from);

    final sdpRaw = data['sdp'];
    if (sdpRaw is Map) {
      final sdp = Map<String, dynamic>.from(sdpRaw);
      await pc.setRemoteDescription(
        RTCSessionDescription(
          sdp['sdp']?.toString(),
          sdp['type']?.toString(),
        ),
      );
      if (sdp['type'] == 'offer') {
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.sendVoiceSignal(from, {
          'sdp': {'sdp': answer.sdp, 'type': answer.type}
        });
      }
    }

    final candidateRaw = data['candidate'];
    if (candidateRaw is Map) {
      final candidate = Map<String, dynamic>.from(candidateRaw);
      try {
        await pc.addCandidate(
          RTCIceCandidate(
            candidate['candidate']?.toString(),
            candidate['sdpMid']?.toString(),
            candidate['sdpMLineIndex'] is int
                ? candidate['sdpMLineIndex'] as int
                : null,
          ),
        );
      } catch (_) {}
    }
  }

  void toggleMute() {
    final stream = _localStream;
    if (stream == null) return;
    muted = !muted;
    for (final track in stream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  Future<void> _closePeer(String id) async {
    final pc = _peers.remove(id);
    if (pc != null) await pc.close();
    final renderer = _renderers.remove(id);
    if (renderer != null) {
      renderer.srcObject = null;
      await renderer.dispose();
    }
  }

  Future<void> stop() async {
    for (final id in _peers.keys.toList()) {
      await _closePeer(id);
    }
    final stream = _localStream;
    if (stream != null) {
      for (final track in stream.getTracks()) {
        track.stop();
      }
      await stream.dispose();
    }
    _localStream = null;
    enabled = false;
    muted = false;
  }
}
