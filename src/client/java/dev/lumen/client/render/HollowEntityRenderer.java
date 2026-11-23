package dev.lumen.client.render;

import dev.lumen.Lumen;
import dev.lumen.entity.HollowEntity;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.entity.BipedEntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.feature.EyesFeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.EndermanEntityModel;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.state.EndermanEntityRenderState;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;

/** The Hollow reuses the gaunt enderman skeleton with its own skin and glowing eyes. */
public class HollowEntityRenderer extends MobEntityRenderer<HollowEntity, EndermanEntityRenderState, EndermanEntityModel<EndermanEntityRenderState>> {
	private static final Identifier TEXTURE = Lumen.id("textures/entity/hollow/hollow.png");
	private static final RenderLayer EYES = RenderLayers.eyes(Lumen.id("textures/entity/hollow/hollow_eyes.png"));
	private final Random random = Random.create();

	public HollowEntityRenderer(EntityRendererFactory.Context context) {
		super(context, new EndermanEntityModel<>(context.getPart(EntityModelLayers.ENDERMAN)), 0.5f);
		this.addFeature(new Eyes(this));
	}

	@Override
	public Identifier getTexture(EndermanEntityRenderState state) {
		return TEXTURE;
	}

	@Override
	public EndermanEntityRenderState createRenderState() {
		return new EndermanEntityRenderState();
	}

	@Override
	public void updateRenderState(HollowEntity entity, EndermanEntityRenderState state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		BipedEntityRenderer.updateBipedRenderState(entity, state, tickProgress, this.itemModelResolver);
		state.angry = entity.isAttacking();
		state.carriedBlock = null;
	}

	@Override
	public Vec3d getPositionOffset(EndermanEntityRenderState state) {
		Vec3d offset = super.getPositionOffset(state);
		if (state.angry) {
			double d = 0.015 * state.baseScale;
			return offset.add(random.nextGaussian() * d, 0.0, random.nextGaussian() * d);
		}
		return offset;
	}

	private static final class Eyes extends EyesFeatureRenderer<EndermanEntityRenderState, EndermanEntityModel<EndermanEntityRenderState>> {
		Eyes(FeatureRendererContext<EndermanEntityRenderState, EndermanEntityModel<EndermanEntityRenderState>> context) {
			super(context);
		}

		@Override
		public RenderLayer getEyesTexture() {
			return EYES;
		}
	}
}
