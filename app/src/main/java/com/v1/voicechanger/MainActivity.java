package com.v1.voicechanger;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.method.LinkMovementMethod;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import com.v1.voicechanger.dsp.Presets;
import com.v1.voicechanger.dsp.VoiceParams;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity implements LiveVoiceService.Listener {
    private static final int C_BG = 0xFF0F1115;
    private static final int C_CARD = 0xFF1A1D24;
    private static final int C_ACCENT = 0xFF8B5CF6;
    private static final int C_TEXT = 0xFFECEDEF;
    private static final int C_MUTED = 0xFF9AA0AA;
    private static final int C_OK = 0xFF34D399;
    private static final int C_WARN = 0xFFF59E0B;

    private static final int REQ_MIC = 1;

    private SharedPreferences prefs;
    private VoiceParams current;
    private String presetId;
    private boolean updatingUi;

    private final List<Button> presetButtons = new ArrayList<>();
    private final List<Slider> sliders = new ArrayList<>();
    private Button monitorBtn, recordBtn, playBtn, shareBtn;
    private TextView clipInfo;
    private Runnable pendingMicAction;
    private MediaPlayer player;

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(C_BG);
        getWindow().setNavigationBarColor(C_BG);
        prefs = Settings.open(this);
        current = Settings.readParams(Settings.reader(prefs));
        presetId = prefs.getString(Settings.K_PRESET, "normal");
        LiveVoiceService.setParams(current);
        setContentView(buildUi());
        refreshPresetButtons();
        refreshSliders();
    }

    @Override
    protected void onResume() {
        super.onResume();
        LiveVoiceService.setListener(this);
        refreshLiveButtons();
    }

    @Override
    protected void onPause() {
        super.onPause();
        LiveVoiceService.setListener(null);
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    @Override
    public void onStateChanged() {
        runOnUiThread(this::refreshLiveButtons);
    }

    // ---------------------------------------------------------------- UI building

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFitsSystemWindows(true);
        scroll.setBackgroundColor(C_BG);
        LinearLayout root = vertical();
        root.setPadding(dp(16), dp(20), dp(16), dp(32));
        scroll.addView(root);

        TextView title = text(getString(R.string.app_name), 26, C_TEXT);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);
        TextView subtitle = text(getString(R.string.tagline), 14, C_MUTED);
        subtitle.setPadding(0, dp(4), 0, dp(16));
        root.addView(subtitle);

        root.addView(buildCallCard());
        root.addView(buildPresetCard());
        root.addView(buildTuneCard());
        root.addView(buildTryCard());
        root.addView(buildHelpCard());
        return scroll;
    }

    private View buildCallCard() {
        LinearLayout card = card();
        boolean hooked = ModuleStatus.isHookedIntoSelf();
        boolean shared = Settings.canShareWithHookedApps(this);
        boolean active = hooked || shared;

        card.addView(sectionTitle(getString(R.string.call_title)));
        TextView status = text(active ? getString(R.string.status_active) : getString(R.string.status_inactive),
                14, active ? C_OK : C_WARN);
        status.setTypeface(Typeface.DEFAULT_BOLD);
        status.setPadding(0, 0, 0, dp(6));
        card.addView(status);
        card.addView(text(active ? getString(R.string.status_active_desc) : getString(R.string.status_inactive_desc),
                13, C_MUTED));

        Switch sw = new Switch(this);
        sw.setText(R.string.enable_in_calls);
        sw.setTextColor(C_TEXT);
        sw.setTextSize(16);
        sw.setPadding(0, dp(12), 0, 0);
        sw.setChecked(prefs.getBoolean(Settings.K_ENABLED, false));
        sw.setOnCheckedChangeListener((b, on) -> {
            prefs.edit().putBoolean(Settings.K_ENABLED, on).apply();
            if (on && !active) {
                Toast.makeText(this, R.string.toast_needs_lsposed, Toast.LENGTH_LONG).show();
            }
        });
        card.addView(sw);
        return card;
    }

    private View buildPresetCard() {
        LinearLayout card = card();
        card.addView(sectionTitle(getString(R.string.voices_title)));
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(3);
        for (int i = 0; i < Presets.IDS.length; i++) {
            final String id = Presets.IDS[i];
            Button b = pill(Presets.NAMES[i]);
            b.setTag(id);
            b.setOnClickListener(v -> selectPreset(id));
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams(
                    GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            lp.width = 0;
            lp.setMargins(dp(3), dp(3), dp(3), dp(3));
            grid.addView(b, lp);
            presetButtons.add(b);
        }
        card.addView(grid);
        return card;
    }

    private View buildTuneCard() {
        LinearLayout card = card();
        card.addView(sectionTitle(getString(R.string.tune_title)));
        addSlider(card, R.string.s_pitch, -12, 12, 0.5f, " st", () -> current.pitch, v -> current.pitch = v);
        addSlider(card, R.string.s_treble, -12, 12, 1f, " dB", () -> current.treble, v -> current.treble = v);
        addSlider(card, R.string.s_robot, 0, 100, 1f, "%", () -> current.robot * 100f, v -> current.robot = v / 100f);
        addSlider(card, R.string.s_wobble, 0, 8, 0.1f, " ms", () -> current.wobbleMs, v -> current.wobbleMs = v);
        addSlider(card, R.string.s_echo, 0, 100, 1f, "%", () -> current.echoMix * 100f, v -> current.echoMix = v / 100f);
        addSlider(card, R.string.s_drive, 0, 100, 1f, "%", () -> current.drive * 100f, v -> current.drive = v / 100f);
        addSlider(card, R.string.s_volume, -12, 12, 1f, " dB", () -> current.gainDb, v -> current.gainDb = v);
        return card;
    }

    private View buildTryCard() {
        LinearLayout card = card();
        card.addView(sectionTitle(getString(R.string.try_title)));
        card.addView(text(getString(R.string.try_desc), 13, C_MUTED));

        LinearLayout row1 = horizontal();
        monitorBtn = pill("");
        monitorBtn.setOnClickListener(v -> withMic(this::toggleMonitor));
        recordBtn = pill("");
        recordBtn.setOnClickListener(v -> withMic(this::toggleRecord));
        row1.addView(monitorBtn, weight());
        row1.addView(recordBtn, weight());
        card.addView(row1);

        LinearLayout row2 = horizontal();
        playBtn = pill(getString(R.string.play_clip));
        playBtn.setOnClickListener(v -> playLastClip());
        shareBtn = pill(getString(R.string.share_clip));
        shareBtn.setOnClickListener(v -> shareLastClip());
        row2.addView(playBtn, weight());
        row2.addView(shareBtn, weight());
        card.addView(row2);

        clipInfo = text("", 12, C_MUTED);
        clipInfo.setPadding(0, dp(6), 0, 0);
        card.addView(clipInfo);
        return card;
    }

    private View buildHelpCard() {
        LinearLayout card = card();
        card.addView(sectionTitle(getString(R.string.help_title)));
        TextView t = text(getString(R.string.help_body), 13, C_MUTED);
        t.setLineSpacing(0, 1.25f);
        t.setMovementMethod(LinkMovementMethod.getInstance());
        card.addView(t);
        return card;
    }

    // ---------------------------------------------------------------- presets & sliders

    private void selectPreset(String id) {
        presetId = id;
        current = Presets.get(id);
        save();
        refreshPresetButtons();
        refreshSliders();
    }

    private void save() {
        SharedPreferences.Editor e = prefs.edit();
        Settings.writeParams(e, current);
        e.putString(Settings.K_PRESET, presetId);
        e.apply();
        LiveVoiceService.setParams(current);
    }

    private void refreshPresetButtons() {
        for (Button b : presetButtons) styleSelected(b, b.getTag().equals(presetId));
    }

    private void refreshSliders() {
        updatingUi = true;
        for (Slider s : sliders) s.refresh();
        updatingUi = false;
    }

    private interface Getter {
        float get();
    }

    private interface Setter {
        void set(float v);
    }

    private final class Slider {
        final SeekBar bar;
        final TextView value;
        final float min, step;
        final String unit;
        final Getter getter;

        Slider(SeekBar bar, TextView value, float min, float step, String unit, Getter g) {
            this.bar = bar;
            this.value = value;
            this.min = min;
            this.step = step;
            this.unit = unit;
            this.getter = g;
        }

        float valueOf(int progress) {
            return min + progress * step;
        }

        void refresh() {
            bar.setProgress(Math.round((getter.get() - min) / step));
            showValue();
        }

        void showValue() {
            float v = valueOf(bar.getProgress());
            String s = step < 1f ? String.format(Locale.US, "%.1f", v) : String.valueOf(Math.round(v));
            if (min < 0 && v > 0) s = "+" + s;
            value.setText(s + unit);
        }
    }

    private void addSlider(LinearLayout parent, int label, float min, float max, float step, String unit,
                           Getter getter, Setter setter) {
        LinearLayout head = horizontal();
        head.setPadding(0, dp(8), 0, 0);
        TextView name = text(getString(label), 14, C_TEXT);
        TextView value = text("", 14, C_ACCENT);
        value.setGravity(Gravity.END);
        head.addView(name, weight());
        head.addView(value, weight());
        parent.addView(head);

        SeekBar bar = new SeekBar(this);
        bar.setMax(Math.round((max - min) / step));
        parent.addView(bar);

        final Slider s = new Slider(bar, value, min, step, unit, getter);
        sliders.add(s);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                s.showValue();
                if (updatingUi || !fromUser) return;
                setter.set(s.valueOf(progress));
                presetId = "custom";
                refreshPresetButtons();
                save();
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
            }
        });
    }

    // ---------------------------------------------------------------- live monitor / recording

    private void withMic(Runnable action) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            action.run();
            return;
        }
        pendingMicAction = action;
        List<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS);
        requestPermissions(perms.toArray(new String[0]), REQ_MIC);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_MIC) return;
        Runnable action = pendingMicAction;
        pendingMicAction = null;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            if (action != null) action.run();
        } else {
            Toast.makeText(this, R.string.toast_mic_denied, Toast.LENGTH_LONG).show();
        }
    }

    private void toggleMonitor() {
        boolean monitorOn = !LiveVoiceService.isMonitoring();
        boolean rec = LiveVoiceService.isRecording();
        if (!monitorOn && !rec) {
            LiveVoiceService.stop(this);
        } else {
            if (monitorOn) Toast.makeText(this, R.string.toast_headphones, Toast.LENGTH_SHORT).show();
            releasePlayer();
            LiveVoiceService.start(this, monitorOn, rec);
        }
        monitorBtn.postDelayed(this::refreshLiveButtons, 200);
    }

    private void toggleRecord() {
        boolean recOn = !LiveVoiceService.isRecording();
        boolean mon = LiveVoiceService.isMonitoring();
        if (!recOn && !mon) {
            LiveVoiceService.stop(this);
        } else {
            releasePlayer();
            LiveVoiceService.start(this, mon, recOn);
        }
        recordBtn.postDelayed(this::refreshLiveButtons, 200);
    }

    private void refreshLiveButtons() {
        if (monitorBtn == null) return;
        boolean mon = LiveVoiceService.isMonitoring();
        boolean rec = LiveVoiceService.isRecording();
        monitorBtn.setText(mon ? R.string.monitor_stop : R.string.monitor_start);
        styleSelected(monitorBtn, mon);
        recordBtn.setText(rec ? R.string.record_stop : R.string.record_start);
        styleSelected(recordBtn, rec);
        File clip = LiveVoiceService.lastClip();
        boolean hasClip = clip != null && clip.isFile() && !rec;
        playBtn.setEnabled(hasClip);
        shareBtn.setEnabled(hasClip);
        playBtn.setAlpha(hasClip ? 1f : 0.4f);
        shareBtn.setAlpha(hasClip ? 1f : 0.4f);
        if (rec) clipInfo.setText(R.string.recording_now);
        else if (hasClip) clipInfo.setText(getString(R.string.last_clip, clip.getName(), clip.length() / 1024));
        else clipInfo.setText("");
    }

    private void playLastClip() {
        File clip = LiveVoiceService.lastClip();
        if (clip == null) return;
        releasePlayer();
        try {
            player = new MediaPlayer();
            player.setDataSource(clip.getAbsolutePath());
            player.setOnCompletionListener(mp -> releasePlayer());
            player.prepare();
            player.start();
        } catch (Exception e) {
            releasePlayer();
            Toast.makeText(this, R.string.toast_play_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private void releasePlayer() {
        if (player != null) {
            player.release();
            player = null;
        }
    }

    private void shareLastClip() {
        File clip = LiveVoiceService.lastClip();
        if (clip == null) return;
        Uri uri = ClipProvider.uriFor(clip);
        Intent send = new Intent(Intent.ACTION_SEND)
                .setType("audio/wav")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(send, getString(R.string.share_clip)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.toast_no_share, Toast.LENGTH_SHORT).show();
        }
    }

    // ---------------------------------------------------------------- view helpers

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private LinearLayout vertical() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private LinearLayout horizontal() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    private LinearLayout.LayoutParams weight() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(3), dp(3), dp(3), dp(3));
        return lp;
    }

    private LinearLayout card() {
        LinearLayout c = vertical();
        c.setPadding(dp(16), dp(14), dp(16), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(C_CARD);
        bg.setCornerRadius(dp(16));
        c.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(14);
        c.setLayoutParams(lp);
        return c;
    }

    private TextView text(String s, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        return t;
    }

    private TextView sectionTitle(String s) {
        TextView t = text(s, 17, C_TEXT);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, 0, 0, dp(8));
        return t;
    }

    private Button pill(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setMinHeight(dp(44));
        b.setStateListAnimator(null);
        styleSelected(b, false);
        return b;
    }

    private void styleSelected(Button b, boolean selected) {
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(12));
        bg.setColor(selected ? C_ACCENT : 0xFF262A33);
        b.setBackground(bg);
        b.setTextColor(selected ? Color.WHITE : C_TEXT);
    }
}
