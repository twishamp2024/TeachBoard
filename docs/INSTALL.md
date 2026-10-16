# Installing TeachBoard

TeachBoard works fully offline and needs no account. Lessons are saved as
`.tboard` files wherever you choose, and the same file opens on Windows and
macOS.

## Windows 10 / 11 (64-bit)

1. Download **`setup.exe`**.
2. Double-click it. If Windows SmartScreen says *"Windows protected your
   PC"* (the installer is not code-signed), click **More info → Run
   anyway**.
3. Choose *Only for me* (no administrator rights needed) or *Anyone who
   uses this computer*, pick a folder if you like, and click **Install**.
4. Start TeachBoard from the Start menu or the desktop shortcut.
   Double-clicking a `.tboard` file also opens it.

**Uninstall:** *Settings → Apps → Installed apps → TeachBoard → Uninstall*.
Your lessons are not affected. Preferences and your resource library stay
in `%APPDATA%\TeachBoard`; delete that folder to remove them too.

**Silent install (IT):** `setup.exe /S` (per-user) — add `/D=C:\Path` to
choose the folder.

## macOS 12 Monterey or later (Apple silicon and Intel)

1. Download **`setup.dmg`** and double-click it.
2. Drag **TeachBoard** onto the **Applications** folder shortcut.
3. Eject the disk image.
4. Open TeachBoard from *Applications*. If the build is not notarised,
   macOS will say it cannot verify the developer: **right-click (or
   Control-click) the app → Open → Open**. (Alternatively: *System
   Settings → Privacy & Security → Open Anyway*.) This is needed only once.

**Uninstall:** drag *TeachBoard* from *Applications* to the Bin.
Preferences live in `~/Library/Application Support/TeachBoard`.

## First steps

* The pen is selected and a blank 16:9 page is ready — just draw.
* The tool dock is at the bottom; options for the current tool appear just
  above it. To see every keyboard shortcut, press **Ctrl+/** (Windows) or
  **⌘/** (macOS).
* **Present** (top right, or F5) shows the lesson full-screen; press **Esc**
  to leave.
* Pen tablets and touch screens work out of the box; pressure sensitivity
  can be switched off in *Settings → General*.
