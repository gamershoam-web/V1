package dev.lumen.client.voice;

import dev.lumen.Lumen;
import dev.lumen.voice.Adpcm;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.SourceDataLine;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Mixes every voice (other players, Lumen) into one stereo stream, positioned relative to the
 * camera with distance falloff and equal-power panning. Runs on its own thread; if no output
 * device exists it keeps time anyway so the rest of the system behaves the same.
 */
public final class VoiceMixer {
	public static final AudioFormat FORMAT = new AudioFormat(Adpcm.SAMPLE_RATE, 16, 2, true, false);
	private static final int N = Adpcm.FRAME_SAMPLES;

	public static final class Source {
		final ConcurrentLinkedQueue<short[]> frames = new ConcurrentLinkedQueue<>();
		final boolean clip;
		volatile boolean started;
		volatile float level;
		volatile long lastHeard;
		volatile float volume = 1.0f;

		Source(boolean clip) {
			this.clip = clip;
		}
	}

	private final Map<String, Source> sources = new ConcurrentHashMap<>();
	private final Map<String, Vec3d> positions = new ConcurrentHashMap<>();
	private volatile Vec3d listener = Vec3d.ZERO;
	private volatile float listenerYaw;
	private volatile float range = 48.0f;
	private volatile boolean outputAvailable;
	private final AtomicLong framesMixed = new AtomicLong();
	private final AtomicLong framesReceived = new AtomicLong();
	private Thread thread;

	public synchronized void ensureRunning() {
		if (thread != null) return;
		thread = new Thread(this::run, "Lumen Voice Mixer");
		thread.setDaemon(true);
		thread.start();
	}

	public void setRange(float range) {
		this.range = Math.max(4.0f, range);
	}

	public void setListener(Vec3d pos, float yaw) {
		this.listener = pos;
		this.listenerYaw = yaw;
	}

	public void setPosition(String key, Vec3d pos) {
		if (pos == null) positions.remove(key);
		else positions.put(key, pos);
	}

	public Iterable<String> activeKeys() {
		return sources.keySet();
	}

	/** Adds one live voice frame (players). */
	public void pushFrame(String key, short[] pcm, float volume) {
		Source source = sources.computeIfAbsent(key, k -> new Source(false));
		source.volume = volume;
		source.frames.add(pcm);
		framesReceived.incrementAndGet();
		// Keep latency bounded if we fall behind.
		while (source.frames.size() > 15) source.frames.poll();
	}

	/** Queues a whole clip (Lumen's speech). */
	public void pushClip(String key, short[] pcm, float volume) {
		Source source = sources.computeIfAbsent(key, k -> new Source(true));
		source.volume = volume;
		for (int i = 0; i < pcm.length; i += N) {
			short[] frame = new short[N];
			System.arraycopy(pcm, i, frame, 0, Math.min(N, pcm.length - i));
			source.frames.add(frame);
		}
	}

	public void clear() {
		sources.clear();
		positions.clear();
	}

	/** Current loudness (0-1) of a source, for HUD and the Lumen glow. */
	public float level(String key) {
		Source s = sources.get(key);
		if (s == null) return 0.0f;
		return System.currentTimeMillis() - s.lastHeard < 120 ? s.level : 0.0f;
	}

	public boolean isSpeaking(String key) {
		Source s = sources.get(key);
		return s != null && System.currentTimeMillis() - s.lastHeard < 250;
	}

	public boolean outputAvailable() {
		return outputAvailable;
	}

	public long framesMixed() {
		return framesMixed.get();
	}

	public long framesReceived() {
		return framesReceived.get();
	}

	private SourceDataLine openLine() {
		try {
			SourceDataLine line = AudioSystem.getSourceDataLine(FORMAT);
			line.open(FORMAT, N * 4 * 5);
			line.start();
			return line;
		} catch (Exception | LinkageError e) {
			Lumen.LOGGER.warn("Lumen voice: no audio output device ({}); voices will not be audible", e.getMessage());
			return null;
		}
	}

	private void run() {
		SourceDataLine line = openLine();
		outputAvailable = line != null;
		int[] left = new int[N];
		int[] right = new int[N];
		byte[] out = new byte[N * 4];
		long nextTick = System.nanoTime();
		while (true) {
			java.util.Arrays.fill(left, 0);
			java.util.Arrays.fill(right, 0);
			boolean any = false;
			long now = System.currentTimeMillis();
			for (Map.Entry<String, Source> entry : sources.entrySet()) {
				Source s = entry.getValue();
				if (!s.started) {
					int need = s.clip ? 1 : 3; // small jitter buffer for live voices
					if (s.frames.size() >= need) s.started = true;
					else {
						if (s.frames.isEmpty() && now - s.lastHeard > 30_000) sources.remove(entry.getKey(), s);
						continue;
					}
				}
				short[] frame = s.frames.poll();
				if (frame == null) {
					s.started = false;
					s.level = 0.0f;
					continue;
				}
				any = true;
				s.lastHeard = now;
				float[] lr = gains(entry.getKey());
				float gl = lr[0] * s.volume, gr = lr[1] * s.volume;
				long energy = 0;
				for (int i = 0; i < N; i++) {
					int v = frame[i];
					energy += (long) v * v;
					left[i] += (int) (v * gl);
					right[i] += (int) (v * gr);
				}
				s.level = (float) Math.min(1.0, Math.sqrt(energy / (double) N) / 8000.0);
			}
			for (int i = 0; i < N; i++) {
				int l = MathHelper.clamp(left[i], -32768, 32767);
				int r = MathHelper.clamp(right[i], -32768, 32767);
				out[i * 4] = (byte) l;
				out[i * 4 + 1] = (byte) (l >> 8);
				out[i * 4 + 2] = (byte) r;
				out[i * 4 + 3] = (byte) (r >> 8);
			}
			if (any) framesMixed.incrementAndGet();
			if (line != null) {
				line.write(out, 0, out.length); // blocks: paces the loop at real time
			} else {
				nextTick += 20_000_000L;
				long sleep = nextTick - System.nanoTime();
				if (sleep > 0) {
					try {
						Thread.sleep(sleep / 1_000_000L, (int) (sleep % 1_000_000L));
					} catch (InterruptedException e) {
						return;
					}
				} else if (sleep < -200_000_000L) {
					nextTick = System.nanoTime();
				}
			}
		}
	}

	private float[] gains(String key) {
		Vec3d pos = positions.get(key);
		if (pos == null) return new float[]{0.85f, 0.85f};
		Vec3d d = pos.subtract(listener);
		double dist = d.length();
		float r = range;
		float att = (float) Math.pow(MathHelper.clamp(1.0 - dist / r, 0.0, 1.0), 1.4);
		if (dist < 1.0) return new float[]{att, att};
		float yaw = listenerYaw * MathHelper.RADIANS_PER_DEGREE;
		double rightX = -MathHelper.cos(yaw), rightZ = -MathHelper.sin(yaw);
		double horiz = Math.sqrt(d.x * d.x + d.z * d.z);
		double pan = horiz < 1.0e-4 ? 0.0 : (d.x * rightX + d.z * rightZ) / horiz;
		pan *= 0.8; // never fully one-sided
		double angle = (pan + 1.0) * Math.PI / 4.0;
		return new float[]{(float) (Math.cos(angle) * 1.2 * att), (float) (Math.sin(angle) * 1.2 * att)};
	}
}
