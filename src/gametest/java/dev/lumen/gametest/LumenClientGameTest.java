package dev.lumen.gametest;

import com.sun.net.httpserver.HttpServer;
import dev.lumen.LumenRegistry;
import dev.lumen.ai.LumenBrain;
import dev.lumen.ai.LumenConfig;
import dev.lumen.bond.Bond;
import dev.lumen.bond.BondManager;
import dev.lumen.command.LumenCommand;
import dev.lumen.entity.HollowEntity;
import dev.lumen.entity.LumenEntity;
import dev.lumen.client.voice.LumenVoice;
import dev.lumen.client.voice.VoiceClient;
import dev.lumen.client.voice.VoiceClientConfig;
import dev.lumen.voice.Adpcm;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Plays through the whole mod in a real client + integrated server:
 * vessel awakening, following, offline dialogue tags, re-manifesting after teleport, gifts,
 * owner damage, hostility + Hollow summon, and the online AI pipeline against a mock endpoint.
 */
public class LumenClientGameTest implements FabricClientGameTest {
	private static void check(boolean condition, String message) {
		if (!condition) throw new AssertionError(message);
	}

	/** Runs audio code the way the real microphone thread does (not on the gametest thread). */
	private static void onMicThread(Runnable runnable) {
		Thread thread = new Thread(runnable, "Fake Microphone");
		thread.start();
		try {
			thread.join();
		} catch (InterruptedException e) {
			throw new RuntimeException(e);
		}
	}

