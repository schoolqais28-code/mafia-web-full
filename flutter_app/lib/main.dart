import 'package:flutter/material.dart';

import 'app_controller.dart';
import 'screens/auth_page.dart';
import 'screens/home_page.dart';
import 'screens/maintenance_page.dart';
import 'screens/room_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = AppController();
  await controller.init();
  runApp(MafiaApp(controller: controller));
}

class MafiaApp extends StatelessWidget {
  final AppController controller;
  const MafiaApp({super.key, required this.controller});

  ThemeData _theme(String kind) {
    final seed = kind == 'midnight'
        ? const Color(0xFF1B4DB1)
        : const Color(0xFFD11E2F);
    final bg = kind == 'red'
        ? const Color(0xFF150308)
        : kind == 'midnight'
            ? const Color(0xFF030711)
            : const Color(0xFF08070B);

    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bg,
      colorScheme: ColorScheme.fromSeed(
        seedColor: seed,
        brightness: Brightness.dark,
        surface: const Color(0xFF100E13),
      ),
      cardTheme: const CardThemeData(
        color: Color(0xFF100E13),
        margin: EdgeInsets.symmetric(vertical: 7),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF0B090D),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
      ),
      useMaterial3: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final user = controller.user;
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'MAFIA',
          theme: _theme(user?.theme ?? 'dark'),
          builder: (context, child) => Directionality(
            textDirection: TextDirection.rtl,
            child: child ?? const SizedBox.shrink(),
          ),
          home: controller.loading
              ? const Scaffold(
                  body: Center(child: CircularProgressIndicator()),
                )
              : controller.site.maintenance && user?.isAdmin != true
                  ? MaintenancePage(controller: controller)
                  : user == null
                      ? AuthPage(controller: controller)
                      : controller.room != null
                          ? RoomPage(controller: controller)
                          : HomePage(controller: controller),
        );
      },
    );
  }
}
