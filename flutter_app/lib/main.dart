import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';

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
  InAppWebViewController? _webViewController;
  PullToRefreshController? _pullToRefreshController;
  double _progress = 0;
  bool _pageError = false;

  @override
  void initState() {
    super.initState();

    _pullToRefreshController = PullToRefreshController(
      settings: PullToRefreshSettings(
        color: const Color(0xFFD11E2F),
        backgroundColor: const Color(0xFF100E13),
      ),
      onRefresh: () async {
        await _webViewController?.reload();
      },
    );
  }

  Future<bool> _handleBack() async {
    final controller = _webViewController;
    if (controller != null && await controller.canGoBack()) {
      await controller.goBack();
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
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(siteUrl)),
                initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  domStorageEnabled: true,
                  databaseEnabled: true,
                  mediaPlaybackRequiresUserGesture: false,
                  allowsInlineMediaPlayback: true,
                  useHybridComposition: true,
                  transparentBackground: false,
                  supportZoom: false,
                  builtInZoomControls: false,
                  displayZoomControls: false,
                  thirdPartyCookiesEnabled: true,
                  cacheEnabled: true,
                  hardwareAcceleration: true,
                ),
                pullToRefreshController: _pullToRefreshController,
                onWebViewCreated: (controller) {
                  _webViewController = controller;
                },
                onLoadStart: (controller, url) {
                  if (mounted) {
                    setState(() => _pageError = false);
                  }
                },
                onProgressChanged: (controller, progress) {
                  if (progress == 100) {
                    _pullToRefreshController?.endRefreshing();
                  }
                  if (mounted) {
                    setState(() => _progress = progress / 100);
                  }
                },
                onLoadStop: (controller, url) async {
                  _pullToRefreshController?.endRefreshing();
                },
                onReceivedError: (controller, request, error) {
                  if (request.isForMainFrame ?? false) {
                    if (mounted) {
                      setState(() => _pageError = true);
                    }
                  }
                },
                onPermissionRequest: (controller, request) async {
                  final mic = await Permission.microphone.request();
                  if (mic.isGranted) {
                    return PermissionResponse(
                      resources: request.resources,
                      action: PermissionResponseAction.GRANT,
                    );
                  }
                  return PermissionResponse(
                    resources: request.resources,
                    action: PermissionResponseAction.DENY,
                  );
                },
              ),
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
                                _webViewController?.loadUrl(
                                  urlRequest:
                                      URLRequest(url: WebUri(siteUrl)),
                                );
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
