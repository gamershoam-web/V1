package com.aidraw;

import com.aidraw.ai.AiConfig;
import com.aidraw.net.DrawingHandler;
import com.aidraw.net.SubmitDrawingPayload;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AiDrawMod implements ModInitializer {
    public static final String MOD_ID = "aidraw";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        AiConfig.load();
        ModItems.register();
        PayloadTypeRegistry.playC2S().register(SubmitDrawingPayload.TYPE, SubmitDrawingPayload.CODEC);
        ServerPlayNetworking.registerGlobalReceiver(SubmitDrawingPayload.TYPE, DrawingHandler::handle);
        LOGGER.info("AI Drawing Board loaded. AI {}.", AiConfig.get().hasKey() ? "ready" : "NOT configured (set apiKey in config/aidraw.json)");
    }
}
