package com.aidraw.net;

import com.aidraw.AiDrawMod;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/** Client -> server: the pixels (palette indices) of a drawing plus the player's optional hint. */
public record SubmitDrawingPayload(byte[] pixels, String hint) implements CustomPacketPayload {
    public static final Type<SubmitDrawingPayload> TYPE =
            new Type<>(Identifier.fromNamespaceAndPath(AiDrawMod.MOD_ID, "submit_drawing"));

    public static final StreamCodec<FriendlyByteBuf, SubmitDrawingPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.byteArray(4096), SubmitDrawingPayload::pixels,
            ByteBufCodecs.stringUtf8(100), SubmitDrawingPayload::hint,
            SubmitDrawingPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() { return TYPE; }
}
