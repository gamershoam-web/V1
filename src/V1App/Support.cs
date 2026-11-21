using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace V1App
{
    internal static class Paths
    {
        public static readonly string Exe = Application.ExecutablePath;
        public static readonly string Root = Path.GetDirectoryName(Exe);
        public static string Web { get { return Path.Combine(Root, "web"); } }
        public static string Playbook { get { return Path.Combine(Root, "playbook"); } }
        public static string Wallpapers { get { return Path.Combine(Root, "wallpapers"); } }
        public static string MachineData { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "V1"); } }
        public static string UserData { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "V1"); } }

        /// <summary>64-bit Windows PowerShell even if this process were ever 32-bit (32-bit PowerShell sees a redirected registry).</summary>
        public static string PowerShell
        {
            get
            {
                string win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                string sys = (Environment.Is64BitOperatingSystem && !Environment.Is64BitProcess) ? Path.Combine(win, "Sysnative") : Environment.SystemDirectory;
                return Path.Combine(sys, "WindowsPowerShell", "v1.0", "powershell.exe");
            }
        }

        public static string Ensure(string dir)
        {
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    internal static class Json
    {
        private static readonly JavaScriptSerializer S = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 64 };

        public static object Parse(string text) { return S.DeserializeObject(text); }
        public static string Write(object value) { return S.Serialize(value); }

        public static Dictionary<string, object> Obj(object o)
        {
            return o as Dictionary<string, object> ?? new Dictionary<string, object>();
        }

        public static object Get(Dictionary<string, object> d, string key)
        {
            object v;
            return d != null && d.TryGetValue(key, out v) ? v : null;
        }

        public static string Str(Dictionary<string, object> d, string key, string fallback)
        {
            return Get(d, key) as string ?? fallback;
        }

        public static bool Bool(Dictionary<string, object> d, string key, bool fallback)
        {
            object v = Get(d, key);
            return v is bool ? (bool)v : fallback;
        }

        public static int Int(Dictionary<string, object> d, string key, int fallback)
        {
            object v = Get(d, key);
            if (v == null) return fallback;
            try { return Convert.ToInt32(v, System.Globalization.CultureInfo.InvariantCulture); }
            catch (Exception) { return fallback; }
        }

        public static Dictionary<string, object> ReadFile(string path)
        {
            try { return File.Exists(path) ? Parse(File.ReadAllText(path, Encoding.UTF8)) as Dictionary<string, object> : null; }
            catch (Exception ex) { Log.Write("Could not read " + path + ": " + ex.Message); return null; }
        }

        public static void WriteFile(string path, object value)
        {
            Paths.Ensure(Path.GetDirectoryName(path));
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, Write(value), new UTF8Encoding(false));
            if (File.Exists(path)) File.Replace(tmp, path, null);
            else File.Move(tmp, path);
        }
    }

    internal static class Log
    {
        private static readonly object Gate = new object();
        public static string Name = "app";

        public static void Write(string line)
        {
            try
            {
                lock (Gate)
                {
                    string dir = Paths.Ensure(Path.Combine(Paths.UserData, "logs"));
                    string file = Path.Combine(dir, Name + ".log");
                    var fi = new FileInfo(file);
                    if (fi.Exists && fi.Length > 512 * 1024) File.Delete(file);
                    File.AppendAllText(file, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + line + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch (Exception) { /* logging must never break the app */ }
        }
    }

    internal static class WindowsInfo
    {
        public static Dictionary<string, object> Read()
        {
            using (var k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
            {
                string product = k == null ? "Windows" : (k.GetValue("ProductName") as string ?? "Windows");
                string display = k == null ? "" : (k.GetValue("DisplayVersion") as string ?? k.GetValue("ReleaseId") as string ?? "");
                string build = k == null ? "0" : (k.GetValue("CurrentBuildNumber") as string ?? "0");
                object ubr = k == null ? null : k.GetValue("UBR");
                int b;
                int.TryParse(build, out b);
                // Windows 11 still reports "Windows 10" in ProductName; the build number is what tells them apart.
                if (b >= 22000) product = product.Replace("Windows 10", "Windows 11");
                return new Dictionary<string, object>
                {
                    { "name", product },
                    { "displayVersion", display },
                    { "build", build + (ubr != null ? "." + ubr : "") },
                    { "buildNumber", b }
                };
            }
        }
    }
}
