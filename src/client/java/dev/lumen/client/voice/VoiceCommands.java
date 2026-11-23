package dev.lumen.client.voice;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.lumen.bond.Bond;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

import static net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.argument;
import static net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal;

/** /voicechat (alias /vc): configure voice chat and Lumen's voice from inside the game. */
public final class VoiceCommands {
	private VoiceCommands() {}

	public static void register(CommandDispatcher<FabricClientCommandSource> dispatcher) {
		dispatcher.register(build("voicechat"));
		dispatcher.register(build("vc"));
	}

	private static LiteralArgumentBuilder<FabricClientCommandSource> build(String name) {
		return literal(name)
			.executes(ctx -> status(ctx.getSource()))
			.then(literal("status").executes(ctx -> status(ctx.getSource())))
			.then(literal("on").executes(ctx -> set(ctx.getSource(), c -> c.enabled = true, "Voice chat enabled.")))
			.then(literal("off").executes(ctx -> set(ctx.getSource(), c -> c.enabled = false, "Voice chat disabled.")))
			.then(literal("mute").executes(ctx -> set(ctx.getSource(), c -> c.micMuted = true, "Microphone muted.")))
			.then(literal("unmute").executes(ctx -> set(ctx.getSource(), c -> c.micMuted = false, "Microphone unmuted.")))
			.then(literal("mode")
				.then(literal("ptt").executes(ctx -> set(ctx.getSource(), c -> c.mode = VoiceClientConfig.Mode.PUSH_TO_TALK, "Push-to-talk: hold V.")))
				.then(literal("voice").executes(ctx -> set(ctx.getSource(), c -> c.mode = VoiceClientConfig.Mode.VOICE_ACTIVATION, "Voice activation: just speak."))))
			.then(literal("threshold").then(argument("db", FloatArgumentType.floatArg(-80, 0))
				.executes(ctx -> {
					float db = FloatArgumentType.getFloat(ctx, "db");
					return set(ctx.getSource(), c -> c.activationThresholdDb = db, "Activation threshold: " + db + " dB (your mic is at " + Math.round(VoiceClient.micLevelDb()) + " dB right now).");
				})))
			.then(literal("gain").then(argument("multiplier", FloatArgumentType.floatArg(0.1f, 8f))
				.executes(ctx -> {
					float g = FloatArgumentType.getFloat(ctx, "multiplier");
					return set(ctx.getSource(), c -> c.micGain = g, "Microphone gain: x" + g);
				})))
			.then(literal("volume").then(argument("percent", IntegerArgumentType.integer(0, 200))
				.executes(ctx -> {
					int p = IntegerArgumentType.getInteger(ctx, "percent");
					return set(ctx.getSource(), c -> c.voiceVolume = p / 100f, "Player voice volume: " + p + "%");
				})))
			.then(literal("lumenvolume").then(argument("percent", IntegerArgumentType.integer(0, 200))
				.executes(ctx -> {
					int p = IntegerArgumentType.getInteger(ctx, "percent");
					return set(ctx.getSource(), c -> c.lumenVolume = p / 100f, "Lumen voice volume: " + p + "%");
				})))
			.then(literal("lumenvoice")
				.then(literal("auto").executes(ctx -> set(ctx.getSource(), c -> c.lumenVoice = "auto", "Lumen uses your system voice, or babble if none.")))
				.then(literal("system").executes(ctx -> set(ctx.getSource(), c -> c.lumenVoice = "system", "Lumen uses your system voice only.")))
				.then(literal("babble").executes(ctx -> set(ctx.getSource(), c -> c.lumenVoice = "babble", "Lumen babbles in its own language.")))
				.then(literal("off").executes(ctx -> set(ctx.getSource(), c -> c.lumenVoice = "off", "Lumen is silent (text only)."))))
			.then(literal("test").executes(ctx -> {
				VoiceClientConfig c = VoiceClientConfig.get();
				return set(ctx.getSource(), x -> x.hearMyself = !c.hearMyself,
					!c.hearMyself ? "Mic test ON: talk and you'll hear yourself. Run /voicechat test again to stop." : "Mic test OFF.");
			}))
			.then(literal("mics").executes(ctx -> {
				List<String> devices = Microphone.listDevices();
				ctx.getSource().sendFeedback(Text.literal("Microphones (use /voicechat mic <number>):").formatted(Formatting.GOLD));
				for (int i = 0; i < devices.size(); i++) {
					ctx.getSource().sendFeedback(Text.literal(" " + i + ": " + devices.get(i)));
				}
				if (devices.isEmpty()) ctx.getSource().sendFeedback(Text.literal(" none found").formatted(Formatting.RED));
				return devices.size();
			}))
			.then(literal("mic")
				.then(literal("default").executes(ctx -> setMic(ctx.getSource(), "")))
				.then(argument("number", IntegerArgumentType.integer(0)).executes(ctx -> {
					List<String> devices = Microphone.listDevices();
					int n = IntegerArgumentType.getInteger(ctx, "number");
					if (n >= devices.size()) {
						ctx.getSource().sendError(Text.literal("No microphone #" + n + ". See /voicechat mics."));
						return 0;
					}
					return setMic(ctx.getSource(), devices.get(n));
				})))
			.then(literal("say").then(argument("text", StringArgumentType.greedyString()).executes(ctx -> {
				MinecraftClient client = MinecraftClient.getInstance();
				int id = client.player == null ? -1 : client.player.getId();
				VoiceClient.speakLumen(id, Bond.Mood.CALM, StringArgumentType.getString(ctx, "text"));
				return 1;
			})));
	}

