# Mafia Online — نسخة ويب عربية

المشروع مبني كواجهة HTML/CSS/JavaScript مع خادم Node.js، قاعدة SQLite، حسابات بكلمات مرور مشفرة، غرف لعب لحظية عبر Socket.IO، ودردشة صوتية WebRTC.

## التشغيل
1. ثبّت Node.js 18 أو أحدث.
2. من داخل مجلد المشروع:
   npm install
   npm start
3. افتح: http://localhost:3000

## النشر
يمكن رفع المشروع كما هو إلى Render / Railway / VPS. أمر التشغيل: `npm start`.
اضبط متغير البيئة `SESSION_SECRET` بقيمة سرية طويلة.
للنشر الحقيقي استخدم HTTPS، واجعل cookie.secure=true خلف HTTPS.
لصوت أكثر موثوقية على شبكات الهاتف/الراوتر، أضف TURN server إلى `rtcCfg` في public/app.js.

## الملفات
- public/index.html: الواجهة + تسجيل الدخول/إنشاء الحساب + غرفة اللعب
- public/style.css: التصميم المتجاوب
- public/app.js: الواجهة، Socket.IO، WebRTC
- server.js: API الحسابات، SQLite، الغرف، الإشارات الصوتية
- data/: تنشأ فيها قاعدة mafia.db تلقائياً
