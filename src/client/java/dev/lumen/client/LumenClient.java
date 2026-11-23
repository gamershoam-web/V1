package dev.lumen.client;

import dev.lumen.LumenRegistry;
import dev.lumen.client.render.HollowEntityRenderer;
import dev.lumen.client.render.LumenEntityRenderer;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.minecraft.client.render.BlockRenderLayer;
import net.minecraft.client.render.entity.EntityRendererFactories;

public class LumenClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		EntityRendererFactories.register(LumenRegistry.LUMEN, LumenEntityRenderer::new);
		EntityRendererFactories.register(LumenRegistry.HOLLOW, HollowEntityRenderer::new);
		BlockRenderLayerMap.putBlock(LumenRegistry.LUMEN_VESSEL, BlockRenderLayer.CUTOUT);
	}
}
