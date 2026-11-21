using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace V1App
{
    /// <summary>Runs one playbook script in a hidden 64-bit Windows PowerShell and streams its "##V1 {json}" lines.</summary>
    internal static class PlaybookRunner
    {
        public static Task<int> RunAsync(string script, string args, Action<Dictionary<string, object>> onEvent, int timeoutMs = 0)
        {
            var tcs = new TaskCompletionSource<int>();
            string file = Path.Combine(Paths.Playbook, script);
            if (!File.Exists(file)) throw new FileNotFoundException("V1 is missing a file. Reinstall V1.", file);

            var psi = new ProcessStartInfo(Paths.PowerShell,
                "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + file + "\" " + args)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = new UTF8Encoding(false),
                StandardErrorEncoding = new UTF8Encoding(false),
                WorkingDirectory = Paths.Playbook
            };
            var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
            p.OutputDataReceived += (s, e) =>
            {
                if (e.Data == null || !e.Data.StartsWith("##V1 ", StringComparison.Ordinal)) return;
                try
                {
                    var o = Json.Parse(e.Data.Substring(5)) as Dictionary<string, object>;
                    if (o != null && onEvent != null) onEvent(o);
                }
                catch (Exception ex) { Log.Write("Bad progress line: " + ex.Message); }
            };
            p.ErrorDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) Log.Write(script + " stderr: " + e.Data); };
            p.Exited += (s, e) =>
            {
                p.WaitForExit(); // drains the redirected streams before reporting the exit
                int code = p.ExitCode;
                Log.Write(script + " exited with " + code);
                p.Dispose();
                tcs.TrySetResult(code);
            };
            Log.Write("Running " + script + " " + args);
            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            if (timeoutMs > 0)
            {
                Task.Delay(timeoutMs).ContinueWith(_ =>
                {
                    if (tcs.Task.IsCompleted) return;
                    try { p.Kill(); } catch (Exception) { /* exited meanwhile */ }
                    tcs.TrySetResult(-1);
                });
            }
            return tcs.Task;
        }
    }

    /// <summary>The checks on the "Checking this PC" screen. Each returns status ok / warn / fail, a short detail and an optional hint.</summary>
    internal static class Checks
    {
        private static Dictionary<string, object> R(string status, string detail, string hint = null)
        {
            var d = new Dictionary<string, object> { { "status", status }, { "detail", detail } };
            if (hint != null) d["hint"] = hint;
            return d;
        }

        public static Task<Dictionary<string, object>> Run(string id)
        {
            switch (id)
            {
                case "windows": return Task.Run(() => Windows());
                case "admin": return Task.FromResult(Native.IsAdmin() ? R("ok", "yes") : R("fail", "no", "Open V1 Setup from an administrator account."));
                case "space": return Task.Run(() => Space());
                case "reboot": return Task.Run(() => Reboot());
                case "internet": return Task.Run(() => Internet());
                case "restore": return RestorePoint();
                default: return Task.FromResult(R("warn", "unknown check"));
            }
        }

        private static Dictionary<string, object> Windows()
        {
            var w = WindowsInfo.Read();
            int build = (int)w["buildNumber"];
            string detail = (w["displayVersion"] as string) + " · " + build;
            if (build < 22000) return R("fail", detail, "V1 is made for Windows 11.");
            if (build < 22631) return R("warn", detail, "Windows 11 23H2 or newer is recommended. Run Windows Update first.");
            return R("ok", detail);
        }

        private static Dictionary<string, object> Space()
        {
            var drive = new DriveInfo(Path.GetPathRoot(Environment.SystemDirectory));
            double gb = drive.AvailableFreeSpace / 1073741824.0;
            string detail = gb.ToString("0") + " GB free";
            return gb >= 3 ? R("ok", detail) : R("warn", detail, "Less than 3 GB free. The restore point may not fit.");
        }

        private static Dictionary<string, object> Reboot()
        {
            string[] keys =
            {
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending",
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
            };
            foreach (var k in keys)
            {
                using (var key = Registry.LocalMachine.OpenSubKey(k))
                {
                    if (key != null) return R("warn", "restart pending", "Windows is waiting to restart after updates. Restarting first is safer.");
                }
            }
            return R("ok", "none pending");
        }

        private static Dictionary<string, object> Internet()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://www.msftconnecttest.com/connecttest.txt");
                req.Timeout = 5000;
                req.ReadWriteTimeout = 5000;
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var rd = new StreamReader(res.GetResponseStream()))
                {
                    if (rd.ReadToEnd().Contains("Microsoft Connect Test")) return R("ok", "connected");
                }
            }
            catch (Exception ex) { Log.Write("Internet check: " + ex.Message); }
            return R("warn", "offline", "No internet: a new browser can't be downloaded. Everything else works offline.");
        }

        private static async Task<Dictionary<string, object>> RestorePoint()
        {
            Dictionary<string, object> result = null;
            int code = await PlaybookRunner.RunAsync("checks.ps1", "", e => { if (Json.Str(e, "t", "") == "check") result = e; }, 300000);
            if (result == null) return R("warn", "not available", "The restore point could not be made (code " + code + "). V1 still records every change, so Undo works.");
            return R(Json.Str(result, "status", "warn"), Json.Str(result, "detail", ""), Json.Get(result, "hint") as string);
        }
    }
}
