using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace V1App
{
    /// <summary>Live wallpaper preferences, per user: %LOCALAPPDATA%\V1\wallpaper.json</summary>
    internal sealed class WallpaperConfig
    {
        public bool Enabled;
        public string Style = "chrome";
        public int Fps = 30;
        public bool PauseOnBattery = true;

        private static string FilePath { get { return Path.Combine(Paths.UserData, "wallpaper.json"); } }
        private static readonly string[] Styles = { "chrome", "mono", "void" };

        public bool IsLive { get { return Enabled && Style != "void"; } }

        public static WallpaperConfig Load()
        {
            var c = new WallpaperConfig();
            var d = Json.ReadFile(FilePath);
            if (d == null)
            {
                // First run after setup: take the choice made on the Look screen.
                var look = Json.ReadFile(Path.Combine(Paths.UserData, "look.json"));
                c.Enabled = Json.Bool(look, "live", false);
                c.Style = Json.Str(look, "wallpaper", "chrome");
            }
            else
            {
                c.Enabled = Json.Bool(d, "enabled", false);
                c.Style = Json.Str(d, "style", "chrome");
                c.Fps = Json.Int(d, "fps", 30);
                c.PauseOnBattery = Json.Bool(d, "pauseOnBattery", true);
            }
            c.Normalize();
            return c;
        }

        public void Normalize()
        {
            if (Array.IndexOf(Styles, Style) < 0) Style = "chrome";
            Fps = Fps >= 45 ? 60 : 30;
            if (Style == "void") Enabled = false;
        }

        public void Save() { Json.WriteFile(FilePath, ToDict()); }

        public Dictionary<string, object> ToDict()
        {
            return new Dictionary<string, object>
            {
                { "enabled", Enabled }, { "style", Style }, { "fps", Fps }, { "pauseOnBattery", PauseOnBattery }
            };
        }
    }

    /// <summary>Used by V1 Settings: saves preferences and starts, reloads or stops the wallpaper process.</summary>
    internal static class WallpaperController
    {
        public const string MutexName = @"Local\V1Wallpaper";
        public const string ReloadEventName = @"Local\V1Wallpaper.Reload";
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValue = "V1 Live Wallpaper";

        public static bool IsRunning()
        {
            try { using (Mutex.OpenExisting(MutexName)) { return true; } }
            catch (Exception) { return false; }
        }

        public static Dictionary<string, object> Status()
        {
            var c = WallpaperConfig.Load();
            var d = c.ToDict();
            d["status"] = !c.IsLive ? "off" : IsRunning() ? "running" : "stopped";
            return d;
        }

        public static Dictionary<string, object> Apply(WallpaperConfig c)
        {
            c.Normalize();
            c.Save();
            SetStill(c.Style);
            if (c.IsLive)
            {
                SetRunAtSignIn(true);
                if (IsRunning()) SignalReload();
                else Process.Start(new ProcessStartInfo(Paths.Exe, "--wallpaper") { UseShellExecute = false });
            }
            else
            {
                SetRunAtSignIn(false);
                SignalReload(); // the running process re-reads the file and exits
            }
            var d = c.ToDict();
            d["status"] = c.IsLive ? "running" : "off";
            return d;
        }

        public static void SignalReload()
        {
            try { using (var ev = EventWaitHandle.OpenExisting(ReloadEventName)) { ev.Set(); } }
            catch (Exception) { /* not running */ }
        }

        public static void SetRunAtSignIn(bool on)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(RunValue, "\"" + Paths.Exe + "\" --wallpaper", RegistryValueKind.String);
                else if (k.GetValue(RunValue) != null) k.DeleteValue(RunValue, false);
            }
        }

        /// <summary>The still image under the live one, so pausing or turning live off shows the same picture.</summary>
        public static void SetStill(string style)
        {
            string img = Path.Combine(Paths.Wallpapers, style + ".jpg");
            if (!File.Exists(img)) { Log.Write("Wallpaper image missing: " + img); return; }
            using (var k = Registry.CurrentUser.CreateSubKey(@"Control Panel\Desktop"))
            {
                k.SetValue("WallpaperStyle", "10", RegistryValueKind.String);
                k.SetValue("TileWallpaper", "0", RegistryValueKind.String);
            }
            if (!Native.SystemParametersInfo(Native.SPI_SETDESKWALLPAPER, 0, img, Native.SPIF_UPDATEINIFILE | Native.SPIF_SENDCHANGE))
                Log.Write("SystemParametersInfo refused the wallpaper");
        }
    }

    /// <summary>Finds the window behind the desktop icons and puts a window there.</summary>
    internal static class Desktop
    {
        internal sealed class Host
        {
            public IntPtr Parent;
            public IntPtr InsertAfter;
            public IntPtr WorkerW;
            public bool Raised;
        }

        public static Host Prepare()
        {
            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman == IntPtr.Zero) return null;
            IntPtr unused;
            // 0x052C asks Explorer to create the WorkerW window that sits between the wallpaper and the icons.
            Native.SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, Native.SMTO_NORMAL, 1000, out unused);
            Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), IntPtr.Zero, Native.SMTO_NORMAL, 1000, out unused);
            Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), Native.SMTO_NORMAL, 1000, out unused);

            // Windows 11 24H2 and later ("raised desktop"): WorkerW and the icon view are both children of Progman.
            IntPtr childWorker = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
            if (childWorker != IntPtr.Zero)
            {
                IntPtr defView = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (defView == IntPtr.Zero) return null;
                return new Host { Parent = progman, InsertAfter = defView, WorkerW = childWorker, Raised = true };
            }

            // Earlier builds: the icons live in a top-level WorkerW; the wallpaper WorkerW is the next sibling after it.
            IntPtr worker = IntPtr.Zero;
            Native.EnumWindows((top, l) =>
            {
                if (Native.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                    worker = Native.FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                return true;
            }, IntPtr.Zero);
            if (worker == IntPtr.Zero) return null;
            return new Host { Parent = worker, InsertAfter = IntPtr.Zero, Raised = false };
        }

        public static bool Attach(IntPtr hwnd, Host host, Rectangle screen)
        {
            if (host.Raised)
            {
                // Progman is composited without a redirection bitmap on raised desktops; layered children still draw.
                long ex = Native.GetWindowLong(hwnd, Native.GWL_EXSTYLE);
                Native.SetWindowLong(hwnd, Native.GWL_EXSTYLE, ex | Native.WS_EX_LAYERED);
                Native.SetLayeredWindowAttributes(hwnd, 0, 255, Native.LWA_ALPHA);
            }
            Native.SetParent(hwnd, host.Parent);
            if (Native.GetParent(hwnd) != host.Parent) return false;

            var pt = new Native.POINT { X = screen.Left, Y = screen.Top };
            Native.ScreenToClient(host.Parent, ref pt);
            uint flags = Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW;
            if (!host.Raised) flags |= Native.SWP_NOZORDER;
            if (!Native.SetWindowPos(hwnd, host.Raised ? host.InsertAfter : IntPtr.Zero, pt.X, pt.Y, screen.Width, screen.Height, flags)) return false;
            if (host.Raised && host.WorkerW != IntPtr.Zero)
                Native.SetWindowPos(host.WorkerW, hwnd, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
            return Native.IsWindowVisible(hwnd);
        }
    }

    /// <summary>One borderless window per monitor, hosting wallpaper.html.</summary>
    internal sealed class WallForm : Form
    {
        public readonly WebView2 Web = new WebView2();
        public readonly Rectangle ScreenBounds;
        public bool Paused;

        public WallForm(Screen screen)
        {
            ScreenBounds = screen.Bounds;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-32000, -32000); // off screen until it is safely behind the icons
            Size = ScreenBounds.Size;
            BackColor = Color.FromArgb(6, 10, 16);
            Text = "V1 Live Wallpaper";
            Web.Dock = DockStyle.Fill;
            Web.DefaultBackgroundColor = BackColor;
            Controls.Add(Web);
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
                return cp;
            }
        }

        public async Task InitAsync(CoreWebView2Environment env, string url)
        {
            await Web.EnsureCoreWebView2Async(env);
            var core = Web.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.SetVirtualHostNameToFolderMapping(AppWindow.HostName, Paths.Web, CoreWebView2HostResourceAccessKind.Deny);
            core.NavigationStarting += (s, e) => { if (!e.Uri.StartsWith("https://" + AppWindow.HostName + "/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
            core.NewWindowRequested += (s, e) => { e.Handled = true; };
            var done = new TaskCompletionSource<bool>();
            EventHandler<CoreWebView2NavigationCompletedEventArgs> h = null;
            h = (s, e) => { core.NavigationCompleted -= h; done.TrySetResult(e.IsSuccess); };
            core.NavigationCompleted += h;
            core.Navigate(url);
            await Task.WhenAny(done.Task, Task.Delay(10000));
        }

        public void Send(string text)
        {
            try { if (Web.CoreWebView2 != null) Web.CoreWebView2.PostWebMessageAsString(text); }
            catch (Exception ex) { Log.Write("post failed: " + ex.Message); }
        }

        public void SendJson(object value)
        {
            try { if (Web.CoreWebView2 != null) Web.CoreWebView2.PostWebMessageAsJson(Json.Write(value)); }
            catch (Exception ex) { Log.Write("post failed: " + ex.Message); }
        }

        public void SetPaused(bool paused)
        {
            if (paused == Paused) return;
            Paused = paused;
            Send(paused ? "pause" : "play");
            try
            {
                if (Web.CoreWebView2 != null)
                    Web.CoreWebView2.MemoryUsageTargetLevel = paused ? CoreWebView2MemoryUsageTargetLevel.Low : CoreWebView2MemoryUsageTargetLevel.Normal;
            }
            catch (Exception) { /* older runtime */ }
        }
    }

    /// <summary>Hidden top-level window: Explorer broadcasts "TaskbarCreated" to top-level windows when it restarts.</summary>
    internal sealed class ShellWatcher : NativeWindow
    {
        private static readonly int TaskbarCreatedMsg = Native.RegisterWindowMessage("TaskbarCreated");
        public event Action TaskbarCreated;

        public ShellWatcher() { CreateHandle(new CreateParams { Caption = "V1 Wallpaper Watcher" }); }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == TaskbarCreatedMsg && TaskbarCreated != null) TaskbarCreated();
            base.WndProc(ref m);
        }
    }

    /// <summary>The --wallpaper process.</summary>
    internal sealed class WallpaperContext : ApplicationContext
    {
        private WallpaperConfig cfg;
        private readonly List<WallForm> forms = new List<WallForm>();
        private readonly Control invoker = new Control();
        private readonly ShellWatcher watcher = new ShellWatcher();
        private readonly System.Windows.Forms.Timer pauseTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        private readonly System.Windows.Forms.Timer rebuildTimer = new System.Windows.Forms.Timer();
        private readonly EventWaitHandle reload;
        private readonly RegisteredWaitHandle reloadWait;
        private readonly uint myPid = (uint)Process.GetCurrentProcess().Id;
        private CoreWebView2Environment env;
        private bool locked, building;
        private int failures;

        public WallpaperContext(WallpaperConfig config)
        {
            cfg = config;
            IntPtr force = invoker.Handle; // creates the handle so BeginInvoke works
            GC.KeepAlive(force);
            watcher.TaskbarCreated += () => ScheduleRebuild(2500);
            SystemEvents.DisplaySettingsChanged += OnDisplayChanged;
            SystemEvents.SessionSwitch += OnSessionSwitch;
            pauseTimer.Tick += (s, e) => UpdatePause();
            rebuildTimer.Tick += (s, e) => { rebuildTimer.Stop(); Build(); };
            reload = new EventWaitHandle(false, EventResetMode.AutoReset, WallpaperController.ReloadEventName);
            reloadWait = ThreadPool.RegisterWaitForSingleObject(reload, (st, to) => invoker.BeginInvoke(new Action(OnReload)), null, -1, false);
            invoker.BeginInvoke(new Action(Build));
        }

        private string Url()
        {
            return "https://" + AppWindow.HostName + "/wallpaper.html?style=" + cfg.Style + "&fps=" + cfg.Fps;
        }

        private void ScheduleRebuild(int ms)
        {
            rebuildTimer.Stop();
            rebuildTimer.Interval = ms;
            rebuildTimer.Start();
        }

        private void OnDisplayChanged(object sender, EventArgs e) { invoker.BeginInvoke(new Action(() => ScheduleRebuild(1500))); }

        private void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
        {
            if (e.Reason == SessionSwitchReason.SessionLock || e.Reason == SessionSwitchReason.ConsoleDisconnect) locked = true;
            if (e.Reason == SessionSwitchReason.SessionUnlock || e.Reason == SessionSwitchReason.ConsoleConnect) locked = false;
            invoker.BeginInvoke(new Action(UpdatePause));
        }

        private void OnReload()
        {
            var next = WallpaperConfig.Load();
            if (!next.IsLive) { Log.Write("Live wallpaper turned off"); ExitThread(); return; }
            cfg = next;
            foreach (var f in forms) f.SendJson(new Dictionary<string, object> { { "style", cfg.Style }, { "fps", cfg.Fps } });
            UpdatePause();
        }

        private async void Build()
        {
            if (building) return;
            building = true;
            try
            {
                Teardown();
                if (env == null)
                    env = await CoreWebView2Environment.CreateAsync(null, Paths.Ensure(Path.Combine(Paths.UserData, "webview-wallpaper")));
                var host = Desktop.Prepare();
                if (host == null) throw new InvalidOperationException("Explorer's desktop window was not found");
                foreach (var screen in Screen.AllScreens)
                {
                    var f = new WallForm(screen);
                    forms.Add(f);
                    f.Show();
                    await f.InitAsync(env, Url());
                    f.Web.CoreWebView2.ProcessFailed += (s, e) => { Log.Write("WebView2 process failed: " + e.ProcessFailedKind); ScheduleRebuild(3000); };
                    if (!Desktop.Attach(f.Handle, host, screen.Bounds))
                        throw new InvalidOperationException("Could not place the wallpaper behind the desktop icons");
                }
                failures = 0;
                Log.Write("Live wallpaper running on " + forms.Count + " screen(s), " + (host.Raised ? "raised" : "classic") + " desktop");
                pauseTimer.Start();
                UpdatePause();
            }
            catch (Exception ex)
            {
                // Never leave a window floating over the desktop: tear down and fall back to the still image.
                Log.Write("Live wallpaper could not start: " + ex.Message);
                Teardown();
                if (++failures <= 3) ScheduleRebuild(5000 * failures);
                else { Log.Write("Giving up; the still wallpaper stays."); ExitThread(); }
            }
            finally { building = false; }
        }

        private void Teardown()
        {
            pauseTimer.Stop();
            foreach (var f in forms)
            {
                try { f.Close(); f.Dispose(); } catch (Exception) { /* already gone */ }
            }
            forms.Clear();
        }

        private static readonly HashSet<string> ShellClasses = new HashSet<string>(StringComparer.Ordinal)
        {
            "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow",
            "XamlExplorerHostIslandWindow", "TopLevelWindowForOverflowXamlIsland", "NotifyIconOverflowWindow"
        };

        /// <summary>Pauses each screen whose wallpaper cannot be seen, and everything on battery or when locked.</summary>
        private void UpdatePause()
        {
            if (forms.Count == 0) return;
            bool battery = cfg.PauseOnBattery && SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Offline;
            var covered = new HashSet<Rectangle>();
            if (!locked && !battery)
            {
                var screens = new List<Rectangle>();
                foreach (var f in forms) screens.Add(f.ScreenBounds);
                Native.EnumWindows((w, l) =>
                {
                    if (!Native.IsWindowVisible(w) || Native.IsIconic(w) || Native.IsCloaked(w)) return true;
                    uint pid;
                    Native.GetWindowThreadProcessId(w, out pid);
                    if (pid == myPid) return true;
                    if (ShellClasses.Contains(Native.ClassOf(w))) return true;
                    Native.RECT r;
                    if (!Native.GetWindowRect(w, out r)) return true;
                    var rect = Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
                    long ex = Native.GetWindowLong(w, Native.GWL_EXSTYLE);
                    bool overlay = (ex & (Native.WS_EX_TRANSPARENT | Native.WS_EX_LAYERED)) != 0;
                    bool zoomed = Native.IsZoomed(w);
                    foreach (var s in screens)
                    {
                        if (zoomed && s.Contains(new Point(rect.Left + rect.Width / 2, rect.Top + rect.Height / 2))) covered.Add(s);
                        else if (!overlay && rect.Contains(s)) covered.Add(s);
                    }
                    return true;
                }, IntPtr.Zero);
            }
            foreach (var f in forms) f.SetPaused(locked || battery || covered.Contains(f.ScreenBounds));
        }

        protected override void ExitThreadCore()
        {
            SystemEvents.DisplaySettingsChanged -= OnDisplayChanged;
            SystemEvents.SessionSwitch -= OnSessionSwitch;
            reloadWait.Unregister(null);
            Teardown();
            pauseTimer.Dispose();
            rebuildTimer.Dispose();
            watcher.DestroyHandle();
            reload.Dispose();
            base.ExitThreadCore();
        }
    }

    internal static class WallpaperHost
    {
        public static int Run()
        {
            Log.Name = "wallpaper";
            bool created;
            using (var mutex = new Mutex(true, WallpaperController.MutexName, out created))
            {
                if (!created) { WallpaperController.SignalReload(); return 0; }
                var cfg = WallpaperConfig.Load();
                if (!cfg.IsLive) return 0;
                Application.Run(new WallpaperContext(cfg));
                GC.KeepAlive(mutex);
            }
            return 0;
        }
    }
}
