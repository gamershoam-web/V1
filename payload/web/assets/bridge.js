/* V1 bridge: page <-> V1App.exe over WebView2 messaging.
   V1.call(cmd, args) -> Promise(result)      request/response
   V1.on(event, fn)                            host-pushed events: "ps" (playbook progress), "finished", "wallpaper"
   Outside V1App (a normal browser) a preview host answers instead, so the pages can be demoed safely:
   nothing in preview mode touches the machine. */
(function () {
  "use strict";
  var wv = window.chrome && window.chrome.webview;
  var pending = {}, seq = 0, handlers = {};

  function emit(ev, data) {
    (handlers[ev] || []).slice().forEach(function (f) {
      try { f(data); } catch (e) { if (window.console) { console.error(e); } }
    });
  }
  function on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }

  if (wv) {
    wv.addEventListener("message", function (e) {
      var m = e.data;
      if (!m || typeof m !== "object") { return; }
      if (m.id && pending[m.id]) {
        var p = pending[m.id]; delete pending[m.id];
        if (m.ok) { p.res(m.result); } else { p.rej(new Error(m.error || "The request failed.")); }
      } else if (m.event) {
        emit(m.event, m.data);
      }
    });
  }

  function call(cmd, args) {
    if (!wv) { return Preview.call(cmd, args || {}); }
    return new Promise(function (res, rej) {
      var id = ++seq;
      pending[id] = { res: res, rej: rej };
      wv.postMessage({ id: id, cmd: cmd, args: args || {} });
    });
  }

  /* ---------------- preview host (browser only) ---------------- */
  var Preview = (function () {
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var wall = { enabled: true, style: "chrome", fps: 30, pauseOnBattery: true };
    var CHECKS = {
      windows: { status: "ok", detail: "24H2 · 26100" },
      admin: { status: "ok", detail: "yes" },
      space: { status: "ok", detail: "112 GB free" },
      reboot: { status: "ok", detail: "none pending" },
      internet: { status: "ok", detail: "connected" },
      restore: { status: "ok", detail: "V1-before" }
    };
    var APPLY = [
      [0, "Removed Clipchamp.Clipchamp"], [0, "Removed Microsoft.BingNews"], [0, "Removed Microsoft.BingWeather"],
      [0, "Removed Microsoft.GetHelp"], [0, "Removed Microsoft.MicrosoftSolitaireCollection"], [0, "Removed MSTeams"],
      [0, "Removed Microsoft.Copilot"], [1, "Telemetry policy set to off"], [1, "DiagTrack service disabled"],
      [1, "Start, lock screen and Settings suggestions off"], [1, "Web results in Start search off"],
      [1, "Advertising ID off"], [2, "Disabled task Consolidator"], [2, "Disabled task QueueReporting"],
      [3, "Ultimate Performance power plan active"], [3, "Background game recording off"],
      [3, "Mouse acceleration off"], [4, "Feature upgrades held at 24H2"], [5, "Dark theme"],
      [5, "Accent #27C6FF"], [5, "Taskbar centred, Task View hidden"], [5, "Wallpaper set"], [6, "Saved C:\\ProgramData\\V1\\state.json"]
    ];
    var STAGES = ["Removing apps", "Privacy", "Services & tasks", "Performance", "Updates", "Appearance", "Finishing"];
    var REVERT = [[0, "Restored 61 registry values"], [1, "Restored 4 services"], [2, "Re-enabled 9 tasks"], [3, "Previous wallpaper restored"]];
    var REVERT_STAGES = ["Registry", "Services", "Scheduled tasks", "Finishing"];

    function simulate(list, stages, summary) {
      setTimeout(async function () {
        emit("ps", { t: "stages", names: stages });
        for (var i = 0; i < list.length; i++) {
          emit("ps", { t: "stage", i: list[i][0] });
          await wait(260 + Math.random() * 260);
          emit("ps", { t: "log", ok: true, msg: list[i][1] });
          emit("ps", { t: "pct", v: Math.round((i + 1) / list.length * 100) });
        }
        emit("ps", Object.assign({ t: "summary" }, summary));
        await wait(300);
        emit("finished", { exitCode: 0 });
      }, 200);
    }

    return {
      call: async function (cmd, a) {
        switch (cmd) {
          case "info":
            return {
              preview: true, isAdmin: true, version: "1.0.0", hasBattery: false,
              windows: { name: "Windows 11 Pro", displayVersion: "24H2", build: "26100.2894" },
              setupDone: location.pathname.indexOf("settings") >= 0,
              state: { profile: "gaming", appliedAt: "2026-11-21T10:24:00" },
              wallpaper: Object.assign({ status: wall.enabled ? "running" : "off" }, wall)
            };
          case "check":
            await wait(450 + Math.random() * 700);
            return CHECKS[a.id] || { status: "ok", detail: "" };
          case "apply":
            simulate(APPLY, STAGES, { apps: 19, tweaks: 74, services: 4, tasks: 9, warnings: 0, reboot: true });
            return true;
          case "revert":
            simulate(REVERT, REVERT_STAGES, { restored: 61, services: 4, tasks: 9, warnings: 0, reboot: true });
            return true;
          case "wallpaper.get":
            return Object.assign({ status: wall.enabled ? "running" : "off" }, wall);
          case "wallpaper.set":
            Object.assign(wall, a);
            await wait(250);
            return Object.assign({ status: wall.enabled ? "running" : "off" }, wall);
          case "appearance":
            await wait(900);
            return { ok: true };
          default:
            await wait(150);
            return true;
        }
      }
    };
  })();

  window.V1 = { host: !!wv, call: call, on: on };

  /* frameless window: the title bar drags the window, buttons map to the host */
  document.addEventListener("DOMContentLoaded", function () {
    var drag = document.querySelector(".titlebar .drag");
    if (drag) {
      drag.addEventListener("mousedown", function (e) { if (e.button === 0) { call("drag"); } });
      drag.addEventListener("dblclick", function (e) { e.preventDefault(); });
    }
    var min = document.querySelector("[data-win=min]");
    var close = document.querySelector("[data-win=close]");
    if (min) { min.addEventListener("click", function () { call("minimize"); }); }
    if (close) { close.addEventListener("click", function () { call("close"); }); }
  });
})();
