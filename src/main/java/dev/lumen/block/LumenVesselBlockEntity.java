package dev.lumen.block;

import dev.lumen.LumenRegistry;
import dev.lumen.bond.BondManager;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.particle.TintedParticleEffect;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.Uuids;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

import java.util.UUID;

public class LumenVesselBlockEntity extends BlockEntity {
	public static final int AWAKEN_TICKS = 100;

	@Nullable
	private UUID activator;
	private int progress;

	public LumenVesselBlockEntity(BlockPos pos, BlockState state) {
		super(LumenRegistry.LUMEN_VESSEL_BLOCK_ENTITY, pos, state);
	}

	public void begin(UUID player) {
		this.activator = player;
		this.progress = 0;
		markDirty();
	}

	public static void serverTick(World world, BlockPos pos, BlockState state, LumenVesselBlockEntity vessel) {
		if (!state.get(LumenVesselBlock.AWAKENING) || !(world instanceof ServerWorld serverWorld)) return;
		if (vessel.activator == null) {
			world.setBlockState(pos, state.with(LumenVesselBlock.AWAKENING, false), Block.NOTIFY_ALL);
			return;
		}
		vessel.progress++;
		double x = pos.getX() + 0.5, y = pos.getY() + 0.45, z = pos.getZ() + 0.5;
		float t = vessel.progress / (float) AWAKEN_TICKS;

		// Spiral of light tightening around the vessel as it wakes.
		double angle = vessel.progress * 0.45;
		double radius = 1.2 * (1.0 - t) + 0.15;
		serverWorld.spawnParticles(ParticleTypes.END_ROD, x + Math.cos(angle) * radius, y + t * 0.8, z + Math.sin(angle) * radius, 1, 0, 0, 0, 0);
		serverWorld.spawnParticles(ParticleTypes.END_ROD, x - Math.cos(angle) * radius, y + t * 0.8, z - Math.sin(angle) * radius, 1, 0, 0, 0, 0);
		if (vessel.progress % 4 == 0) {
			serverWorld.spawnParticles(ParticleTypes.ENCHANT, x, y + 0.6, z, 6, 0.6, 0.4, 0.6, 0.5);
		}
		if (vessel.progress % 20 == 0) {
			serverWorld.playSound(null, pos, SoundEvents.BLOCK_AMETHYST_BLOCK_RESONATE, SoundCategory.BLOCKS, 0.8f + t, 0.6f + t);
		}
		if (vessel.progress == AWAKEN_TICKS - 30) {
			serverWorld.playSound(null, pos, SoundEvents.BLOCK_BEACON_POWER_SELECT, SoundCategory.BLOCKS, 1.0f, 1.5f);
		}

		if (vessel.progress >= AWAKEN_TICKS) {
			ServerPlayerEntity player = serverWorld.getServer().getPlayerManager().getPlayer(vessel.activator);
			if (player == null || player.getEntityWorld() != serverWorld) {
				// Nobody to bind to: the light goes back to sleep.
				vessel.activator = null;
				world.setBlockState(pos, state.with(LumenVesselBlock.AWAKENING, false), Block.NOTIFY_ALL);
				return;
			}
			serverWorld.spawnParticles(TintedParticleEffect.create(ParticleTypes.FLASH, 0xFFBFF4FF), x, y + 0.5, z, 1, 0, 0, 0, 0);
			serverWorld.spawnParticles(ParticleTypes.END_ROD, x, y + 0.5, z, 60, 0.1, 0.1, 0.1, 0.25);
			serverWorld.spawnParticles(ParticleTypes.GLOW, x, y + 0.5, z, 20, 0.4, 0.4, 0.4, 0.1);
			serverWorld.playSound(null, pos, SoundEvents.BLOCK_GLASS_BREAK, SoundCategory.BLOCKS, 1.0f, 0.8f);
			serverWorld.playSound(null, pos, SoundEvents.BLOCK_BEACON_ACTIVATE, SoundCategory.BLOCKS, 1.0f, 1.6f);
			world.removeBlock(pos, false);
			BondManager.manifest(player, new Vec3d(x, y + 0.6, z), true);
		}
	}

	@Override
	protected void writeData(WriteView view) {
		super.writeData(view);
		view.putNullable("Activator", Uuids.CODEC, activator);
		view.putInt("Progress", progress);
	}

	@Override
	protected void readData(ReadView view) {
		super.readData(view);
		this.activator = view.read("Activator", Uuids.CODEC).orElse(null);
		this.progress = view.getInt("Progress", 0);
	}
}
