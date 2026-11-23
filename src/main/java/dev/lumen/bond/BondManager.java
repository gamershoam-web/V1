package dev.lumen.bond;

import dev.lumen.LumenRegistry;
import dev.lumen.ai.Dialogue;
import dev.lumen.ai.LumenBrain;
import dev.lumen.ai.LumenConfig;
import dev.lumen.entity.LumenEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.Vec3d;
import org.jetbrains.annotations.Nullable;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Keeps each player's Lumen with them: re-manifests it when it gets left behind (dimension
 * change, long teleport, relog) and routes replies from the brain to the right entity.
 */
public final class BondManager {
	private static final Map<UUID, LumenEntity> ACTIVE = new HashMap<>();
	private static final Map<UUID, Integer> JOIN_TICK = new HashMap<>();

	private BondManager() {}

	public static void track(UUID owner, LumenEntity lumen) {
		ACTIVE.put(owner, lumen);
	}

	public static void untrack(UUID owner, LumenEntity lumen) {
		ACTIVE.remove(owner, lumen);
	}

	@Nullable
	public static LumenEntity find(UUID owner) {
		LumenEntity lumen = ACTIVE.get(owner);
		if (lumen != null && lumen.isRemoved()) {
			ACTIVE.remove(owner);
			return null;
		}
		return lumen;
	}

	public static void onJoin(ServerPlayerEntity player) {
		JOIN_TICK.put(player.getUuid(), player.getEntityWorld().getServer().getTicks());
		Bond bond = Bond.of(player);
		if (!bond.receivedVessel && LumenConfig.get().giveVesselOnFirstJoin) {
			bond.receivedVessel = true;
			if (!bond.bound) {
				player.giveItemStack(new ItemStack(LumenRegistry.LUMEN_VESSEL_ITEM));
				player.sendMessage(Text.translatable("message.lumen.vessel_gift").formatted(Formatting.LIGHT_PURPLE, Formatting.ITALIC), false);
			}
		}
	}

	public static void onLeave(ServerPlayerEntity player) {
		JOIN_TICK.remove(player.getUuid());
		LumenEntity lumen = find(player.getUuid());
		Bond bond = Bond.of(player);
		if (lumen != null && !bond.staying) {
			dissolveEffects(lumen);
			lumen.discard();
		}
	}

	public static void onServerStopped() {
		ACTIVE.clear();
		JOIN_TICK.clear();
	}

	/** Every second: make sure each following Lumen is actually near its owner. */
	public static void tick(MinecraftServer server) {
		if (server.getTicks() % 20 != 0) return;
		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			Bond bond = Bond.of(player);
			if (!bond.bound || bond.staying || !player.isAlive() || player.isSpectator()) continue;
			Integer joined = JOIN_TICK.get(player.getUuid());
			if (joined != null && server.getTicks() - joined < 60) continue; // let chunks load first

			LumenEntity lumen = find(player.getUuid());
			boolean lost = lumen == null
				|| lumen.getEntityWorld() != player.getEntityWorld()
				|| lumen.squaredDistanceTo(player) > 40 * 40;
			if (lost) {
				if (lumen != null) {
					dissolveEffects(lumen);
					lumen.discard();
				}
				manifest(player, null, false);
			}
		}
	}

	/** Creates a fresh Lumen for the player, retiring any previous one. */
	public static LumenEntity manifest(ServerPlayerEntity player, @Nullable Vec3d at, boolean firstAwakening) {
		Bond bond = Bond.of(player);
		LumenEntity old = find(player.getUuid());
		if (old != null) old.discard();

		bond.bound = true;
		bond.generation++;
		if (firstAwakening) bond.staying = false;

		ServerWorld world = player.getEntityWorld();
		LumenEntity lumen = LumenRegistry.LUMEN.create(world, SpawnReason.EVENT);
		if (lumen == null) return null;
		Vec3d pos = at != null ? at : player.getEyePos().add(player.getRotationVector().multiply(-0.8)).add(0, 0.4, 0);
		lumen.refreshPositionAndAngles(pos.x, pos.y, pos.z, player.getYaw(), 0);
		lumen.bind(player.getUuid(), bond.generation, bond.staying);
		world.spawnEntity(lumen);
		track(player.getUuid(), lumen);

		world.spawnParticles(ParticleTypes.END_ROD, pos.x, pos.y, pos.z, 20, 0.2, 0.2, 0.2, 0.05);
		world.playSound(null, pos.x, pos.y, pos.z, SoundEvents.BLOCK_AMETHYST_BLOCK_RESONATE, SoundCategory.NEUTRAL, 1.0f, 1.4f);
		if (firstAwakening) {
			lumen.say(player, Dialogue.greeting(lumen.getRandom(), player.getName().getString()));
		}
		return lumen;
	}

	/** Binds an unowned Lumen (e.g. from a spawn egg) to a player. */
	public static void adopt(ServerPlayerEntity player, LumenEntity lumen) {
		Bond bond = Bond.of(player);
		LumenEntity old = find(player.getUuid());
		if (old != null && old != lumen) old.discard();
		bond.bound = true;
		bond.generation++;
		bond.staying = false;
		lumen.bind(player.getUuid(), bond.generation, false);
		track(player.getUuid(), lumen);
		lumen.say(player, Dialogue.greeting(lumen.getRandom(), player.getName().getString()));
	}

	public static void release(ServerPlayerEntity player) {
		Bond bond = Bond.of(player);
		LumenEntity lumen = find(player.getUuid());
		if (lumen != null) {
			lumen.say(player, "So this is goodbye. I'll go back to sleep.");
			dissolveEffects(lumen);
			lumen.discard();
		}
		bond.bound = false;
		bond.staying = false;
		bond.generation++;
		LumenBrain.forget(player.getUuid());
	}

	/** Delivers a brain reply to the player's current Lumen (if it still exists). */
	public static void deliver(MinecraftServer server, UUID owner, LumenBrain.Reply reply) {
		ServerPlayerEntity player = server.getPlayerManager().getPlayer(owner);
		if (player == null) return;
		LumenEntity lumen = find(owner);
		if (lumen == null) return;
		lumen.apply(player, reply);
	}

	private static void dissolveEffects(LumenEntity lumen) {
		if (lumen.getEntityWorld() instanceof ServerWorld world) {
			world.spawnParticles(ParticleTypes.END_ROD, lumen.getX(), lumen.getY(), lumen.getZ(), 15, 0.2, 0.2, 0.2, 0.05);
			world.playSound(null, lumen.getX(), lumen.getY(), lumen.getZ(), SoundEvents.BLOCK_AMETHYST_BLOCK_STEP, SoundCategory.NEUTRAL, 1.0f, 1.6f);
		}
	}
}
