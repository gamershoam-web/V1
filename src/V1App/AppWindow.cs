using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace V1App
{
    internal enum Mode { Setup, Settings, Revert, Wallpaper }

    /// <summary>The setup and settings window: a frameless, rounded window that hosts the web UI.</summary>
    internal sealed class AppWindow : Form
    {
        public const string HostName = "v1.example";
        private readonly Mode mode;
        private readonly WebView2 web = new WebView2();
        private CoreWebView2 core;
        private bool busy;

        public AppWindow(Mode mode)
        {
            this.mode = mode;
            Text = mode == Mode.Settings ? "V1 Settings" : "V1 Setup";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Color.FromArgb(11, 18, 28);
            try { Icon = Icon.ExtractAssociatedIcon(Paths.Exe); } catch (Exception) { /* default icon */ }
            float scale = DeviceDpi / 96f;
            ClientSize = new Size((int)(1120 * scale), (int)(700 * scale));
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = BackColor;
            Controls.Add(web);
            Load += async (s, e) => await InitAsync();
        }

        public string ModeName { get { return mode.ToString().ToLowerInvariant(); } }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.Style |= Native.WS_MINIMIZEBOX | Native.WS_SYSMENU; // taskbar click minimizes/restores
                cp.ClassStyle |= Native.CS_DROPSHADOW;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.RoundCorners(Handle);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Closing in the middle of applying would leave half the choices applied; the page shows when it is safe.
            if (busy && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; }
            base.OnFormClosing(e);
        }

        private async Task InitAsync()
        {
            try
            {
                // An elevated window keeps its browser profile in the admin-only folder, so a standard user can't tamper with it.
                string udf = Native.IsAdmin()
                    ? Path.Combine(Paths.Ensure(Paths.MachineData), "webview-admin")
                    : Path.Combine(Paths.Ensure(Paths.UserData), "webview");
                var env = await CoreWebView2Environment.CreateAsync(null, udf);
                await web.EnsureCoreWebView2Async(env);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                MessageBox.Show(this, "V1 needs the Microsoft Edge WebView2 Runtime, which is part of Windows 11. Run Windows Update, then open V1 again.", Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }
            catch (Exception ex)
            {
                Log.Write("WebView2 failed: " + ex);
                MessageBox.Show(this, "V1 could not start its window: " + ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }

            core = web.CoreWebView2;
            var st = core.Settings;
            st.AreDefaultContextMenusEnabled = false;
            st.AreDevToolsEnabled = Environment.GetEnvironmentVariable("V1_DEVTOOLS") == "1";
            st.IsStatusBarEnabled = false;
            st.IsZoomControlEnabled = false;
            st.AreBrowserAcceleratorKeysEnabled = false;
            st.IsGeneralAutofillEnabled = false;
            st.IsPasswordAutosaveEnabled = false;
            core.SetVirtualHostNameToFolderMapping(HostName, Paths.Web, CoreWebView2HostResourceAccessKind.Deny);
            core.NavigationStarting += (s, e) => { if (!e.Uri.StartsWith("https://" + HostName + "/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
            core.NewWindowRequested += (s, e) => { e.Handled = true; };
            core.WebMessageReceived += OnMessage;
            core.ProcessFailed += (s, e) => Log.Write("WebView2 process failed: " + e.ProcessFailedKind);
            string page = mode == Mode.Settings ? "settings.html" : "setup.html";
            core.Navigate("https://" + HostName + "/" + page + (mode == Mode.Revert ? "#revert" : ""));
        }

        // ------------------------------------------------------------ bridge

        private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            Dictionary<string, object> msg;
            try { msg = Json.Parse(e.WebMessageAsJson) as Dictionary<string, object>; }
            catch (Exception) { return; }
            if (msg == null) return;
            int id = Json.Int(msg, "id", 0);
            string cmd = Json.Str(msg, "cmd", "");
            var args = Json.Obj(Json.Get(msg, "args"));
            HandleRequest(id, cmd, args);
        }

        private async void HandleRequest(int id, string cmd, Dictionary<string, object> args)
        {
            try
            {
                object result = await Dispatch(cmd, args);
                Reply(id, true, result, null);
            }
            catch (Exception ex)
            {
                Log.Write(cmd + " failed: " + ex);
                Reply(id, false, null, ex.Message);
            }
        }

        private void Reply(int id, bool ok, object result, string error)
        {
            if (id == 0) return;
            Post(new Dictionary<string, object> { { "id", id }, { "ok", ok }, { "result", result }, { "error", error } });
        }

        public void Emit(string ev, object data)
        {
            Post(new Dictionary<string, object> { { "event", ev }, { "data", data } });
        }

        private void Post(Dictionary<string, object> message)
        {
            string json = Json.Write(message);
            Action send = () => { if (core != null && !IsDisposed) core.PostWebMessageAsJson(json); };
            if (InvokeRequired) { if (!IsDisposed) BeginInvoke(send); }
            else send();
        }

        private async Task<object> Dispatch(string cmd, Dictionary<string, object> args)
        {
            switch (cmd)
            {
                case "info": return Info();
                case "check": return await Checks.Run(Json.Str(args, "id", ""));
                case "apply": return StartRun("apply.ps1", args);
                case "revert": return StartRun("revert.ps1", args);
                case "appearance": return await Appearance(args);
                case "wallpaper.get": return WallpaperController.Status();
                case "wallpaper.set": return SetWallpaper(args);
                case "elevate": return Program.StartElevated(Json.Str(args, "target", "") == "revert" ? "--revert" : "--setup --force");
                case "openLogs": OpenLogs(); return true;
                case "restart":
                    Process.Start(new ProcessStartInfo("shutdown.exe", "/r /t 3 /d p:4:1") { UseShellExecute = false, CreateNoWindow = true });
                    return true;
                case "minimize": WindowState = FormWindowState.Minimized; return true;
                case "close": BeginInvoke(new Action(Close)); return true;
                case "drag":
                    Native.ReleaseCapture();
                    Native.SendMessage(Handle, Native.WM_NCLBUTTONDOWN, new IntPtr(Native.HTCAPTION), IntPtr.Zero);
                    return true;
                default: throw new InvalidOperationException("Unknown request: " + cmd);
            }
        }

        private Dictionary<string, object> Info()
        {
            var state = Json.ReadFile(Path.Combine(Paths.MachineData, "state.json"));
            return new Dictionary<string, object>
            {
                { "preview", false },
                { "mode", ModeName },
                { "isAdmin", Native.IsAdmin() },
                { "version", Program.Version },
                { "hasBattery", SystemInformation.PowerStatus.BatteryChargeStatus != BatteryChargeStatus.NoSystemBattery },
                { "windows", WindowsInfo.Read() },
                { "setupDone", Json.Bool(state, "setupDone", false) },
                { "state", state },
                { "look", Json.ReadFile(Path.Combine(Paths.UserData, "look.json")) },
                { "wallpaper", WallpaperController.Status() }
            };
        }

        private bool StartRun(string script, Dictionary<string, object> args)
        {
            if (!Native.IsAdmin()) throw new InvalidOperationException("Setup needs administrator rights. Open it again from V1 Settings.");
            if (busy) throw new InvalidOperationException("V1 is already working.");
            string extra = "";
            Dictionary<string, object> look = null;
            if (script == "apply.ps1")
            {
                var config = Json.Obj(Json.Get(args, "config"));
                look = Json.Obj(Json.Get(config, "look"));
                string file = Path.Combine(Paths.Ensure(Paths.MachineData), "setup-choices.json");
                Json.WriteFile(file, config);
                extra = "-Config \"" + file + "\"";
            }
            Task<int> run;
            busy = true;
            try { run = PlaybookRunner.RunAsync(script, extra, e => Emit("ps", e)); }
            catch (Exception) { busy = false; throw; } // e.g. a missing playbook file: report it, keep the window closable
            run.ContinueWith(t =>
            {
                int code = t.IsFaulted ? -1 : t.Result;
                if (t.IsFaulted) Log.Write(script + " could not start: " + t.Exception);
                if (code == 0 && look != null) SaveWallpaperChoice(look);
                BeginInvoke(new Action(() => { busy = false; Emit("finished", new Dictionary<string, object> { { "exitCode", code } }); }));
            });
            return true;
        }

        private static void SaveWallpaperChoice(Dictionary<string, object> look)
        {
            try
            {
                var c = WallpaperConfig.Load();
                c.Style = Json.Str(look, "wallpaper", "chrome");
                c.Enabled = Json.Bool(look, "live", false);
                c.Normalize();
                c.Save();
            }
            catch (Exception ex) { Log.Write("Could not save wallpaper choice: " + ex.Message); }
        }

        private async Task<object> Appearance(Dictionary<string, object> args)
        {
            if (busy) throw new InvalidOperationException("V1 is already working.");
            busy = true;
            try
            {
                var config = new Dictionary<string, object> { { "look", Json.Obj(Json.Get(args, "look")) } };
                string file = Path.Combine(Paths.Ensure(Paths.UserData), "appearance-choices.json");
                Json.WriteFile(file, config);
                int warnings = 0;
                int code = await PlaybookRunner.RunAsync("apply.ps1", "-Config \"" + file + "\" -Only appearance", e =>
                {
                    if (Json.Str(e, "t", "") == "summary") warnings = Json.Int(e, "warnings", 0);
                }, 120000);
                if (code != 0) throw new InvalidOperationException("Some appearance settings could not be applied. Details are in the log.");
                // Keep the live wallpaper in step with a style chosen here.
                var w = WallpaperController.Status();
                if (Json.Str(w, "status", "") == "running") WallpaperController.SignalReload();
                return new Dictionary<string, object> { { "ok", true }, { "warnings", warnings } };
            }
            finally { busy = false; }
        }

        private static object SetWallpaper(Dictionary<string, object> args)
        {
            var c = WallpaperConfig.Load();
            c.Enabled = Json.Bool(args, "enabled", c.Enabled);
            c.Style = Json.Str(args, "style", c.Style);
            c.Fps = Json.Int(args, "fps", c.Fps);
            c.PauseOnBattery = Json.Bool(args, "pauseOnBattery", c.PauseOnBattery);
            return WallpaperController.Apply(c);
        }

        private static void OpenLogs()
        {
            string machine = Path.Combine(Paths.MachineData, "logs");
            string dir = Directory.Exists(machine) ? machine : Paths.Ensure(Path.Combine(Paths.UserData, "logs"));
            Process.Start(new ProcessStartInfo("explorer.exe", "\"" + dir + "\"") { UseShellExecute = true });
        }
    }
}
