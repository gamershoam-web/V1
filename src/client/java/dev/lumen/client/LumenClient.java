package dev.lumen.client;

import dev.lumen.LumenRegistry;
import dev.lumen.client.render.HollowEntityRenderer;
import dev.lumen.client.render.LumenEntityRenderer;
import dev.lumen.client.voice.VoiceClient;
import dev.lumen.client.voice.VoiceCommands;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.minecraft.client.render.BlockRenderLayer;
import net.minecraft.client.render.entity.EntityRendererFactories;

public class LumenClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		EntityRendererFactories.register(LumenRegistry.LUMEN, LumenEntityRenderer::new);
		EntityRendererFactories.register(LumenRegistry.HOLLOW, HollowEntityRenderer::new);
		BlockRenderLayerMap.putBlock(LumenRegistry.LUMEN_VESSEL, BlockRenderLayer.CUTOUT);
		VoiceClient.init();
		ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) -> VoiceCommands.register(dispatcher));
	}
}
