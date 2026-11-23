package dev.lumen.client.voice;

import dev.lumen.Lumen;
import dev.lumen.bond.Bond;
import dev.lumen.voice.Adpcm;
import dev.lumen.voice.VoicePackets;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.lwjgl.glfw.GLFW;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Client side of Lumen's voice system: proximity voice chat between players, Lumen speaking out
 * loud, and talking to Lumen with your microphone.
 */
public final class VoiceClient {
	private static final KeyBinding.Category CATEGORY = KeyBinding.Category.create(Lumen.id("voice"));
	public static final KeyBinding PUSH_TO_TALK = new KeyBinding("key.lumen.push_to_talk", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_V, CATEGORY);
	public static final KeyBinding TALK_TO_LUMEN = new KeyBinding("key.lumen.talk_to_lumen", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_B, CATEGORY);
	public static final KeyBinding TOGGLE_MUTE = new KeyBinding("key.lumen.toggle_mute", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_N, CATEGORY);

	private static final VoiceMixer MIXER = new VoiceMixer();
	private static final Microphone MICROPHONE = new Microphone(VoiceClient::onCapturedFrame);
	private static final int FRAME_BYTES = Adpcm.encodedSize(Adpcm.FRAME_SAMPLES);
	private static final int MAX_UTTERANCE_FRAMES = 25 * 50;

	private static volatile boolean serverVoice;
	private static volatile boolean serverSpeechRecognition;
	private static volatile boolean pttHeld;
	private static volatile boolean lumenHeld;
	private static volatile boolean transmitting;
	private static volatile float micLevelDb = -100f;
	private static int sequence;
	private static int hangoverFrames;
	private static final ByteArrayOutputStream UTTERANCE = new ByteArrayOutputStream();
	private static boolean wasLumenHeld;

	private VoiceClient() {}

	public static VoiceMixer mixer() {
		return MIXER;
	}

	public static Microphone microphone() {
		return MICROPHONE;
	}

	public static boolean serverVoice() {
		return serverVoice;
	}

	public static boolean isTransmitting() {
		return transmitting;
	}

	public static float micLevelDb() {
		return micLevelDb;
	}

