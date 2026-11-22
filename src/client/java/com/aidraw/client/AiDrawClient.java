package com.aidraw.client;

import com.aidraw.ClientHooks;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;

public class AiDrawClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        ClientHooks.openDrawingScreen = () -> Minecraft.getInstance().setScreen(new DrawingScreen());
    }
}
