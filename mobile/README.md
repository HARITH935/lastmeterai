# LastMeter AI — Android (Flutter)

Agent and manager mobile client for the LastMeter Flask API.

## Requirements

- [Flutter SDK](https://docs.flutter.dev/get-started/install) (3.47+)
- Android SDK (`%LOCALAPPDATA%\Android\Sdk`)
- JDK 17

## Quick start

```powershell
cd mobile
flutter pub get
flutter run
```

Default API: `https://lastmeterai.onrender.com`

**Demo logins**

| Role    | Username     | Password    |
|---------|--------------|-------------|
| Agent   | `ravi.kumar` | `agent123`  |
| Agent   | `raj.kumar`  | `agent123`  |
| Manager | `manager`    | `manager123`|

## Mapbox (optional)

Map tiles use Carto/OSM by default. For Mapbox streets (same provider as the website), create a local file that is **never committed**:

`dart_defines.json`:

```json
{"MAPBOX_TOKEN":"pk.YOUR_PUBLIC_TOKEN"}
```

Then run or build:

```powershell
flutter run --dart-define-from-file=dart_defines.json
flutter build apk --release --dart-define-from-file=dart_defines.json
```

## Local backend

Android emulator → host machine:

```powershell
flutter run --dart-define=API_BASE=http://10.0.2.2:5001
```

Physical phone on the same Wi‑Fi:

```powershell
flutter run --dart-define=API_BASE=http://YOUR_PC_IP:5001
```

## Release APK

```powershell
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk`

## Features

- Agent: home KPIs, orders, map + GPS tracking, AI chat, earnings, notifications
- Manager: fleet overview, agents, analytics, reports, customer/area insights
- JWT auth with secure token storage
- Real-time updates via Socket.IO