	public static void init() {
		VoiceClientConfig.load();
		KeyBindingHelper.registerKeyBinding(PUSH_TO_TALK);
		KeyBindingHelper.registerKeyBinding(TALK_TO_LUMEN);
		KeyBindingHelper.registerKeyBinding(TOGGLE_MUTE);

		ClientPlayNetworking.registerGlobalReceiver(VoicePackets.VoiceStateS2C.ID, (payload, context) -> {
			serverVoice = payload.enabled();
			serverSpeechRecognition = payload.speechRecognition();
			MIXER.setRange(payload.range());
			MIXER.ensureRunning();
			refreshMicrophone();
		});
		ClientPlayNetworking.registerGlobalReceiver(VoicePackets.VoiceFrameS2C.ID, (payload, context) -> {
			if (!VoiceClientConfig.get().enabled) return;
			short[] pcm = Adpcm.decode(payload.data(), Math.min(Adpcm.FRAME_SAMPLES, Adpcm.samplesIn(payload.data().length)));
			MIXER.ensureRunning();
			MIXER.pushFrame(payload.speaker().toString(), pcm, VoiceClientConfig.get().voiceVolume);
		});
		ClientPlayNetworking.registerGlobalReceiver(VoicePackets.LumenSpeechS2C.ID, (payload, context) -> speakLumen(payload.entityId(), Bond.Mood.byId(payload.mood()), payload.text()));
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			serverVoice = false;
			serverSpeechRecognition = false;
			MICROPHONE.stop();
			MIXER.clear();
		});
		ClientTickEvents.END_CLIENT_TICK.register(VoiceClient::tick);
		HudElementRegistry.addLast(Lumen.id("voice_hud"), (context, tickCounter) -> renderHud(context));
	}

	/** Lumen says a line: synthesise it locally and play it from the orb's position. */
	public static void speakLumen(int entityId, Bond.Mood mood, String text) {
		if (!VoiceClientConfig.get().enabled) return;
		MIXER.ensureRunning();
		LumenVoice.synthesize(text, mood).thenAccept(pcm -> {
			if (pcm != null) MIXER.pushClip("lumen:" + entityId, pcm, VoiceClientConfig.get().lumenVolume);
		});
	}

	/** Opens or closes the microphone to match settings. */
	public static void refreshMicrophone() {
		VoiceClientConfig config = VoiceClientConfig.get();
		boolean want = serverVoice && config.enabled && MinecraftClient.getInstance().getNetworkHandler() != null;
		if (want && !MICROPHONE.isRunning()) MICROPHONE.start(config.microphone);
		else if (!want && MICROPHONE.isRunning()) MICROPHONE.stop();
	}

	public static void restartMicrophone() {
		MICROPHONE.stop();
		refreshMicrophone();
	}

	private static void tick(MinecraftClient client) {
		pttHeld = PUSH_TO_TALK.isPressed();
		boolean lumenNow = TALK_TO_LUMEN.isPressed();
		while (TOGGLE_MUTE.wasPressed()) {
			VoiceClientConfig config = VoiceClientConfig.get();
			config.micMuted = !config.micMuted;
			VoiceClientConfig.save();
			if (client.player != null) {
				client.player.sendMessage(Text.translatable(config.micMuted ? "message.lumen.mic_muted" : "message.lumen.mic_unmuted")
					.formatted(config.micMuted ? Formatting.RED : Formatting.GREEN), true);
			}
		}
		if (lumenNow && !wasLumenHeld) {
			if (!serverSpeechRecognition && client.player != null) {
				client.player.sendMessage(Text.translatable("message.lumen.voice_needs_ai").formatted(Formatting.GRAY), false);
				lumenNow = false;
			} else if (!MICROPHONE.isRunning() && client.player != null) {
				client.player.sendMessage(Text.translatable("message.lumen.no_microphone", String.valueOf(MICROPHONE.error())).formatted(Formatting.RED), false);
			}
			synchronized (UTTERANCE) {
				UTTERANCE.reset();
			}
		}
		lumenHeld = lumenNow;
		if (!lumenNow && wasLumenHeld) finishUtterance();
		wasLumenHeld = lumenNow;

		if (client.world == null || client.gameRenderer == null) return;
		var camera = client.gameRenderer.getCamera();
		MIXER.setListener(camera.getCameraPos(), camera.getYaw());
		UUID self = client.player == null ? null : client.player.getUuid();
		List<String> keys = new ArrayList<>();
		MIXER.activeKeys().forEach(keys::add);
		for (String key : keys) {
			if (key.startsWith("lumen:")) {
				Entity entity = client.world.getEntityById(Integer.parseInt(key.substring(6)));
				MIXER.setPosition(key, entity == null ? null : entity.getEyePos());
			} else {
				try {
					UUID uuid = UUID.fromString(key);
					PlayerEntity player = uuid.equals(self) ? null : client.world.getPlayerByUuid(uuid);
					MIXER.setPosition(key, player == null ? null : player.getEyePos());
				} catch (IllegalArgumentException ignored) {
				}
			}
		}
	}

	/** Called on the microphone thread for every 20 ms frame. Visible for tests. */
	public static void onCapturedFrame(short[] frame) {
		VoiceClientConfig config = VoiceClientConfig.get();
		float gain = config.micGain;
		long energy = 0;
		for (int i = 0; i < frame.length; i++) {
			int v = Math.max(-32768, Math.min(32767, Math.round(frame[i] * gain)));
			frame[i] = (short) v;
			energy += (long) v * v;
		}
		double rms = Math.sqrt(energy / (double) frame.length) / 32768.0;
		micLevelDb = (float) (20.0 * Math.log10(Math.max(rms, 1.0e-5)));

		if (lumenHeld) {
			transmitting = false;
			synchronized (UTTERANCE) {
				if (UTTERANCE.size() < MAX_UTTERANCE_FRAMES * FRAME_BYTES) UTTERANCE.writeBytes(Adpcm.encode(frame, 0, frame.length));
			}
			return;
		}

		boolean send;
		if (config.mode == VoiceClientConfig.Mode.PUSH_TO_TALK) {
			send = pttHeld;
		} else {
			if (micLevelDb > config.activationThresholdDb) hangoverFrames = 15; // keep talking 300 ms after you stop
			send = hangoverFrames-- > 0;
		}
		send &= serverVoice && config.enabled && !config.micMuted;
		transmitting = send;
		if (!send) return;
		byte[] data = Adpcm.encode(frame, 0, frame.length);
		VoicePackets.VoiceFrameC2S packet = new VoicePackets.VoiceFrameC2S(sequence++, config.hearMyself, data);
		MinecraftClient.getInstance().execute(() -> {
			if (ClientPlayNetworking.canSend(VoicePackets.VoiceFrameC2S.ID)) ClientPlayNetworking.send(packet);
		});
	}

	/** Test hook: simulate holding a key without a keyboard. */
	public static void setHeldForTest(boolean ptt, boolean lumen) {
		pttHeld = ptt;
		lumenHeld = lumen;
	}

	public static void finishUtterance() {
		byte[] audio;
		synchronized (UTTERANCE) {
			audio = UTTERANCE.toByteArray();
			UTTERANCE.reset();
		}
		if (audio.length < FRAME_BYTES * 15) return; // under 0.3 s: ignore accidental taps
		MinecraftClient.getInstance().execute(() -> {
			if (ClientPlayNetworking.canSend(VoicePackets.LumenUtteranceC2S.ID)) {
				ClientPlayNetworking.send(new VoicePackets.LumenUtteranceC2S(audio));
			}
		});
	}

	// ------------------------------------------------------------------ HUD

	private static void renderHud(DrawContext context) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (!serverVoice || client.player == null || client.options.hudHidden) return;
		VoiceClientConfig config = VoiceClientConfig.get();
		int x = 4, y = 4;
		Text status = null;
		if (!config.enabled) status = Text.translatable("hud.lumen.voice_off").formatted(Formatting.DARK_GRAY);
		else if (lumenHeld) status = Text.translatable("hud.lumen.speaking_to_lumen").formatted(Formatting.AQUA);
		else if (config.micMuted) status = Text.translatable("hud.lumen.muted").formatted(Formatting.RED);
		else if (!MICROPHONE.isRunning()) status = Text.translatable("hud.lumen.no_mic").formatted(Formatting.RED);
		else if (transmitting) status = Text.translatable("hud.lumen.talking").formatted(Formatting.GREEN);
		if (status != null) {
			context.drawTextWithShadow(client.textRenderer, status, x, y, 0xFFFFFFFF);
			y += 11;
		}
		if (client.world == null) return;
		for (String key : (Iterable<String>) MIXER.activeKeys()::iterator) {
			if (key.startsWith("lumen:") || !MIXER.isSpeaking(key)) continue;
			try {
				PlayerEntity player = client.world.getPlayerByUuid(UUID.fromString(key));
				String name = player == null ? "?" : player.getName().getString();
				context.drawTextWithShadow(client.textRenderer, Text.literal("♪ " + name).formatted(Formatting.WHITE), x, y, 0xFFFFFFFF);
				y += 11;
			} catch (IllegalArgumentException ignored) {
			}
		}
	}
}