	private static int setMic(FabricClientCommandSource source, String name) {
		set(source, c -> c.microphone = name, "Microphone: " + (name.isEmpty() ? "system default" : name));
		VoiceClient.restartMicrophone();
		return 1;
	}

	private static int set(FabricClientCommandSource source, Consumer<VoiceClientConfig> change, String message) {
		change.accept(VoiceClientConfig.get());
		VoiceClientConfig.save();
		VoiceClient.refreshMicrophone();
		source.sendFeedback(Text.literal(message).formatted(Formatting.GREEN));
		return 1;
	}

	private static int status(FabricClientCommandSource source) {
		VoiceClientConfig c = VoiceClientConfig.get();
		Microphone mic = VoiceClient.microphone();
		VoiceMixer mixer = VoiceClient.mixer();
		source.sendFeedback(Text.literal("Lumen Voice Chat").formatted(Formatting.GOLD, Formatting.BOLD));
		source.sendFeedback(Text.literal(" Server voice chat: " + (VoiceClient.serverVoice() ? "available" : "not available on this server")));
		source.sendFeedback(Text.literal(" Enabled: " + c.enabled + ", mode: " + c.mode.name().toLowerCase(Locale.ROOT).replace('_', ' ')
			+ (c.mode == VoiceClientConfig.Mode.VOICE_ACTIVATION ? " (threshold " + c.activationThresholdDb + " dB)" : " (hold V)")
			+ (c.micMuted ? ", MUTED" : "")));
		source.sendFeedback(Text.literal(" Microphone: " + (mic.isRunning() ? mic.deviceName() + " @ " + Math.round(VoiceClient.micLevelDb()) + " dB"
			: "closed" + (mic.error() != null ? " (" + mic.error() + ")" : ""))));
		source.sendFeedback(Text.literal(" Speakers: " + (mixer.outputAvailable() ? "ok" : "no output device")
			+ ", volume " + Math.round(c.voiceVolume * 100) + "%, Lumen " + Math.round(c.lumenVolume * 100) + "%"));
		source.sendFeedback(Text.literal(" Lumen voice: " + c.lumenVoice + " (last engine: " + LumenVoice.lastEngine() + ")"));
		source.sendFeedback(Text.literal(" Keys: V push-to-talk, B talk to Lumen, N mute. /voicechat test hears yourself.").formatted(Formatting.GRAY));
		return 1;
	}
}
