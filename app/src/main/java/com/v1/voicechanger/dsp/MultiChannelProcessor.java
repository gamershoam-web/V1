package com.v1.voicechanger.dsp;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Runs one {@link VoiceProcessor} per channel over interleaved PCM in all formats AudioRecord can produce. */
public final class MultiChannelProcessor {
    private final VoiceProcessor[] chains;
    private final int channels;

    public MultiChannelProcessor(int sampleRate, int channels) {
        this.channels = Math.max(1, channels);
        chains = new VoiceProcessor[this.channels];
        for (int i = 0; i < this.channels; i++) chains[i] = new VoiceProcessor(sampleRate);
    }

    public void setParams(VoiceParams params) {
        for (VoiceProcessor c : chains) c.setParams(params);
    }

    public void processShorts(short[] data, int offset, int count) {
        int end = Math.min(data.length, offset + count);
        int ch = 0;
        for (int i = offset; i < end; i++) {
            data[i] = toShort(chains[ch].process(data[i] / 32768f));
            if (++ch == channels) ch = 0;
        }
    }

    public void processFloats(float[] data, int offset, int count) {
        int end = Math.min(data.length, offset + count);
        int ch = 0;
        for (int i = offset; i < end; i++) {
            data[i] = chains[ch].process(data[i]);
            if (++ch == channels) ch = 0;
        }
    }

    /** 16-bit little-endian PCM in a byte array. */
    public void processPcm16Bytes(byte[] data, int offset, int byteCount) {
        int end = Math.min(data.length, offset + byteCount) - 1;
        int ch = 0;
        for (int i = offset; i < end; i += 2) {
            short s = (short) ((data[i] & 0xff) | (data[i + 1] << 8));
            short o = toShort(chains[ch].process(s / 32768f));
            data[i] = (byte) o;
            data[i + 1] = (byte) (o >> 8);
            if (++ch == channels) ch = 0;
        }
    }

    /** 16-bit PCM in a (usually direct) ByteBuffer, using absolute access so the caller's position/order is untouched. */
    public void processPcm16Buffer(ByteBuffer buffer, int position, int byteCount) {
        ByteBuffer b = buffer.duplicate().order(ByteOrder.nativeOrder());
        int end = Math.min(b.limit(), position + byteCount) - 1;
        int ch = 0;
        for (int i = position; i < end; i += 2) {
            short o = toShort(chains[ch].process(b.getShort(i) / 32768f));
            b.putShort(i, o);
            if (++ch == channels) ch = 0;
        }
    }

    /** 32-bit float PCM in a ByteBuffer. */
    public void processFloatBuffer(ByteBuffer buffer, int position, int byteCount) {
        ByteBuffer b = buffer.duplicate().order(ByteOrder.nativeOrder());
        int end = Math.min(b.limit(), position + byteCount) - 3;
        int ch = 0;
        for (int i = position; i < end; i += 4) {
            b.putFloat(i, chains[ch].process(b.getFloat(i)));
            if (++ch == channels) ch = 0;
        }
    }

    private static short toShort(float v) {
        int s = Math.round(v * 32767f);
        if (s > 32767) s = 32767;
        else if (s < -32768) s = -32768;
        return (short) s;
    }
}
