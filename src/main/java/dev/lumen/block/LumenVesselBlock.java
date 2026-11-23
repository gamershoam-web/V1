package dev.lumen.block;

import com.mojang.serialization.MapCodec;
import dev.lumen.LumenRegistry;
import dev.lumen.bond.Bond;
import dev.lumen.bond.BondManager;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.BlockWithEntity;
import net.minecraft.block.ShapeContext;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.block.entity.BlockEntityTicker;
import net.minecraft.block.entity.BlockEntityType;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.BooleanProperty;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;
import net.minecraft.particle.ParticleTypes;
import org.jetbrains.annotations.Nullable;

/** A sealed vessel. Use it and whatever sleeps inside wakes up and binds itself to you. */
public class LumenVesselBlock extends BlockWithEntity {
	public static final MapCodec<LumenVesselBlock> CODEC = createCodec(LumenVesselBlock::new);
	public static final BooleanProperty AWAKENING = BooleanProperty.of("awakening");
	private static final VoxelShape SHAPE = Block.createCuboidShape(2, 0, 2, 14, 14, 14);

	public LumenVesselBlock(Settings settings) {
		super(settings);
		this.setDefaultState(this.getStateManager().getDefaultState().with(AWAKENING, false));
	}

	@Override
	protected MapCodec<? extends BlockWithEntity> getCodec() {
		return CODEC;
	}

	@Override
	protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
		builder.add(AWAKENING);
	}

	@Override
	protected VoxelShape getOutlineShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
		return SHAPE;
	}

	@Override
	protected ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
		if (state.get(AWAKENING)) return ActionResult.CONSUME;
		if (!(player instanceof ServerPlayerEntity serverPlayer)) return ActionResult.SUCCESS;

		Bond bond = Bond.of(serverPlayer);
		if (bond.bound && BondManager.find(serverPlayer.getUuid()) != null) {
			serverPlayer.sendMessage(Text.translatable("message.lumen.already_bound").formatted(Formatting.GRAY), true);
			return ActionResult.FAIL;
		}
		if (world.getBlockEntity(pos) instanceof LumenVesselBlockEntity vessel) {
			world.setBlockState(pos, state.with(AWAKENING, true), Block.NOTIFY_ALL);
			vessel.begin(serverPlayer.getUuid());
			world.playSound(null, pos, SoundEvents.BLOCK_END_PORTAL_FRAME_FILL, SoundCategory.BLOCKS, 1.0f, 0.7f);
			serverPlayer.sendMessage(Text.translatable("message.lumen.awakening").formatted(Formatting.LIGHT_PURPLE, Formatting.ITALIC), true);
		}
		return ActionResult.SUCCESS_SERVER;
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(3) == 0) {
			world.addParticleClient(ParticleTypes.END_ROD,
				pos.getX() + 0.5 + (random.nextDouble() - 0.5) * 0.4, pos.getY() + 0.4, pos.getZ() + 0.5 + (random.nextDouble() - 0.5) * 0.4,
				0, 0.02, 0);
		}
	}

	@Override
	public @Nullable BlockEntity createBlockEntity(BlockPos pos, BlockState state) {
		return new LumenVesselBlockEntity(pos, state);
	}

	@Override
	public @Nullable <T extends BlockEntity> BlockEntityTicker<T> getTicker(World world, BlockState state, BlockEntityType<T> type) {
		if (world.isClient()) return null;
		return validateTicker(type, LumenRegistry.LUMEN_VESSEL_BLOCK_ENTITY, LumenVesselBlockEntity::serverTick);
	}
}