	private static ServerPlayerEntity player(MinecraftServer server) {
		return server.getPlayerManager().getPlayerList().getFirst();
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext sp = context.worldBuilder().create()) {
			sp.getClientWorld().waitForChunksRender();
			sp.getServer().runCommand("gamerule doDaylightCycle false");
			sp.getServer().runCommand("gamerule doMobSpawning false");
			sp.getServer().runCommand("time set noon");
			sp.getServer().runCommand("gamemode survival @a");
			context.waitTicks(20);

			// 1. First join gives a vessel.
			boolean hasVessel = sp.getServer().computeOnServer(s -> player(s).getInventory().contains(new ItemStack(LumenRegistry.LUMEN_VESSEL_ITEM)));
			check(hasVessel, "player should receive a Lumen Vessel on first join");

			// 2. Place and open the vessel through the real interaction path.
			BlockPos vesselPos = sp.getServer().computeOnServer(s -> {
				ServerPlayerEntity p = player(s);
				BlockPos pos = p.getBlockPos().north(3);
				p.getEntityWorld().setBlockState(pos, LumenRegistry.LUMEN_VESSEL.getDefaultState());
				p.setStackInHand(Hand.MAIN_HAND, ItemStack.EMPTY);
				p.networkHandler.requestTeleport(p.getX(), p.getY(), p.getZ(), 180f, 30f);
				return pos;
			});
			context.waitTicks(5);
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				BlockHitResult hit = new BlockHitResult(Vec3d.ofCenter(vesselPos), Direction.SOUTH, vesselPos, false);
				p.interactionManager.interactBlock(p, p.getEntityWorld(), ItemStack.EMPTY, Hand.MAIN_HAND, hit);
			});
			context.waitTicks(40);
			context.takeScreenshot("lumen_01_vessel_awakening");
			context.waitTicks(80);

			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				check(p.getEntityWorld().getBlockState(vesselPos).isAir(), "vessel should be consumed after awakening");
				Bond bond = Bond.of(p);
				check(bond.bound, "player should be bound after awakening");
				LumenEntity lumen = BondManager.find(p.getUuid());
				check(lumen != null, "a Lumen should exist after awakening");
			});
			context.waitTicks(40);
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				check(lumen.squaredDistanceTo(p) < 3 * 3, "Lumen should hover near its owner, distance " + Math.sqrt(lumen.squaredDistanceTo(p)));
				// Look at the Lumen for a portrait.
				Vec3d l = lumen.getEntityPos();
				p.networkHandler.requestTeleport(l.x + 1.6, l.y - 1.4, l.z + 1.6, 135f, 15f);
				Bond.of(p).staying = true;
			});
			context.waitTicks(30);
			context.takeScreenshot("lumen_02_calm");

			// 3. Offline dialogue understands stay/follow and emits the same control tags as the AI.
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				Bond.of(p).staying = false;
				check(!LumenConfig.get().aiAvailable(), "test expects offline mode at this point");
				LumenCommand.talk(p, "please stay here");
				check(Bond.of(p).staying, "'stay' should make Lumen wait");
				LumenCommand.talk(p, "ok follow me");
				check(!Bond.of(p).staying, "'follow' should make Lumen follow again");
				LumenBrain.Reply parsed = LumenBrain.Reply.parse("Sure thing. [FOLLOW][TRUST+4] [GIFT]");
				check(parsed.follow() && parsed.gift() && parsed.trustDelta() == 4 && parsed.text().equals("Sure thing."), "tag parsing: " + parsed);
				check(LumenBrain.Reply.parse("x [TRUST-50]").trustDelta() == -10, "trust deltas are clamped");
			});

			// 3b. Real chat from the client: "lumen, ..." is routed to Lumen (and kept private).
			context.runOnClient(c -> c.player.networkHandler.sendChatMessage("Lumen, please stay here"));
			boolean stayed = false;
			for (int i = 0; i < 40 && !stayed; i++) {
				context.waitTicks(2);
				stayed = sp.getServer().computeOnServer(s -> Bond.of(player(s)).staying);
			}
			check(stayed, "a chat message addressed to Lumen should reach it");
			context.runOnClient(c -> c.player.networkHandler.sendChatMessage("lumen: follow me"));
			boolean following = false;
			for (int i = 0; i < 40 && !following; i++) {
				context.waitTicks(2);
				following = sp.getServer().computeOnServer(s -> !Bond.of(player(s)).staying);
			}
			check(following, "a second chat message should make Lumen follow again");

			// 4a. A long teleport in the same dimension: Lumen catches up on its own.
			sp.getServer().runCommand("tp @p ~200 ~ ~");
			context.waitTicks(60);
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				check(lumen != null && lumen.squaredDistanceTo(p) < 5 * 5, "Lumen should catch up after a long teleport");
			});

			// 4b. Changing dimension: the Lumen dissolves and re-manifests beside its owner.
			int genBefore = sp.getServer().computeOnServer(s -> Bond.of(player(s)).generation);
			Vec3d home = sp.getServer().computeOnServer(s -> player(s).getEntityPos());
			sp.getServer().runCommand("gamemode creative @a");
			sp.getServer().runCommand("execute in minecraft:the_nether run tp @p 0 70 0");
			context.waitTicks(100);
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				check(p.getEntityWorld().getRegistryKey() == World.NETHER, "player should be in the Nether");
				check(lumen != null && lumen.getEntityWorld() == p.getEntityWorld() && lumen.squaredDistanceTo(p) < 5 * 5,
					"Lumen should re-manifest next to its owner in the new dimension");
				check(Bond.of(p).generation > genBefore, "re-manifesting bumps the generation");
				int leftBehind = s.getOverworld().getEntitiesByType(LumenRegistry.LUMEN, e -> true).size();
				check(leftBehind == 0, "no stale Lumen should remain in the Overworld, found " + leftBehind);
			});
			sp.getServer().runCommand("execute in minecraft:overworld run tp @p " + home.x + " " + home.y + " " + home.z);
			context.waitTicks(100);
			sp.getServer().runCommand("gamemode survival @a");
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				check(lumen != null && lumen.getEntityWorld() == p.getEntityWorld() && lumen.squaredDistanceTo(p) < 5 * 5, "Lumen should follow back to the Overworld");
				int count = s.getOverworld().getEntitiesByType(LumenRegistry.LUMEN, e -> true).size()
					+ s.getWorld(World.NETHER).getEntitiesByType(LumenRegistry.LUMEN, e -> true).size();
				check(count == 1, "exactly one Lumen should exist, found " + count);
			});

			// 5. Gifts raise trust; hitting it lowers trust and it cannot be killed.
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				Bond bond = Bond.of(p);
				bond.trust = 10;
				p.setStackInHand(Hand.MAIN_HAND, new ItemStack(Items.GOLDEN_APPLE));
				p.interact(lumen, Hand.MAIN_HAND);
				check(bond.trust == 30, "golden apple gift should add 20 trust, trust=" + bond.trust);
				check(p.getMainHandStack().isEmpty(), "gift should be consumed in survival");
				p.attack(lumen);
				check(bond.trust == 15, "owner hitting Lumen should cost 15 trust, trust=" + bond.trust);
				check(lumen.isAlive(), "Lumen is invulnerable to normal damage");
			});

			// 6. Hostility: low trust turns it red and lets it unleash a Hollow.
			sp.getServer().runCommand("execute as @p run lumen trust -80");
			context.waitTicks(10);
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				check(lumen.getMood() == Bond.Mood.HOSTILE, "trust -80 should make Lumen hostile, mood=" + lumen.getMood());
				Bond.of(p).lastSummonTick = -1_000_000L;
				lumen.apply(p, LumenBrain.Reply.parse("You will regret this. [SUMMON]"));
				List<HollowEntity> hollows = p.getEntityWorld().getEntitiesByClass(HollowEntity.class, p.getBoundingBox().expand(16), e -> true);
				check(hollows.size() == 1, "a Hollow should be summoned, found " + hollows.size());
				HollowEntity hollow = hollows.getFirst();
				Vec3d h = hollow.getEntityPos();
				p.networkHandler.requestTeleport(h.x, h.y, h.z + 4.5, 180f, -10f);
				Bond.of(p).staying = true;
				lumen.setStaying(true);
			});
			context.waitTicks(30);
			context.takeScreenshot("lumen_03_hollow");
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				Vec3d l = lumen.getEntityPos();
				p.networkHandler.requestTeleport(l.x + 1.6, l.y - 1.4, l.z + 1.6, 135f, 15f);
			});
			context.waitTicks(20);
			context.takeScreenshot("lumen_04_hostile");
			sp.getServer().runCommand("kill @e[type=lumen:hollow]");
			sp.getServer().runCommand("execute as @p run lumen trust 20");
			sp.getServer().runCommand("execute as @p run lumen follow");
			context.waitTicks(10);

			// 7. Voice: codec quality, server relay (mic test loopback) and Lumen speaking out loud.
			context.waitFor(c -> VoiceClient.serverVoice(), 100);
			check(VoiceClient.serverVoice(), "server should announce voice chat support");
			short[] sine = new short[Adpcm.FRAME_SAMPLES];
			for (int i = 0; i < sine.length; i++) sine[i] = (short) (12000 * Math.sin(2 * Math.PI * 440 * i / Adpcm.SAMPLE_RATE));
			short[] decoded = Adpcm.decode(Adpcm.encode(sine, 0, sine.length), sine.length);
			double signal = 0, noise = 0;
			for (int i = 0; i < sine.length; i++) {
				signal += sine[i] * (double) sine[i];
				noise += (sine[i] - decoded[i]) * (double) (sine[i] - decoded[i]);
			}
			double snr = 10 * Math.log10(signal / Math.max(noise, 1));
			check(snr > 20, "ADPCM round trip should keep the voice clear, SNR=" + snr);

			VoiceClientConfig voiceConfig = VoiceClientConfig.get();
			voiceConfig.mode = VoiceClientConfig.Mode.PUSH_TO_TALK;
			voiceConfig.micMuted = false;
			voiceConfig.hearMyself = true;
			long receivedBefore = VoiceClient.mixer().framesReceived();
			VoiceClient.setHeldForTest(true, false);
			onMicThread(() -> { for (int i = 0; i < 25; i++) VoiceClient.onCapturedFrame(sine.clone()); });
			context.waitTicks(20);
			VoiceClient.setHeldForTest(false, false);
			voiceConfig.hearMyself = false;
			long relayed = VoiceClient.mixer().framesReceived() - receivedBefore;
			check(relayed >= 25, "push-to-talk frames should travel to the server and back (mic test), got " + relayed);
			onMicThread(() -> VoiceClient.onCapturedFrame(sine.clone()));
			context.waitTicks(5);
			check(VoiceClient.mixer().framesReceived() - receivedBefore == relayed, "nothing is sent when the talk key is released");

			for (Bond.Mood mood : Bond.Mood.values()) {
				short[] babble = LumenVoice.shape(LumenVoice.babble("Hello there, are you listening?", mood), mood);
				check(babble.length > Adpcm.SAMPLE_RATE / 2, "built-in babble voice should produce audio for " + mood);
			}
			sp.getServer().runCommand("effect clear @a");
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				Bond.of(p).staying = true;
				lumen.setStaying(true);
				Vec3d l = lumen.getEntityPos();
				p.networkHandler.requestTeleport(l.x + 1.6, l.y - 1.4, l.z + 1.6, 135f, 15f);
			});
			context.waitTicks(40);
			int lumenId = sp.getServer().computeOnServer(s -> {
				ServerPlayerEntity p = player(s);
				LumenEntity lumen = BondManager.find(p.getUuid());
				lumen.say(p, "Hello. Can you hear me now?");
				return lumen.getId();
			});
			boolean spoke = false;
			for (int i = 0; i < 150 && !spoke; i++) {
				context.waitTick();
				spoke = VoiceClient.mixer().isSpeaking("lumen:" + lumenId);
			}
			check(spoke, "Lumen should speak its line out loud");
			context.takeScreenshot("lumen_05_speaking");
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				Bond.of(p).staying = false;
				BondManager.find(p.getUuid()).setStaying(false);
			});
			System.out.println("[lumen-test] Lumen voice engine: " + LumenVoice.lastEngine());

			// 8. Online AI path (chat + speech recognition) against a local mock OpenAI-compatible endpoint.
			AtomicReference<String> lastRequest = new AtomicReference<>();
			AtomicReference<String> lastAudioRequest = new AtomicReference<>();
			HttpServer mock = startMock(lastRequest, lastAudioRequest);
			try {
				LumenConfig config = LumenConfig.get();
				config.apiKey = "test-key";
				config.apiUrl = "http://127.0.0.1:" + mock.getAddress().getPort() + "/v1/chat/completions";
				config.speechToTextUrl = "http://127.0.0.1:" + mock.getAddress().getPort() + "/v1/audio/transcriptions";
				config.enableAi = true;
				sp.getServer().runOnServer(s -> {
					ServerPlayerEntity p = player(s);
					check(LumenConfig.get().aiAvailable(), "AI should be available with a key");
					LumenCommand.talk(p, "Where should I look for diamonds?");
				});
				boolean applied = false;
				for (int i = 0; i < 100 && !applied; i++) {
					context.waitTicks(2);
					applied = sp.getServer().computeOnServer(s -> Bond.of(player(s)).trust == 25);
				}
				check(applied, "AI reply ([TRUST+5]) should be applied");
				String body = lastRequest.get();
				check(body != null && body.contains("Where should I look for diamonds?") && body.contains("\"role\":\"system\""), "request should carry the system prompt and message");

				// Hold "Talk to Lumen", speak, release: audio -> server -> speech-to-text -> Lumen.
				sp.getServer().runOnServer(s -> check(!Bond.of(player(s)).staying, "precondition: following"));
				VoiceClient.setHeldForTest(false, true);
				onMicThread(() -> {
					for (int i = 0; i < 60; i++) VoiceClient.onCapturedFrame(sine.clone());
					VoiceClient.setHeldForTest(false, false);
					VoiceClient.finishUtterance();
				});
				boolean voiceStayed = false;
				for (int i = 0; i < 100 && !voiceStayed; i++) {
					context.waitTicks(2);
					voiceStayed = sp.getServer().computeOnServer(s -> Bond.of(player(s)).staying);
				}
				String audioRequest = lastAudioRequest.get();
				check(audioRequest != null && audioRequest.contains("whisper-large-v3-turbo") && audioRequest.contains("RIFF"),
					"speech should be uploaded as WAV to the transcription endpoint");
				check(voiceStayed, "spoken 'please stay here' should make Lumen stay");
				sp.getServer().runCommand("execute as @p run lumen follow");
			} finally {
				mock.stop(0);
				LumenConfig.get().apiKey = "";
			}

			// 9. /lumen release unbinds and removes it.
			sp.getServer().runCommand("execute as @p run lumen release");
			context.waitTicks(5);
			sp.getServer().runOnServer(s -> {
				ServerPlayerEntity p = player(s);
				check(!Bond.of(p).bound, "release should unbind");
				check(BondManager.find(p.getUuid()) == null, "release should remove the Lumen");
			});
		}
	}

	private static HttpServer startMock(AtomicReference<String> lastRequest, AtomicReference<String> lastAudioRequest) {
		try {
			HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			server.createContext("/v1/chat/completions", exchange -> {
				String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
				String auth = exchange.getRequestHeaders().getFirst("Authorization");
				lastRequest.set("Bearer test-key".equals(auth) ? body : null);
				var messages = com.google.gson.JsonParser.parseString(body).getAsJsonObject().getAsJsonArray("messages");
				String lastUser = messages.get(messages.size() - 1).getAsJsonObject().get("content").getAsString();
				String reply = lastUser.contains("please stay here")
					? "Fine, I will wait right here. [STAY]"
					: "Deep, below y=0, near the lava. Bring torches. [TRUST+5]";
				respond(exchange, "{\"id\":\"x\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"" + reply + "\"},\"finish_reason\":\"stop\"}]}");
			});
			server.createContext("/v1/audio/transcriptions", exchange -> {
				byte[] raw = exchange.getRequestBody().readAllBytes();
				String auth = exchange.getRequestHeaders().getFirst("Authorization");
				lastAudioRequest.set("Bearer test-key".equals(auth) ? new String(raw, StandardCharsets.ISO_8859_1) : null);
				respond(exchange, "{\"text\":\" please stay here\"}");
			});
			server.start();
			return server;
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}

	private static void respond(com.sun.net.httpserver.HttpExchange exchange, String json) throws java.io.IOException {
		byte[] response = json.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().add("Content-Type", "application/json");
		exchange.sendResponseHeaders(200, response.length);
		try (OutputStream out = exchange.getResponseBody()) {
			out.write(response);
		}
	}
}
