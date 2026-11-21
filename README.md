# V1 OS

Windows 11, rebuilt lean. V1 removes ads, preinstalled clutter, Copilot and telemetry. It tunes Windows for the way you use your PC and gives it a dark, minimal look with an optional live wallpaper. Every change is recorded, so **Undo** in V1 Settings puts Windows back the way it was.

See it first: [`docs/v1-setup-demo.mp4`](docs/v1-setup-demo.mp4) (the setup and the live-wallpaper switch) and the screens in [`docs/screens`](docs/screens).

V1 works like AtlasOS: you start from a genuine Windows 11, and an animated setup applies your choices. No modified Windows image is downloaded from anywhere. The ISO builder works from Microsoft's own ISO, on your PC.

## Two ways to use it

### A. On the Windows 11 you already have (no reinstall)

1. Download this folder (green **Code** button, then **Download ZIP**) and unzip it.
2. Double-click **`Install-on-this-PC.cmd`** and approve the administrator prompt.
3. V1 Setup opens. Nothing changes until you press **Apply** on the last step.
4. Restart when it says so.

### B. A fresh install from a USB stick

1. Download the official Windows 11 ISO from <https://www.microsoft.com/software-download/windows11>.
2. Double-click **`Build-ISO.cmd`**, approve the prompt and pick the ISO. Choose the edition **your PC is licensed for** (most laptops: Home) and a name for your account. It takes 10 to 20 minutes and writes `V1-Windows11-<edition>.iso` next to the original.
3. Write that ISO to a USB stick (8 GB or larger) with [Rufus](https://rufus.ie). If Rufus offers to customise the Windows install, leave every box unticked, because V1 already does this.
4. **Back up your files**, boot from the stick and choose the disk to install to. That is the only question Windows Setup asks. V1 never picks or wipes a disk on its own.
5. You are signed in automatically and V1 Setup opens.

`Build-ISO.cmd` takes options when run from PowerShell (`build\build-iso.ps1 -?`): `-Edition`, `-UserName`, `-Password`, `-Locale en-IN`, `-TimeZone`, and `-BypassRequirements` for PCs without TPM 2.0 or Secure Boot.

## V1 Setup

| Step | What happens |
|---|---|
| System check | Confirms Windows 11, administrator rights and free space, warns about a pending restart, and creates the restore point **V1-before** |
| Profile | **Gaming**, **Balanced**, **Work** or **Minimal**. This sets the defaults on the next screen |
| Options | Telemetry, ads, Copilot and Recall, Store, Xbox, OneDrive, another browser, memory integrity, feature-upgrade hold, driver updates |
| Look | Wallpaper (Chrome, Mono or Void), live wallpaper, accent colour, dark or light theme, taskbar position, transparency |
| Apply | Live progress with every change listed, then a summary and a restart |

**What V1 never does:** turn off Microsoft Defender, block security updates, remove the Edge WebView2 runtime that apps depend on, or touch your files.

### What each profile adds

- **All profiles:** removes Clipchamp, News, Weather, Bing Search, Solitaire, Get Help, Tips, People, Power Automate, To Do, Feedback Hub, Maps, Films & TV, Mail and Calendar (legacy), Dev Home, Teams (personal), Cortana, Family and Game Assist. Also: menus open faster, startup apps aren't held back, background game recording is off, and update sharing with other PCs is off.
- **Gaming:** Ultimate Performance power plan (desktops only; laptops stay on Balanced), Game Mode, hardware GPU scheduling, raw mouse input, multimedia scheduler tuned for games. Memory integrity defaults to off; the screen explains the security cost, and you can turn it back on.
- **Balanced:** the defaults above, nothing more.
- **Work:** also keeps Outlook (new), the Microsoft 365 app and Teams.
- **Minimal:** also removes the Microsoft Store, Xbox apps and OneDrive, and stops Store apps running in the background.

## Live wallpaper

The Chrome and Mono wallpapers can move. V1 keeps this cheap:

- It renders at reduced resolution, at 30 fps by default.
- It **stops drawing** on any screen covered by a maximized or fullscreen window, while the PC is locked, and on battery (optional).
- The still wallpaper underneath is the same picture, so pausing is invisible.

**To turn it off:** open **V1 Settings** from Start, go to **Wallpaper** and switch off **Live wallpaper**. The picture stays as a still wallpaper, and the background process exits immediately.

## Undo

**V1 Settings → Undo & maintenance → Undo changes** restores every registry value, service, scheduled task, power plan and Windows feature V1 changed, using the record saved before each change (`C:\ProgramData\V1\backup.json`). It also stops the live wallpaper and puts back your previous wallpaper. Removed apps can be reinstalled from the Microsoft Store. The **V1-before** restore point is a second safety net.

Logs of every step are in `C:\ProgramData\V1\logs`.

## Performance

V1 cuts background work: fewer apps and services, no telemetry uploads, no suggested-app installs, no background recording. On top of that, Gaming tunes the scheduler and power plan. These are the targets for the first measured comparison (same PC, five minutes idle, stock Windows 11 vs V1). They are goals, not measurements yet:

| | Target |
|---|---|
| Idle memory in use | ≤ 2.0 GB |
| Background processes | ≤ 70 |
| Install size | ≤ 15 GB |

## Good to know

- **SmartScreen or Defender warnings:** `V1App.exe` is not code-signed, and tools that change Windows settings sometimes get flagged. Everything here is source you can read. `dist\` is built from `src\V1App`, and the GitHub Action in `.github\workflows\build.yml` rebuilds it on Windows and runs the tests on every push.
- **"Your browser is managed by your organization"** in Edge: this message appears because V1 uses Edge's official policies to switch off its background running and shopping and news features. Undo removes them.
- **Lock screen:** V1 sets the lock screen to match your wallpaper through Windows' lock-screen policy, so the lock-screen picker in Settings is locked until you undo.
- **Feature-upgrade hold** works on Pro, Education and Enterprise. Home may ignore it.
- **Run setup from the account you use.** Setup changes the appearance of the account it runs in.

## Repository

| Path | What it is |
|---|---|
| `Build-ISO.cmd`, `Install-on-this-PC.cmd` | Double-click launchers |
| `build\build-iso.ps1` | Official ISO → V1 ISO (DISM, oscdimg) |
| `build\autounattend.template.xml` | Answer file: local account, no ad or consent pages, V1 Setup at first sign-in |
| `build\install.ps1` | Copies V1 to `C:\V1` and opens setup |
| `payload\playbook\` | `apply.ps1`, `revert.ps1`, `checks.ps1` and the `V1.psm1` core that records every change |
| `payload\web\` | Setup, Settings and live wallpaper pages (HTML, WebGL) |
| `payload\wallpapers\` | Still wallpapers, rendered from the same shader by `tools\render-wallpapers.js` |
| `src\V1App\` | The Windows app: frameless WebView2 window, PowerShell runner, live wallpaper engine (.NET Framework 4.8, built into Windows 11) |
| `dist\` | Built `V1App.exe` and its WebView2 libraries |
| `tests\` | Pester round-trip tests: apply, re-apply, appearance as a standard user, undo. They run against a fake registry and never change the machine |
| `prototype\` | The original animated mock-up |

**Build the app:** `dotnet build src/V1App/V1App.csproj -c Release -o dist` (.NET 8 SDK; works on Windows or Linux).
**Run the tests:** `Invoke-Pester -Path tests` (Pester 5).
**Preview the UI in a browser:** open `payload/web/setup.html` or `settings.html`. Outside V1App they run in preview mode and change nothing.

Fonts: Archivo, Inter and JetBrains Mono, under the SIL Open Font License (`payload/web/assets/fonts/FONT-LICENSES.txt`).
