package dev.lumen.ai;

import dev.lumen.entity.LumenEntity;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraft.world.biome.Biome;

import java.util.List;
import java.util.Locale;

/** Builds a compact, human-readable snapshot of the owner's situation for the AI prompt. */
public final class Surroundings {
	private Surroundings() {}

	public static String describe(ServerPlayerEntity player, LumenEntity lumen) {
		ServerWorld world = player.getEntityWorld();
		BlockPos pos = player.getBlockPos();
		StringBuilder sb = new StringBuilder();

		String dimension;
		if (world.getRegistryKey() == World.NETHER) dimension = "the Nether";
		else if (world.getRegistryKey() == World.END) dimension = "the End";
		else if (world.getRegistryKey() == World.OVERWORLD) dimension = "the Overworld";
		else dimension = world.getRegistryKey().getValue().toString();
		sb.append("In ").append(dimension);

		RegistryEntry<Biome> biome = world.getBiome(pos);
		biome.getKey().ifPresent(k -> sb.append(", biome ").append(k.getValue().getPath().replace('_', ' ')));
		sb.append(", at height y=").append(pos.getY());
		if (world.getRegistryKey() == World.OVERWORLD) {
			if (!world.isSkyVisible(pos.up()) && pos.getY() < 50) sb.append(" (underground)");
			long time = world.getTimeOfDay() % 24000L;
			sb.append(time >= 13000 && time < 23000 ? ", it is night" : ", it is daytime");
			if (world.isThundering()) sb.append(", a thunderstorm rages");
			else if (world.isRaining()) sb.append(", it is raining");
		}

		sb.append(". Player health ").append(Math.round(player.getHealth())).append("/").append(Math.round(player.getMaxHealth()));
		sb.append(", hunger ").append(player.getHungerManager().getFoodLevel()).append("/20");
		ItemStack held = player.getMainHandStack();
		if (!held.isEmpty()) sb.append(", holding ").append(held.getName().getString().toLowerCase(Locale.ROOT));
		if (player.isCreative()) sb.append(", in creative mode");

		List<HostileEntity> hostiles = world.getEntitiesByClass(HostileEntity.class, player.getBoundingBox().expand(16), e -> e.isAlive());
		if (!hostiles.isEmpty()) {
			sb.append(". Nearby hostile mobs: ");
			hostiles.stream().map(h -> h.getType().getName().getString().toLowerCase(Locale.ROOT)).distinct().limit(5)
				.forEach(n -> sb.append(n).append(", "));
			sb.setLength(sb.length() - 2);
		}
		if (lumen.isStaying()) sb.append(". You are currently waiting in place, not following");
		sb.append('.');
		return sb.toString();
	}
}
