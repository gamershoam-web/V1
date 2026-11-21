using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace V1App
{
    internal static class Program
    {
        public const string Version = "1.0.0";

        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.ThreadException += (s, e) => Log.Write("Unhandled: " + e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Log.Write("Fatal: " + e.ExceptionObject);

            bool Has(string flag) { return args.Any(a => string.Equals(a, flag, StringComparison.OrdinalIgnoreCase)); }

            var state = Json.ReadFile(Path.Combine(Paths.MachineData, "state.json"));
            bool setupDone = Json.Bool(state, "setupDone", false);

            Mode mode;
            if (Has("--wallpaper")) mode = Mode.Wallpaper;
            else if (Has("--revert")) mode = Mode.Revert;
            else if (Has("--settings")) mode = Mode.Settings;
            else if (Has("--setup")) mode = Mode.Setup;
            else mode = setupDone ? Mode.Settings : Mode.Setup;

            if (mode == Mode.Wallpaper) return WallpaperHost.Run();

            // The first sign-in launches setup once; after that, only an explicit request (--force) reopens it.
            if (mode == Mode.Setup && Has("--firstboot") && setupDone) return 0;

            if ((mode == Mode.Setup || mode == Mode.Revert) && !Native.IsAdmin())
            {
                string pass = string.Join(" ", args.Where(a => a.StartsWith("--", StringComparison.Ordinal)).DefaultIfEmpty(mode == Mode.Revert ? "--revert" : "--setup"));
                return StartElevated(pass) ? 0 : 1;
            }

            Log.Name = mode == Mode.Settings ? "settings" : "setup";
            bool created;
            using (var mutex = new Mutex(true, @"Local\V1App." + mode, out created))
            {
                if (!created)
                {
                    BringToFront(mode == Mode.Settings ? "V1 Settings" : "V1 Setup");
                    return 0;
                }
                if (Has("--firstboot")) WaitForDesktop();
                Application.Run(new AppWindow(mode));
                GC.KeepAlive(mutex);
            }
            return 0;
        }

        /// <summary>Starts V1App elevated. Returns false if the person declined the UAC prompt.</summary>
        public static bool StartElevated(string arguments)
        {
            try
            {
                Process.Start(new ProcessStartInfo(Paths.Exe, arguments) { UseShellExecute = true, Verb = "runas" });
                return true;
            }
            catch (Win32Exception ex) when (ex.NativeErrorCode == 1223) // ERROR_CANCELLED
            {
                return false;
            }
        }

        /// <summary>At first sign-in, wait until the taskbar exists so the setup window opens on a ready desktop.</summary>
        private static void WaitForDesktop()
        {
            var sw = Stopwatch.StartNew();
            while (Native.FindWindow("Shell_TrayWnd", null) == IntPtr.Zero && sw.Elapsed < TimeSpan.FromSeconds(120)) Thread.Sleep(500);
            Thread.Sleep(2500);
        }

        private static void BringToFront(string title)
        {
            IntPtr h = Native.FindWindow(null, title);
            if (h == IntPtr.Zero) return;
            Native.ShowWindow(h, 9); // SW_RESTORE
            Native.SetForegroundWindow(h);
        }
    }
}
