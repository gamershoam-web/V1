package com.v1.voicechanger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.Process;
import android.util.Log;

import com.v1.voicechanger.dsp.VoiceParams;
import com.v1.voicechanger.dsp.VoiceProcessor;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Standalone (no root) mode: microphone -> voice effect -> headphones and/or a WAV clip.
 * Runs as a microphone foreground service so it keeps working with the screen off.
 */
public final class LiveVoiceService extends Service {
    private static final String TAG = "V1VoiceChanger";
    private static final String CHANNEL = "live";
    private static final int SAMPLE_RATE = 48000;

    public static final String EXTRA_MONITOR = "monitor";
    public static final String EXTRA_RECORD = "record";

    /** Listener for UI state updates (called on the audio thread). */
    public interface Listener {
        void onStateChanged();
    }

    private static volatile VoiceParams params = new VoiceParams();
    private static volatile int paramsVersion;
    private static volatile boolean running;
    private static volatile boolean monitor;
    private static volatile boolean recording;
    private static volatile File lastClip;
    private static volatile Listener listener;

    private Thread worker;

    public static void setParams(VoiceParams p) {
        params = p.copy();
        paramsVersion++;
    }

    public static boolean isRunning() {
        return running;
    }

    public static boolean isMonitoring() {
        return running && monitor;
    }

    public static boolean isRecording() {
        return running && recording;
    }

    public static File lastClip() {
        return lastClip;
    }

    public static void setListener(Listener l) {
        listener = l;
    }

    public static void start(Context ctx, boolean monitorOn, boolean recordOn) {
        Intent i = new Intent(ctx, LiveVoiceService.class)
                .putExtra(EXTRA_MONITOR, monitorOn)
                .putExtra(EXTRA_RECORD, recordOn);
        ctx.startForegroundService(i);
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, LiveVoiceService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startInForeground();
        monitor = intent.getBooleanExtra(EXTRA_MONITOR, true);
        boolean wantRecord = intent.getBooleanExtra(EXTRA_RECORD, false);
        if (worker != null && worker.isAlive()) {
            // Already running: just update the mode. Recording toggles create a new file in the loop.
            recording = wantRecord;
            notifyListener();
            return START_NOT_STICKY;
        }
        recording = wantRecord;
        running = true;
        worker = new Thread(this::loop, "V1VoiceLoop");
        worker.start();
        notifyListener();
        return START_NOT_STICKY;
    }

    private void startInForeground() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL,
                getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(getString(R.string.notif_text))
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(1, n);
        }
    }

    @SuppressWarnings("MissingPermission")
    private void loop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO);
        int minIn = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int minOut = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int frame = SAMPLE_RATE / 100; // 10 ms
        AudioRecord rec = null;
        AudioTrack track = null;
        WavWriter wav = null;
        try {
            rec = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minIn, frame * 4));
            AudioTrack.Builder tb = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .build())
                    .setBufferSizeInBytes(Math.max(minOut, frame * 4))
                    .setTransferMode(AudioTrack.MODE_STREAM);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                tb.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY);
            }
            track = tb.build();
            rec.startRecording();
            track.play();

            VoiceProcessor proc = new VoiceProcessor(SAMPLE_RATE);
            int version = -1;
            short[] buf = new short[frame];
            boolean wasRecording = false;

            while (running) {
                int n = rec.read(buf, 0, buf.length);
                if (n <= 0) continue;
                if (version != paramsVersion) {
                    version = paramsVersion;
                    proc.setParams(params);
                }
                for (int i = 0; i < n; i++) {
                    int s = Math.round(proc.process(buf[i] / 32768f) * 32767f);
                    buf[i] = (short) Math.max(-32768, Math.min(32767, s));
                }

                boolean rec_ = recording;
                if (rec_ && !wasRecording) {
                    File f = new File(ClipProvider.clipsDir(this), "voice_" +
                            new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + ".wav");
                    wav = new WavWriter(f, SAMPLE_RATE);
                    lastClip = f;
                } else if (!rec_ && wasRecording && wav != null) {
                    wav.close();
                    wav = null;
                    notifyListener();
                }
                wasRecording = rec_;
                if (wav != null) wav.write(buf, n);

                if (monitor) {
                    track.write(buf, 0, n);
                }
            }
        } catch (Throwable t) {
            Log.e(TAG, "audio loop failed", t);
        } finally {
            if (wav != null) {
                try {
                    wav.close();
                } catch (Exception ignored) {
                }
            }
            if (rec != null) {
                try {
                    rec.stop();
                } catch (Exception ignored) {
                }
                rec.release();
            }
            if (track != null) {
                try {
                    track.stop();
                } catch (Exception ignored) {
                }
                track.release();
            }
            running = false;
            recording = false;
            notifyListener();
            stopSelf();
        }
    }

    private static void notifyListener() {
        Listener l = listener;
        if (l != null) l.onStateChanged();
    }

    @Override
    public void onDestroy() {
        running = false;
        Thread w = worker;
        if (w != null) {
            try {
                w.join(500);
            } catch (InterruptedException ignored) {
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
