package dev.lumen.client.voice;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.lumen.Lumen;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Per-player client settings, stored at {@code config/lumen-voice.json}. Editable in game with /voicechat. */
public final class VoiceClientConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static VoiceClientConfig instance = new VoiceClientConfig();

	public enum Mode { PUSH_TO_TALK, VOICE_ACTIVATION }

	/** Master switch for voice chat on this client. */
	public boolean enabled = true;
	public Mode mode = Mode.PUSH_TO_TALK;
	/** Voice activation threshold in dBFS (-80 quiet ... 0 loud). */
	public float activationThresholdDb = -42.0f;
	public float micGain = 1.0f;
	public boolean micMuted = false;
	/** Volume of other players' voices (0-2). */
	public float voiceVolume = 1.0f;
	/** Volume of Lumen's spoken voice (0-2). */
	public float lumenVolume = 1.0f;
	/** auto = system speech if available, else babble. system | babble | off. */
	public String lumenVoice = "auto";
	/**
	 * Optional custom text-to-speech command, e.g. a neural Piper voice:
	 * {@code piper --model en_US-amy-medium.onnx --output_file {wav} < {text_file}} is not shell-run,
	 * so use the {text_file}/{text} and {wav} placeholders as separate arguments:
	 * {@code piper --model /path/voice.onnx --input_file {text_file} --output_file {wav}}.
	 */
	public String customTtsCommand = "";
	/** Optional system voice name (Windows voice name, macOS `say -v` name, espeak voice). */
	public String systemVoiceName = "";
	/** Substring of the microphone device name to use; empty = system default. */
	public String microphone = "";
	/** Hear your own voice back through the server (microphone test). */
	public boolean hearMyself = false;

	public static VoiceClientConfig get() {
		return instance;
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve("lumen-voice.json");
	}

	public static void load() {
		try {
			if (Files.exists(path())) {
				VoiceClientConfig loaded = GSON.fromJson(Files.readString(path(), StandardCharsets.UTF_8), VoiceClientConfig.class);
				if (loaded != null) instance = loaded;
				if (instance.mode == null) instance.mode = Mode.PUSH_TO_TALK;
				if (instance.lumenVoice == null) instance.lumenVoice = "auto";
			}
			save();
		} catch (Exception e) {
			Lumen.LOGGER.error("Failed to load {}; using defaults", path(), e);
			instance = new VoiceClientConfig();
		}
	}

	public static void save() {
		try {
			Files.createDirectories(path().getParent());
			Files.writeString(path(), GSON.toJson(instance), StandardCharsets.UTF_8);
		} catch (Exception e) {
			Lumen.LOGGER.error("Failed to save {}", path(), e);
		}
	}
}
