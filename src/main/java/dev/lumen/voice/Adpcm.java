package dev.lumen.voice;

/**
 * IMA ADPCM codec (4 bits per sample, 4:1 compression). Every frame carries its own 3-byte
 * header (predictor + step index), so frames decode independently and a lost or late frame
 * never corrupts the next one. Pure Java, no native libraries: works on every platform.
 * <p>
 * 20 ms of 16 kHz mono audio (320 samples) becomes 163 bytes, about 65 kbit/s per speaker.
 */
public final class Adpcm {
	public static final int SAMPLE_RATE = 16000;
	public static final int FRAME_SAMPLES = 320; // 20 ms
	public static final int HEADER_BYTES = 3;

	private static final int[] INDEX_TABLE = {-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8};
	private static final int[] STEP_TABLE = {
		7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
		130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
		1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
		7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
	};

	private Adpcm() {}

	public static int encodedSize(int samples) {
		return HEADER_BYTES + (samples + 1) / 2;
	}

	public static byte[] encode(short[] pcm, int offset, int length) {
		byte[] out = new byte[encodedSize(length)];
		int predictor = pcm[offset];
		int index = 0;
		// Choose a starting step index that suits the frame's first difference.
		if (length > 1) {
			int diff = Math.abs(pcm[offset + 1] - pcm[offset]);
			while (index < 88 && STEP_TABLE[index] < diff) index++;
		}
		out[0] = (byte) predictor;
		out[1] = (byte) (predictor >> 8);
		out[2] = (byte) index;
		for (int i = 0; i < length; i++) {
			int sample = pcm[offset + i];
			int step = STEP_TABLE[index];
			int diff = sample - predictor;
			int nibble = 0;
			if (diff < 0) {
				nibble = 8;
				diff = -diff;
			}
			int delta = step >> 3;
			if (diff >= step) { nibble |= 4; diff -= step; delta += step; }
			step >>= 1;
			if (diff >= step) { nibble |= 2; diff -= step; delta += step; }
			step >>= 1;
			if (diff >= step) { nibble |= 1; delta += step; }
			predictor += (nibble & 8) != 0 ? -delta : delta;
			predictor = Math.max(-32768, Math.min(32767, predictor));
			index = Math.max(0, Math.min(88, index + INDEX_TABLE[nibble]));
			int pos = HEADER_BYTES + i / 2;
			if ((i & 1) == 0) out[pos] = (byte) nibble;
			else out[pos] |= (byte) (nibble << 4);
		}
		return out;
	}

	public static short[] decode(byte[] data, int samples) {
		short[] out = new short[samples];
		if (data.length < HEADER_BYTES) return out;
		int predictor = (short) ((data[0] & 0xFF) | (data[1] << 8));
		int index = Math.max(0, Math.min(88, data[2] & 0xFF));
		for (int i = 0; i < samples; i++) {
			int pos = HEADER_BYTES + i / 2;
			if (pos >= data.length) break;
			int nibble = (i & 1) == 0 ? data[pos] & 0x0F : (data[pos] >> 4) & 0x0F;
			int step = STEP_TABLE[index];
			int delta = step >> 3;
			if ((nibble & 4) != 0) delta += step;
			if ((nibble & 2) != 0) delta += step >> 1;
			if ((nibble & 1) != 0) delta += step >> 2;
			predictor += (nibble & 8) != 0 ? -delta : delta;
			predictor = Math.max(-32768, Math.min(32767, predictor));
			index = Math.max(0, Math.min(88, index + INDEX_TABLE[nibble]));
			out[i] = (short) predictor;
		}
		return out;
	}

	/** Number of PCM samples stored in an encoded frame of this size. */
	public static int samplesIn(int encodedBytes) {
		return Math.max(0, (encodedBytes - HEADER_BYTES) * 2);
	}
}
