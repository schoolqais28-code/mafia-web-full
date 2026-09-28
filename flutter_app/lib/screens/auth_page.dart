import 'package:flutter/material.dart';

import '../app_controller.dart';

class AuthPage extends StatefulWidget {
  final AppController controller;
  const AuthPage({super.key, required this.controller});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final user = TextEditingController();
  final pass = TextEditingController();
  bool registerMode = false;
  bool busy = false;
  String? error;

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (registerMode) {
        await widget.controller.register(user.text, pass.text);
      } else {
        await widget.controller.login(user.text, pass.text);
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final registrationOpen = widget.controller.site.registrationOpen;
    if (!registrationOpen && registerMode) registerMode = false;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      const Icon(Icons.visibility_off_rounded,
                          size: 72, color: Color(0xFFD11E2F)),
                      const SizedBox(height: 10),
                      const Text('MAFIA',
                          style: TextStyle(
                              fontSize: 34,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 4)),
                      const SizedBox(height: 6),
                      Text(registerMode ? 'إنشاء حساب جديد' : 'تسجيل الدخول'),
                      const SizedBox(height: 24),
                      TextField(
                        controller: user,
                        decoration:
                            const InputDecoration(labelText: 'اسم المستخدم'),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: pass,
                        obscureText: true,
                        onSubmitted: (_) => submit(),
                        decoration:
                            const InputDecoration(labelText: 'كلمة المرور'),
                      ),
                      if (error != null) ...[
                        const SizedBox(height: 12),
                        Text(error!,
                            style: const TextStyle(color: Colors.redAccent)),
                      ],
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: busy ? null : submit,
                          child: busy
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2))
                              : Text(registerMode ? 'إنشاء الحساب' : 'دخول'),
                        ),
                      ),
                      if (registrationOpen)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () =>
                                  setState(() => registerMode = !registerMode),
                          child: Text(registerMode
                              ? 'عندي حساب بالفعل'
                              : 'إنشاء حساب جديد'),
                        ),
                      if (!registrationOpen)
                        const Padding(
                          padding: EdgeInsets.only(top: 12),
                          child: Text(
                            'إنشاء الحسابات متوقف مؤقتًا من الإدارة',
                            style: TextStyle(color: Colors.orangeAccent),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
