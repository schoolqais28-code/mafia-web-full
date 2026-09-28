import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const String siteUrl =
    'https://mafia-web-admin-production.up.railway.app/';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Permission.microphone.request();
  runApp(const MafiaApp());
}

class MafiaApp extends StatelessWidget {
  const MafiaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'MAFIA',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF08070B),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFD11E2F),
          brightness: Brightness.dark,
        ),
      ),
      home: const MafiaWebApp(),
    );
  }
}

class MafiaWebApp extends StatefulWidget {
  const MafiaWebApp({super.key});

  @override
  State<MafiaWebApp> createState() => _MafiaWebAppState();
}

class _MafiaWebAppState extends State<MafiaWebApp> {
  late final WebViewController _controller;
  double _progress = 0;
  bool _pageError = false;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF08070B))
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (mounted) {
              setState(() => _progress = progress / 100);
            }
          },
          onPageStarted: (_) {
            if (mounted) {
              setState(() => _pageError = false);
            }
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true && mounted) {
              setState(() => _pageError = true);
            }
          },
        ),
      );

    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
      platform.setOnPlatformPermissionRequest((request) async {
        final microphone = await Permission.microphone.request();
        if (microphone.isGranted) {
          await request.grant();
        } else {
          await request.deny();
        }
      });
    }

    _controller.loadRequest(Uri.parse(siteUrl));
  }

  Future<bool> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final shouldExit = await _handleBack();
        if (shouldExit && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_progress < 1)
                LinearProgressIndicator(
                  value: _progress,
                  minHeight: 2,
                  color: const Color(0xFFD11E2F),
                  backgroundColor: const Color(0xFF100E13),
                ),
              if (_pageError)
                Positioned.fill(
                  child: ColoredBox(
                    color: const Color(0xFF08070B),
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.wifi_off_rounded,
                              size: 58,
                              color: Color(0xFFD11E2F),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'تعذر الاتصال بالموقع',
                              textDirection: TextDirection.rtl,
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'تأكد من اتصال الإنترنت ثم حاول مرة أخرى',
                              textDirection: TextDirection.rtl,
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white70),
                            ),
                            const SizedBox(height: 18),
                            FilledButton.icon(
                              onPressed: () {
                                setState(() => _pageError = false);
                                _controller.loadRequest(Uri.parse(siteUrl));
                              },
                              icon: const Icon(Icons.refresh),
                              label: const Text('إعادة المحاولة'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
