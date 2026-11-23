package dev.lumen.client.render;

import dev.lumen.Lumen;
import dev.lumen.bond.Bond;
import dev.lumen.entity.LumenEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.state.CameraRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;

/** Draws Lumen as a camera-facing glowing eye with an additive halo around it. */
public class LumenEntityRenderer extends EntityRenderer<LumenEntity, LumenRenderState> {
	private static final RenderLayer HALO = RenderLayers.eyes(Lumen.id("textures/entity/lumen/halo.png"));
	private static final RenderLayer[] ORB = new RenderLayer[Bond.Mood.values().length];
	private static final RenderLayer[] ORB_BLINK = new RenderLayer[Bond.Mood.values().length];

	static {
		for (Bond.Mood mood : Bond.Mood.values()) {
			String name = mood.name().toLowerCase();
			ORB[mood.ordinal()] = RenderLayers.entityTranslucentEmissive(Lumen.id("textures/entity/lumen/orb_" + name + ".png"));
			ORB_BLINK[mood.ordinal()] = RenderLayers.entityTranslucentEmissive(Lumen.id("textures/entity/lumen/orb_" + name + "_blink.png"));
		}
	}

	public LumenEntityRenderer(EntityRendererFactory.Context context) {
		super(context);
		this.shadowRadius = 0.0f;
	}

	@Override
	protected int getBlockLight(LumenEntity entity, BlockPos pos) {
		return 15;
	}

	@Override
	public LumenRenderState createRenderState() {
		return new LumenRenderState();
	}

	@Override
	public void updateRenderState(LumenEntity entity, LumenRenderState state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		state.mood = entity.getMood();
		state.thinking = entity.isThinking();
		// Blink for 3 ticks roughly every 4-5 seconds, offset per entity.
		int cycle = (int) ((entity.age + (entity.getId() * 37L)) % 90);
		state.blinking = cycle < 3;
		state.hurtFlash = entity.hurtTime > 0 ? (entity.hurtTime - tickProgress) / 10.0f : 0.0f;
	}

	@Override
	public void render(LumenRenderState state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
		float pulse = state.thinking
			? 1.0f + 0.12f * MathHelper.sin(state.age * 0.6f)
			: 1.0f + 0.04f * MathHelper.sin(state.age * 0.12f);
		int haloColor = switch (state.mood) {
			case CALM -> 0xFF9FE8FF;
			case UNEASY -> 0xFFFFB347;
			case HOSTILE -> 0xFFB0102A;
		};
		if (state.hurtFlash > 0) haloColor = 0xFFFF4040;

		matrices.push();
		matrices.translate(0.0f, 0.25f, 0.0f);
		matrices.multiply(cameraState.orientation);

		// Halo (additive glow).
		matrices.push();
		float haloScale = 1.25f * pulse;
		matrices.scale(haloScale, haloScale, haloScale);
		final int halo = haloColor;
		queue.submitCustom(matrices, HALO, (entry, consumer) -> quad(consumer, entry, state.light, halo));
		matrices.pop();

		// The eye itself, slightly in front of the halo.
		matrices.push();
		matrices.translate(0.0f, 0.0f, 0.01f);
		float orbScale = 0.55f * pulse;
		matrices.scale(orbScale, orbScale, orbScale);
		RenderLayer layer = (state.blinking ? ORB_BLINK : ORB)[state.mood.ordinal()];
		queue.submitCustom(matrices, layer, (entry, consumer) -> quad(consumer, entry, state.light, 0xFFFFFFFF));
		matrices.pop();

		matrices.pop();
		super.render(state, matrices, queue, cameraState);
	}

	private static void quad(VertexConsumer consumer, MatrixStack.Entry entry, int light, int color) {
		vertex(consumer, entry, light, color, -0.5f, -0.5f, 0, 1);
		vertex(consumer, entry, light, color, 0.5f, -0.5f, 1, 1);
		vertex(consumer, entry, light, color, 0.5f, 0.5f, 1, 0);
		vertex(consumer, entry, light, color, -0.5f, 0.5f, 0, 0);
	}

	private static void vertex(VertexConsumer consumer, MatrixStack.Entry entry, int light, int color, float x, float y, float u, float v) {
		consumer.vertex(entry, x, y, 0.0f)
			.color(color)
			.texture(u, v)
			.overlay(OverlayTexture.DEFAULT_UV)
			.light(light)
			.normal(entry, 0.0f, 1.0f, 0.0f);
	}
}
