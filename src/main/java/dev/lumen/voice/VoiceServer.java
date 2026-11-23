package dev.lumen.voice;

import com.google.gson.JsonParser;
import dev.lumen.Lumen;
import dev.lumen.ai.LumenConfig;
import dev.lumen.command.LumenCommand;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Server side of the voice system: relays microphone frames to nearby players and turns
 * spoken sentences for Lumen into text.
 */
public final class VoiceServer {
	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
	/** Simple flood protection: frames per player in the current second. */
	private static final Map<UUID, int[]> RATE = new HashMap<>();
	private static final Map<UUID, Long> PENDING_STT = new HashMap<>();

	private VoiceServer() {}

	public static void init() {
		ServerPlayNetworking.registerGlobalReceiver(VoicePackets.VoiceFrameC2S.ID, (payload, context) -> relay(context.player(), payload));
		ServerPlayNetworking.registerGlobalReceiver(VoicePackets.LumenUtteranceC2S.ID, (payload, context) -> transcribe(context.player(), payload.audio()));
	}

	public static void sendState(ServerPlayerEntity player) {
		LumenConfig config = LumenConfig.get();
		if (ServerPlayNetworking.canSend(player, VoicePackets.VoiceStateS2C.ID)) {
			ServerPlayNetworking.send(player, new VoicePackets.VoiceStateS2C(config.voiceChatEnabled, config.voiceRange, config.speechRecognitionAvailable()));
		}
	}

	public static void onLeave(ServerPlayerEntity player) {
		RATE.remove(player.getUuid());
		PENDING_STT.remove(player.getUuid());
	}

	private static void relay(ServerPlayerEntity sender, VoicePackets.VoiceFrameC2S frame) {
		LumenConfig config = LumenConfig.get();
		if (!config.voiceChatEnabled) return;
		if (!allowFrame(sender)) return;

		VoicePackets.VoiceFrameS2C out = new VoicePackets.VoiceFrameS2C(sender.getUuid(), frame.sequence(), frame.data());
		double rangeSq = config.voiceRange * (double) config.voiceRange;
		for (ServerPlayerEntity listener : sender.getEntityWorld().getPlayers()) {
			boolean self = listener == sender;
			if (self && !frame.loopback()) continue;
			if (!self && listener.squaredDistanceTo(sender) > rangeSq) continue;
			if (ServerPlayNetworking.canSend(listener, VoicePackets.VoiceFrameS2C.ID)) {
				ServerPlayNetworking.send(listener, out);
			}
		}
	}

	private static boolean allowFrame(ServerPlayerEntity sender) {
		long second = System.currentTimeMillis() / 1000L;
		int[] counter = RATE.computeIfAbsent(sender.getUuid(), u -> new int[2]);
		if (counter[0] != (int) second) {
			counter[0] = (int) second;
			counter[1] = 0;
		}
		return ++counter[1] <= 75; // 50 frames/s nominal, allow bursts after lag
	}

	// ------------------------------------------------------------------ speech to text

	private static void transcribe(ServerPlayerEntity player, byte[] adpcm) {
		LumenConfig config = LumenConfig.get();
		if (!config.speechRecognitionAvailable()) {
			player.sendMessage(Text.translatable("message.lumen.voice_needs_ai").formatted(Formatting.GRAY), false);
			return;
		}
		long now = System.currentTimeMillis();
		Long last = PENDING_STT.get(player.getUuid());
		if (last != null && now - last < 15_000) {
			player.sendMessage(Text.translatable("message.lumen.voice_busy").formatted(Formatting.GRAY), true);
			return;
		}
		PENDING_STT.put(player.getUuid(), now);

		byte[] wav = toWav(decodeAll(adpcm));
		MinecraftServer server = player.getEntityWorld().getServer();
		UUID uuid = player.getUuid();
		player.sendMessage(Text.translatable("message.lumen.voice_listening").formatted(Formatting.DARK_GRAY, Formatting.ITALIC), true);

		String boundary = "----lumen" + Long.toHexString(now);
		byte[] body = multipart(boundary, wav, config.speechToTextModel);
		HttpRequest request = HttpRequest.newBuilder(URI.create(config.speechToTextUrl.trim()))
			.timeout(Duration.ofSeconds(Math.max(5, config.requestTimeoutSeconds)))
			.header("Authorization", "Bearer " + config.effectiveApiKey())
			.header("Content-Type", "multipart/form-data; boundary=" + boundary)
			.POST(HttpRequest.BodyPublishers.ofByteArray(body))
			.build();
		HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
			.thenApply(response -> {
				if (response.statusCode() / 100 != 2) throw new IllegalStateException("HTTP " + response.statusCode() + ": " + response.body());
				return JsonParser.parseString(response.body()).getAsJsonObject().get("text").getAsString().trim();
			})
			.whenComplete((text, error) -> server.execute(() -> {
				PENDING_STT.remove(uuid);
				ServerPlayerEntity current = server.getPlayerManager().getPlayer(uuid);
				if (current == null) return;
				if (error != null || text == null || text.isBlank()) {
					if (error != null) Lumen.LOGGER.warn("Speech recognition failed: {}", error.getMessage());
					current.sendMessage(Text.translatable("message.lumen.voice_unheard").formatted(Formatting.GRAY), false);
					return;
				}
				LumenCommand.talk(current, text);
			}));
	}

	static short[] decodeAll(byte[] adpcm) {
		int frameBytes = Adpcm.encodedSize(Adpcm.FRAME_SAMPLES);
		int frames = adpcm.length / frameBytes;
		short[] pcm = new short[frames * Adpcm.FRAME_SAMPLES];
		byte[] frame = new byte[frameBytes];
		for (int i = 0; i < frames; i++) {
			System.arraycopy(adpcm, i * frameBytes, frame, 0, frameBytes);
			short[] decoded = Adpcm.decode(frame, Adpcm.FRAME_SAMPLES);
			System.arraycopy(decoded, 0, pcm, i * Adpcm.FRAME_SAMPLES, Adpcm.FRAME_SAMPLES);
		}
		return pcm;
	}

	public static byte[] toWav(short[] pcm) {
		int dataBytes = pcm.length * 2;
		ByteBuffer buf = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN);
		buf.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + dataBytes).put("WAVE".getBytes(StandardCharsets.US_ASCII));
		buf.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short) 1).putShort((short) 1)
			.putInt(Adpcm.SAMPLE_RATE).putInt(Adpcm.SAMPLE_RATE * 2).putShort((short) 2).putShort((short) 16);
		buf.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(dataBytes);
		for (short s : pcm) buf.putShort(s);
		return buf.array();
	}

	private static byte[] multipart(String boundary, byte[] wav, String model) {
		ByteArrayOutputStream out = new ByteArrayOutputStream(wav.length + 512);
		String head = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n" + model + "\r\n"
			+ "--" + boundary + "\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n"
			+ "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n";
		out.writeBytes(head.getBytes(StandardCharsets.UTF_8));
		out.writeBytes(wav);
		out.writeBytes(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
		return out.toByteArray();
	}
}
