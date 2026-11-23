package dev.lumen.client.voice;

import dev.lumen.Lumen;
import dev.lumen.bond.Bond;
import dev.lumen.voice.Adpcm;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Turns Lumen's lines into audio, entirely on this computer (no internet needed):
 * <ol>
 *   <li>a custom command if configured (e.g. a neural Piper voice),</li>
 *   <li>the operating system's own speech engine: Windows SAPI, macOS {@code say},
 *       or espeak-ng / espeak / pico2wave / flite on Linux,</li>
 *   <li>otherwise a built-in "babble" voice synthesised in pure Java, which always works.</li>
 * </ol>
 * The result is then shaped per mood so Lumen sounds like itself.
 */
public final class LumenVoice {
	private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "Lumen Voice Synth");
		t.setDaemon(true);
		return t;
	});
	private static volatile Boolean systemAvailable;
	private static volatile String lastEngine = "none";

	private LumenVoice() {}

	public static String lastEngine() {
		return lastEngine;
	}

	public static CompletableFuture<short[]> synthesize(String text, Bond.Mood mood) {
		return CompletableFuture.supplyAsync(() -> {
			String setting = VoiceClientConfig.get().lumenVoice.toLowerCase(Locale.ROOT);
			if (setting.equals("off") || text.isBlank()) return null;
			short[] pcm = null;
			if (!setting.equals("babble")) {
				pcm = systemSpeech(text);
			}
			if (pcm == null) {
				if (setting.equals("system")) return null;
				pcm = babble(text, mood);
				lastEngine = "babble";
			}
			return shape(pcm, mood);
		}, EXECUTOR);
	}

	// ------------------------------------------------------------------ system speech

	private static short[] systemSpeech(String text) {
		VoiceClientConfig config = VoiceClientConfig.get();
		boolean custom = config.customTtsCommand != null && !config.customTtsCommand.isBlank();
		if (!custom && Boolean.FALSE.equals(systemAvailable)) return null;
		Path dir = null;
		try {
			dir = Files.createTempDirectory("lumen-tts");
			Path textFile = dir.resolve("line.txt");
			Path wav = dir.resolve("line.wav");
			Files.writeString(textFile, text, StandardCharsets.UTF_8);
			for (List<String> command : candidates(text, textFile, wav)) {
				if (run(command, textFile, wav) && Files.exists(wav) && Files.size(wav) > 64) {
					short[] pcm = readWav(wav.toFile());
					if (pcm != null && pcm.length > 0) {
						systemAvailable = true;
						lastEngine = command.getFirst();
						return pcm;
					}
				}
				Files.deleteIfExists(wav);
			}
			if (!custom) {
				systemAvailable = false;
				Lumen.LOGGER.info("Lumen voice: no system speech engine found, using the built-in babble voice");
			}
		} catch (Exception e) {
			Lumen.LOGGER.warn("Lumen voice: speech synthesis failed: {}", e.toString());
		} finally {
			if (dir != null) {
				try (var files = Files.list(dir)) {
					files.forEach(p -> p.toFile().delete());
				} catch (Exception ignored) {
				}
				dir.toFile().delete();
			}
		}
		return null;
	}

	private static List<List<String>> candidates(String text, Path textFile, Path wav) {
		VoiceClientConfig config = VoiceClientConfig.get();
		List<List<String>> list = new ArrayList<>();
		if (config.customTtsCommand != null && !config.customTtsCommand.isBlank()) {
			List<String> args = new ArrayList<>();
			for (String part : config.customTtsCommand.trim().split("\\s+")) {
				args.add(part.replace("{text_file}", textFile.toString()).replace("{wav}", wav.toString()).replace("{text}", text));
			}
			list.add(args);
			return list;
		}
		String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
		String voice = config.systemVoiceName == null ? "" : config.systemVoiceName.trim();
		if (os.contains("win")) {
			String select = voice.isEmpty()
				? "try { $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female) } catch {}"
				: "try { $s.SelectVoice($env:LUMEN_TTS_VOICE) } catch {}";
			String script = "Add-Type -AssemblyName System.Speech; "
				+ "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " + select + "; "
				+ "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); "
				+ "$s.SetOutputToWaveFile($env:LUMEN_TTS_OUT, $f); "
				+ "$s.Speak([IO.File]::ReadAllText($env:LUMEN_TTS_IN, [Text.Encoding]::UTF8)); $s.Dispose()";
			list.add(List.of("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script));
		} else if (os.contains("mac")) {
			List<String> say = new ArrayList<>(List.of("say", "-f", textFile.toString(), "-o", wav.toString(), "--data-format=LEI16@16000"));
			if (!voice.isEmpty()) say.addAll(List.of("-v", voice));
			list.add(say);
		} else {
			String v = voice.isEmpty() ? "en+f3" : voice;
			list.add(List.of("espeak-ng", "-v", v, "-s", "155", "-f", textFile.toString(), "-w", wav.toString()));
			list.add(List.of("espeak", "-v", v, "-s", "155", "-f", textFile.toString(), "-w", wav.toString()));
			list.add(List.of("pico2wave", "-w", wav.toString(), text));
			list.add(List.of("flite", "-f", textFile.toString(), "-o", wav.toString()));
		}
		return list;
	}

	private static boolean run(List<String> command, Path textFile, Path wav) {
		try {
			ProcessBuilder builder = new ProcessBuilder(command).redirectErrorStream(true);
			builder.environment().put("LUMEN_TTS_IN", textFile.toString());
			builder.environment().put("LUMEN_TTS_OUT", wav.toString());
			builder.environment().put("LUMEN_TTS_VOICE", VoiceClientConfig.get().systemVoiceName == null ? "" : VoiceClientConfig.get().systemVoiceName);
			builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
			Process process = builder.start();
			if (!process.waitFor(20, TimeUnit.SECONDS)) {
				process.destroyForcibly();
				return false;
			}
			return process.exitValue() == 0;
		} catch (Exception e) {
			return false; // engine not installed
		}
	}

	static short[] readWav(File file) {
		try (AudioInputStream in = AudioSystem.getAudioInputStream(file)) {
			AudioFormat src = in.getFormat();
			AudioFormat pcm16 = new AudioFormat(AudioFormat.Encoding.PCM_SIGNED, src.getSampleRate(), 16, src.getChannels(),
				src.getChannels() * 2, src.getSampleRate(), false);
			try (AudioInputStream converted = AudioSystem.getAudioInputStream(pcm16, in)) {
				byte[] bytes = converted.readAllBytes();
				int channels = src.getChannels();
				int frames = bytes.length / (2 * channels);
				short[] mono = new short[frames];
				for (int i = 0; i < frames; i++) {
					int sum = 0;
					for (int c = 0; c < channels; c++) {
						int idx = (i * channels + c) * 2;
						sum += (short) ((bytes[idx] & 0xFF) | (bytes[idx + 1] << 8));
					}
					mono[i] = (short) (sum / channels);
				}
				return resample(mono, src.getSampleRate() / Adpcm.SAMPLE_RATE);
			}
		} catch (Exception e) {
			Lumen.LOGGER.warn("Lumen voice: could not read synthesised audio: {}", e.toString());
			return null;
		}
	}

	/** Linear resampling. factor = input samples per output sample (>1 speeds up / raises pitch). */
	static short[] resample(short[] in, double factor) {
		if (Math.abs(factor - 1.0) < 1.0e-3) return in;
		int outLen = (int) (in.length / factor);
		short[] out = new short[outLen];
		for (int i = 0; i < outLen; i++) {
			double pos = i * factor;
			int a = (int) pos;
			int b = Math.min(in.length - 1, a + 1);
			double t = pos - a;
			out[i] = (short) (in[a] * (1 - t) + in[b] * t);
		}
		return out;
	}

	// ------------------------------------------------------------------ built-in babble voice

	/** A wordless, sing-song creature voice: one formant-shaped syllable per letter group. */
	public static short[] babble(String text, Bond.Mood mood) {
		float base = switch (mood) {
			case CALM -> 330f;
			case UNEASY -> 250f;
			case HOSTILE -> 120f;
		};
		Random random = new Random(text.hashCode());
		int sr = Adpcm.SAMPLE_RATE;
		List<short[]> parts = new ArrayList<>();
		String lower = text.toLowerCase(Locale.ROOT);
		boolean question = lower.trim().endsWith("?");
		int letters = 0;
		for (int i = 0; i < lower.length(); i++) {
			char c = lower.charAt(i);
			if (c == ' ') {
				parts.add(new short[sr * 45 / 1000]);
				continue;
			}
			if (c == ',' || c == ';') {
				parts.add(new short[sr * 150 / 1000]);
				continue;
			}
			if (c == '.' || c == '!' || c == '?') {
				parts.add(new short[sr * 260 / 1000]);
				continue;
			}
			if (!Character.isLetter(c) || ++letters % 2 == 0) continue; // one syllable per two letters
			float progress = i / (float) Math.max(1, lower.length());
			float pitch = base * (1.0f + (random.nextFloat() - 0.5f) * 0.25f);
			if (question && progress > 0.75f) pitch *= 1.0f + (progress - 0.75f) * 1.6f;
			parts.add(syllable(c, pitch, sr, random));
		}
		int total = parts.stream().mapToInt(p -> p.length).sum();
		short[] out = new short[total];
		int pos = 0;
		for (short[] p : parts) {
			System.arraycopy(p, 0, out, pos, p.length);
			pos += p.length;
		}
		return out;
	}

	private static short[] syllable(char c, float pitch, int sr, Random random) {
		// Rough vowel formants (F1, F2) chosen from the letter.
		float[][] formants = {{730, 1090}, {530, 1840}, {270, 2290}, {570, 840}, {300, 870}};
		float[] f = formants[Math.floorMod(c, formants.length)];
		int len = sr * (55 + random.nextInt(35)) / 1000;
		short[] out = new short[len];
		double phase = 0;
		boolean consonant = "aeiouy".indexOf(c) < 0;
		for (int i = 0; i < len; i++) {
			double t = i / (double) len;
			double env = Math.sin(Math.PI * t) * (t < 0.1 ? t / 0.1 : 1.0);
			phase += 2 * Math.PI * pitch / sr;
			double sample = 0;
			for (int h = 1; h <= 12; h++) {
				double freq = pitch * h;
				double amp = 1.0 / h * (formantGain(freq, f[0]) + formantGain(freq, f[1]) * 0.7);
				sample += amp * Math.sin(phase * h);
			}
			if (consonant && t < 0.2) sample += (random.nextDouble() - 0.5) * 0.6 * (1 - t / 0.2);
			out[i] = (short) Math.max(-32768, Math.min(32767, sample * env * 9000));
		}
		return out;
	}

	private static double formantGain(double freq, double formant) {
		double d = (freq - formant) / 250.0;
		return Math.exp(-d * d);
	}

	// ------------------------------------------------------------------ mood shaping

	public static short[] shape(short[] pcm, Bond.Mood mood) {
		float[] x = new float[pcm.length];
		for (int i = 0; i < pcm.length; i++) x[i] = pcm[i] / 32768f;
		int sr = Adpcm.SAMPLE_RATE;
		switch (mood) {
			case CALM -> {
				x = toFloat(resample(toShort(x), 1.08));
				x = echo(x, sr * 90 / 1000, 0.28f);
				x = shimmer(x, sr, 5.5f, 0.08f);
			}
			case UNEASY -> {
				x = shimmer(x, sr, 7.0f, 0.3f);
				x = echo(x, sr * 70 / 1000, 0.18f);
			}
			case HOSTILE -> {
				x = toFloat(resample(toShort(x), 0.84));
				for (int i = 0; i < x.length; i++) x[i] = (float) Math.tanh(x[i] * 2.6f) * 0.8f;
				x = echo(x, sr * 170 / 1000, 0.42f);
			}
		}
		float peak = 1.0e-4f;
		for (float v : x) peak = Math.max(peak, Math.abs(v));
		float gain = 0.85f / peak;
		short[] out = new short[x.length];
		for (int i = 0; i < x.length; i++) out[i] = (short) Math.max(-32768, Math.min(32767, x[i] * gain * 32767f));
		return out;
	}

	private static float[] echo(float[] x, int delay, float feedback) {
		float[] y = new float[x.length + delay * 3];
		for (int i = 0; i < y.length; i++) {
			float dry = i < x.length ? x[i] : 0f;
			y[i] = dry + (i >= delay ? y[i - delay] * feedback : 0f);
		}
		return y;
	}

	private static float[] shimmer(float[] x, int sr, float hz, float depth) {
		float[] y = new float[x.length];
		for (int i = 0; i < x.length; i++) {
			y[i] = x[i] * (1f - depth + depth * (float) Math.sin(2 * Math.PI * hz * i / sr));
		}
		return y;
	}

	private static short[] toShort(float[] x) {
		short[] s = new short[x.length];
		for (int i = 0; i < x.length; i++) s[i] = (short) Math.max(-32768, Math.min(32767, x[i] * 32767f));
		return s;
	}

	private static float[] toFloat(short[] s) {
		float[] x = new float[s.length];
		for (int i = 0; i < s.length; i++) x[i] = s[i] / 32768f;
		return x;
	}
}
