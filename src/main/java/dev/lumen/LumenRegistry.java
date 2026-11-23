package dev.lumen;

import dev.lumen.block.LumenVesselBlock;
import dev.lumen.block.LumenVesselBlockEntity;
import dev.lumen.entity.HollowEntity;
import dev.lumen.entity.LumenEntity;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.MapColor;
import net.minecraft.block.entity.BlockEntityType;
import net.minecraft.block.piston.PistonBehavior;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroup;
import net.minecraft.item.ItemStack;
import net.minecraft.item.SpawnEggItem;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.sound.BlockSoundGroup;
import net.minecraft.text.Text;
import net.minecraft.util.Rarity;

public final class LumenRegistry {
	private LumenRegistry() {}

	// ------------------------------------------------------------------ entities
	public static final EntityType<LumenEntity> LUMEN = registerEntity("lumen",
		EntityType.Builder.create(LumenEntity::new, SpawnGroup.MISC)
			.dimensions(0.5f, 0.5f)
			.eyeHeight(0.25f)
			.maxTrackingRange(10)
			.trackingTickInterval(1)
			.makeFireImmune());

	public static final EntityType<HollowEntity> HOLLOW = registerEntity("hollow",
		EntityType.Builder.create(HollowEntity::new, SpawnGroup.MONSTER)
			.dimensions(0.6f, 2.9f)
			.eyeHeight(2.55f)
			.maxTrackingRange(8));

	// ------------------------------------------------------------------ blocks
	public static final RegistryKey<Block> LUMEN_VESSEL_KEY = RegistryKey.of(RegistryKeys.BLOCK, Lumen.id("lumen_vessel"));
	public static final Block LUMEN_VESSEL = Registry.register(Registries.BLOCK, LUMEN_VESSEL_KEY,
		new LumenVesselBlock(AbstractBlock.Settings.create()
			.registryKey(LUMEN_VESSEL_KEY)
			.mapColor(MapColor.PALE_PURPLE)
			.strength(1.5f, 6.0f)
			.sounds(BlockSoundGroup.AMETHYST_BLOCK)
			.luminance(state -> state.get(LumenVesselBlock.AWAKENING) ? 15 : 7)
			.pistonBehavior(PistonBehavior.BLOCK)
			.nonOpaque()));

	public static final BlockEntityType<LumenVesselBlockEntity> LUMEN_VESSEL_BLOCK_ENTITY = Registry.register(
		Registries.BLOCK_ENTITY_TYPE, Lumen.id("lumen_vessel"),
		FabricBlockEntityTypeBuilder.create(LumenVesselBlockEntity::new, LUMEN_VESSEL).build());

	// ------------------------------------------------------------------ items
	public static final Item LUMEN_VESSEL_ITEM = registerItem("lumen_vessel",
		settings -> new BlockItem(LUMEN_VESSEL, settings), new Item.Settings().rarity(Rarity.RARE).useBlockPrefixedTranslationKey());
	public static final Item HOLLOW_SHARD = registerItem("hollow_shard", Item::new, new Item.Settings().rarity(Rarity.UNCOMMON));
	public static final Item LUMEN_SPAWN_EGG = registerItem("lumen_spawn_egg", SpawnEggItem::new, new Item.Settings().spawnEgg(LUMEN));
	public static final Item HOLLOW_SPAWN_EGG = registerItem("hollow_spawn_egg", SpawnEggItem::new, new Item.Settings().spawnEgg(HOLLOW));

	public static final ItemGroup GROUP = Registry.register(Registries.ITEM_GROUP, Lumen.id("main"),
		FabricItemGroup.builder()
			.icon(() -> new ItemStack(LUMEN_VESSEL_ITEM))
			.displayName(Text.translatable("itemGroup.lumen"))
			.entries((context, entries) -> {
				entries.add(LUMEN_VESSEL_ITEM);
				entries.add(HOLLOW_SHARD);
				entries.add(LUMEN_SPAWN_EGG);
				entries.add(HOLLOW_SPAWN_EGG);
			})
			.build());

	private static <T extends net.minecraft.entity.Entity> EntityType<T> registerEntity(String name, EntityType.Builder<T> builder) {
		RegistryKey<EntityType<?>> key = RegistryKey.of(RegistryKeys.ENTITY_TYPE, Lumen.id(name));
		return Registry.register(Registries.ENTITY_TYPE, key, builder.build(key));
	}

	private static Item registerItem(String name, java.util.function.Function<Item.Settings, Item> factory, Item.Settings settings) {
		RegistryKey<Item> key = RegistryKey.of(RegistryKeys.ITEM, Lumen.id(name));
		return Registry.register(Registries.ITEM, key, factory.apply(settings.registryKey(key)));
	}

	public static void init() {
		FabricDefaultAttributeRegistry.register(LUMEN, LumenEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(HOLLOW, HollowEntity.createAttributes());
	}
}
