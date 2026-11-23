package dev.lumen.client.voice;

import dev.lumen.Lumen;
import dev.lumen.voice.Adpcm;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.DataLine;
import javax.sound.sampled.Line;
import javax.sound.sampled.Mixer;
import javax.sound.sampled.TargetDataLine;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/** Captures 20 ms frames of 16 kHz mono audio on its own thread. */
public final class Microphone {
	public static final AudioFormat FORMAT = new AudioFormat(Adpcm.SAMPLE_RATE, 16, 1, true, false);

	private final Consumer<short[]> sink;
	private volatile Thread thread;
	private volatile TargetDataLine line;
	private volatile String error;

	public Microphone(Consumer<short[]> sink) {
		this.sink = sink;
	}

	public boolean isRunning() {
		return thread != null;
	}

	public String error() {
		return error;
	}

	public String deviceName() {
		TargetDataLine l = line;
		return l == null ? "none" : l.getLineInfo().toString();
	}

	public static List<String> listDevices() {
		List<String> names = new ArrayList<>();
		Line.Info info = new DataLine.Info(TargetDataLine.class, FORMAT);
		for (Mixer.Info mixerInfo : AudioSystem.getMixerInfo()) {
			try {
				if (AudioSystem.getMixer(mixerInfo).isLineSupported(info)) names.add(mixerInfo.getName());
			} catch (Exception ignored) {
			}
		}
		return names;
	}

	public synchronized void start(String preferredDevice) {
		if (thread != null) return;
		try {
			DataLine.Info info = new DataLine.Info(TargetDataLine.class, FORMAT);
			TargetDataLine opened = null;
			if (preferredDevice != null && !preferredDevice.isBlank()) {
				String wanted = preferredDevice.toLowerCase(Locale.ROOT);
				for (Mixer.Info mixerInfo : AudioSystem.getMixerInfo()) {
					if (!mixerInfo.getName().toLowerCase(Locale.ROOT).contains(wanted)) continue;
					Mixer mixer = AudioSystem.getMixer(mixerInfo);
					if (mixer.isLineSupported(info)) {
						opened = (TargetDataLine) mixer.getLine(info);
						break;
					}
				}
			}
			if (opened == null) opened = (TargetDataLine) AudioSystem.getLine(info);
			opened.open(FORMAT, Adpcm.FRAME_SAMPLES * 2 * 6);
			opened.start();
			this.line = opened;
			this.error = null;
		} catch (Exception | LinkageError e) {
			this.error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
			Lumen.LOGGER.warn("Lumen voice: no microphone available ({})", error);
			return;
		}
		Thread t = new Thread(this::run, "Lumen Microphone");
		t.setDaemon(true);
		this.thread = t;
		t.start();
	}

	public synchronized void stop() {
		Thread t = thread;
		thread = null;
		TargetDataLine l = line;
		line = null;
		if (l != null) {
			try {
				l.stop();
				l.close();
			} catch (Exception ignored) {
			}
		}
		if (t != null) t.interrupt();
	}

	private void run() {
		byte[] bytes = new byte[Adpcm.FRAME_SAMPLES * 2];
		while (thread == Thread.currentThread()) {
			TargetDataLine l = line;
			if (l == null) break;
			int read = 0;
			while (read < bytes.length && thread == Thread.currentThread()) {
				int n = l.read(bytes, read, bytes.length - read);
				if (n <= 0) break;
				read += n;
			}
			if (read < bytes.length) continue;
			short[] frame = new short[Adpcm.FRAME_SAMPLES];
			for (int i = 0; i < frame.length; i++) {
				frame[i] = (short) ((bytes[i * 2] & 0xFF) | (bytes[i * 2 + 1] << 8));
			}
			try {
				sink.accept(frame);
			} catch (Exception e) {
				Lumen.LOGGER.warn("Lumen voice: error processing microphone frame", e);
			}
		}
	}
}
