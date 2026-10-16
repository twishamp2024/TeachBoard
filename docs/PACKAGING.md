# Packaging and release

Release artifacts:

```
release/
├── windows/
│   ├── setup.exe          NSIS installer (x64)
│   └── setup.exe.json     version, size, SHA-256, build host
├── macos/
│   ├── setup.dmg          disk image with a universal (Apple silicon + Intel) app
│   └── setup.dmg.json
└── logs/                  build logs
```

The application name, id, version and file type come from
[`app.config.json`](../app.config.json). `npm run sync-config` copies them into
`package.json` (the dist scripts run it automatically); the main process,
renderer, menus, About box, installer and bundle metadata all read the
same file. Changing `appName` there renames the app everywhere.

## Prerequisites

* Node.js 22.12+ (developed with Node 24) and npm.
* Internet access on the first build (electron-builder downloads Electron
  and NSIS/DMG tooling into its cache).
* **Windows installer:** build on Windows.
* **macOS disk image:** build on macOS (Xcode command-line tools). DMG
  creation and code signing require macOS; it cannot be produced on Windows.

## Windows — `setup.exe`

```bash
npm ci
npm run dist:win
```

Produces `dist/windows/setup.exe` and copies it to `release/windows/`.

Installer behaviour (NSIS, assisted mode):

* Choice of per-user (default, no admin rights) or all-users install and of
  the installation folder.
* Start-menu and desktop shortcuts named after `appName`.
* Registers the `.tboard` file type with the application.
* Uninstaller in *Settings → Apps* (and in the install folder). Uninstalling
  removes the program but keeps the user's settings and resource library
  in `%APPDATA%\TeachBoard` (lessons are never touched).
* Silent install/uninstall for IT deployment: `setup.exe /S [/D=C:\Path]`,
  `"Uninstall TeachBoard.exe" /S`.

### Code signing (Windows)

The installer is **not signed** unless a certificate is provided. Unsigned,
Windows SmartScreen shows "Windows protected your PC" on first run; choose
*More info → Run anyway*. To sign, provide a code-signing certificate:

```bash
# PowerShell
$env:CSC_LINK = "C:\path\to\certificate.pfx"   # or base64 of the .pfx
$env:CSC_KEY_PASSWORD = "…"
npm run dist:win
```

(An EV certificate removes the SmartScreen warning immediately; a standard
OV certificate builds reputation over time.)

## macOS — `setup.dmg`

```bash
npm ci
npm run dist:mac
```

Produces `dist/macos/setup.dmg` (universal binary) and copies it to
`release/macos/`. The DMG window shows the app and an *Applications*
shortcut to drag it onto.

### Signing and notarisation (macOS)

Without credentials the app is **ad-hoc signed** (required for Apple
silicon to run it) but not signed with a Developer ID and not notarised.
Gatekeeper then blocks the first launch. Users can open it with
*right-click → Open → Open*, or *System Settings → Privacy & Security →
Open Anyway*.

To produce a signed and notarised build you need an Apple Developer
account:

```bash
export CSC_LINK=/path/to/DeveloperID_Application.p12   # or base64
export CSC_KEY_PASSWORD=…
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=…                   # appleid.apple.com → App-Specific Passwords
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:mac
```

With a Developer ID present the config enables the hardened runtime (with
the JIT entitlements Electron needs, in `build/entitlements.mac.plist`);
with the Apple ID variables it notarises and staples automatically.
Check the result with:

```bash
spctl --assess --type execute -vv "/Applications/TeachBoard.app"
xcrun stapler validate release/macos/setup.dmg
```

## Continuous integration

[`.github/workflows/release.yml`](../.github/workflows/release.yml) builds on
each `v*` tag (or manually):

1. **Unit tests** and type checking on Linux.
2. **Windows runner:** end-to-end tests against the built app → `setup.exe`
   → silent install → the full end-to-end suite again against the
   **installed** executable → silent uninstall and a check that it is gone →
   uploads `release/windows/`.
3. **macOS runner:** end-to-end tests → `setup.dmg` → mounts the image,
   checks the *Applications* link, `codesign --verify`, bundle metadata and
   universal architectures → copies the app out and runs the end-to-end
   suite against it → uploads `release/macos/`.

Optional repository secrets: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`,
`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## Testing a packaged build locally

The end-to-end suite runs against any build via `TB_EXECUTABLE`:

```bash
# Windows (after installing)
set TB_EXECUTABLE=%LOCALAPPDATA%\Programs\TeachBoard\TeachBoard.exe
npx playwright test

# macOS (after copying to /Applications)
TB_EXECUTABLE=/Applications/TeachBoard.app/Contents/MacOS/TeachBoard npx playwright test
```

## Versioning

Bump `version` in `app.config.json`, run `npm run sync-config`, commit and
tag `vX.Y.Z`. The version appears in the About box, installer metadata,
the Windows file properties, `CFBundleShortVersionString`, and each
lesson's `manifest.json` (`appVersion`). The lesson *format* version is
separate (see [FILE_FORMAT.md](FILE_FORMAT.md)).
