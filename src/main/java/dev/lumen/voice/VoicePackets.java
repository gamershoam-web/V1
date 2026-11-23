package dev.lumen.voice;

import dev.lumen.Lumen;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Uuids;

import java.util.UUID;

/** All voice traffic rides the normal game connection: no extra ports, works offline and on LAN. */
public final class VoicePackets {
	private VoicePackets() {}

	public static final int MAX_FRAME_BYTES = 512;
	public static final int MAX_UTTERANCE_BYTES = 200_000; // ~25 s of ADPCM

	/** Client to server: one 20 ms microphone frame. */
	public record VoiceFrameC2S(int sequence, boolean loopback, byte[] data) implements CustomPayload {
		public static final Id<VoiceFrameC2S> ID = new Id<>(Lumen.id("voice_frame_c2s"));
		public static final PacketCodec<RegistryByteBuf, VoiceFrameC2S> CODEC = PacketCodec.tuple(
			PacketCodecs.VAR_INT, VoiceFrameC2S::sequence,
			PacketCodecs.BOOLEAN, VoiceFrameC2S::loopback,
			PacketCodecs.byteArray(MAX_FRAME_BYTES), VoiceFrameC2S::data,
			VoiceFrameC2S::new);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** Server to client: a frame spoken by a nearby player. */
	public record VoiceFrameS2C(UUID speaker, int sequence, byte[] data) implements CustomPayload {
		public static final Id<VoiceFrameS2C> ID = new Id<>(Lumen.id("voice_frame_s2c"));
		public static final PacketCodec<RegistryByteBuf, VoiceFrameS2C> CODEC = PacketCodec.tuple(
			Uuids.PACKET_CODEC, VoiceFrameS2C::speaker,
			PacketCodecs.VAR_INT, VoiceFrameS2C::sequence,
			PacketCodecs.byteArray(MAX_FRAME_BYTES), VoiceFrameS2C::data,
			VoiceFrameS2C::new);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** Server to client on join: whether voice is enabled here, and its settings. */
	public record VoiceStateS2C(boolean enabled, float range, boolean speechRecognition) implements CustomPayload {
		public static final Id<VoiceStateS2C> ID = new Id<>(Lumen.id("voice_state"));
		public static final PacketCodec<RegistryByteBuf, VoiceStateS2C> CODEC = PacketCodec.tuple(
			PacketCodecs.BOOLEAN, VoiceStateS2C::enabled,
			PacketCodecs.FLOAT, VoiceStateS2C::range,
			PacketCodecs.BOOLEAN, VoiceStateS2C::speechRecognition,
			VoiceStateS2C::new);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** Server to client: a Lumen says something out loud. The client synthesises the voice locally. */
	public record LumenSpeechS2C(int entityId, int mood, String text) implements CustomPayload {
		public static final Id<LumenSpeechS2C> ID = new Id<>(Lumen.id("lumen_speech"));
		public static final PacketCodec<RegistryByteBuf, LumenSpeechS2C> CODEC = PacketCodec.tuple(
			PacketCodecs.VAR_INT, LumenSpeechS2C::entityId,
			PacketCodecs.VAR_INT, LumenSpeechS2C::mood,
			PacketCodecs.string(1024), LumenSpeechS2C::text,
			LumenSpeechS2C::new);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** Client to server: a whole spoken sentence for your Lumen (ADPCM frames back to back). */
	public record LumenUtteranceC2S(byte[] audio) implements CustomPayload {
		public static final Id<LumenUtteranceC2S> ID = new Id<>(Lumen.id("lumen_utterance"));
		public static final PacketCodec<RegistryByteBuf, LumenUtteranceC2S> CODEC = PacketCodec.tuple(
			PacketCodecs.byteArray(MAX_UTTERANCE_BYTES), LumenUtteranceC2S::audio,
			LumenUtteranceC2S::new);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	public static void register() {
		PayloadTypeRegistry.playC2S().register(VoiceFrameC2S.ID, VoiceFrameC2S.CODEC);
		PayloadTypeRegistry.playS2C().register(VoiceFrameS2C.ID, VoiceFrameS2C.CODEC);
		PayloadTypeRegistry.playS2C().register(VoiceStateS2C.ID, VoiceStateS2C.CODEC);
		PayloadTypeRegistry.playS2C().register(LumenSpeechS2C.ID, LumenSpeechS2C.CODEC);
		PayloadTypeRegistry.playC2S().registerLarge(LumenUtteranceC2S.ID, LumenUtteranceC2S.CODEC, MAX_UTTERANCE_BYTES + 64);
	}
}
