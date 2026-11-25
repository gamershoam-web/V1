package com.v1.voicechanger.xposed;

import android.media.AudioFormat;
import android.media.AudioRecord;

import com.v1.voicechanger.ModuleStatus;
import com.v1.voicechanger.Settings;
import com.v1.voicechanger.dsp.MultiChannelProcessor;

import java.nio.ByteBuffer;
import java.util.Map;
import java.util.WeakHashMap;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

/**
 * LSPosed entry point. In every app selected in the LSPosed scope (Discord, WhatsApp, ...)
 * this hooks all AudioRecord.read(...) overloads and runs the voice effect over the
 * microphone samples right after the system delivers them - so the other side of the call
 * hears the changed voice.
 */
public final class HookEntry implements IXposedHookLoadPackage {

    /** Some read overloads call other read overloads; only process at the outermost call. */
    private static final ThreadLocal<int[]> DEPTH = new ThreadLocal<int[]>() {
        @Override
        protected int[] initialValue() {
            return new int[1];
        }
    };

    private static final Map<AudioRecord, State> STATES = new WeakHashMap<>();

    private static final class State {
        final MultiChannelProcessor processor;
        int version = -1;

        State(MultiChannelProcessor p) {
            processor = p;
        }
    }

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) {
        if (Settings.PACKAGE.equals(lpparam.packageName)) {
            XposedHelpers.findAndHookMethod(ModuleStatus.class.getName(), lpparam.classLoader,
                    "isHookedIntoSelf", new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            param.setResult(Boolean.TRUE);
                        }
                    });
            return;
        }

        HookConfig.init();
        XposedBridge.hookAllMethods(AudioRecord.class, "read", new XC_MethodHook() {
            @Override
            protected void beforeHookedMethod(MethodHookParam param) {
                DEPTH.get()[0]++;
            }

            @Override
            protected void afterHookedMethod(MethodHookParam param) {
                int[] depth = DEPTH.get();
                if (--depth[0] > 0) return;
                try {
                    process(param);
                } catch (Throwable t) {
                    // Never break the host app's audio because of us.
                }
            }
        });
        XposedBridge.log("V1VoiceChanger: hooked AudioRecord in " + lpparam.packageName);
    }

    private static void process(XC_MethodHook.MethodHookParam param) {
        if (param.hasThrowable()) return;
        Object result = param.getResult();
        if (!(result instanceof Integer)) return;
        int count = (Integer) result;
        if (count <= 0 || param.args == null || param.args.length < 2) return;

        HookConfig.poll();
        if (!HookConfig.enabled()) return;

        AudioRecord rec = (AudioRecord) param.thisObject;
        State state = stateFor(rec);
        if (state == null) return;
        int v = HookConfig.version();
        if (state.version != v) {
            state.processor.setParams(HookConfig.params());
            state.version = v;
        }

        Object buf = param.args[0];
        int encoding = rec.getAudioFormat();
        if (buf instanceof short[]) {
            state.processor.processShorts((short[]) buf, (Integer) param.args[1], count);
        } else if (buf instanceof float[]) {
            state.processor.processFloats((float[]) buf, (Integer) param.args[1], count);
        } else if (buf instanceof byte[]) {
            if (encoding == AudioFormat.ENCODING_PCM_16BIT || encoding == AudioFormat.ENCODING_DEFAULT) {
                state.processor.processPcm16Bytes((byte[]) buf, (Integer) param.args[1], count);
            }
        } else if (buf instanceof ByteBuffer) {
            ByteBuffer bb = (ByteBuffer) buf;
            // AudioRecord.read(ByteBuffer, ...) writes from the buffer's position and leaves it unchanged.
            if (encoding == AudioFormat.ENCODING_PCM_16BIT || encoding == AudioFormat.ENCODING_DEFAULT) {
                state.processor.processPcm16Buffer(bb, bb.position(), count);
            } else if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
                state.processor.processFloatBuffer(bb, bb.position(), count);
            }
        }
    }

    private static State stateFor(AudioRecord rec) {
        synchronized (STATES) {
            State s = STATES.get(rec);
            if (s == null) {
                int rate = rec.getSampleRate();
                int channels = rec.getChannelCount();
                if (rate <= 0) return null;
                s = new State(new MultiChannelProcessor(rate, channels));
                STATES.put(rec, s);
            }
            return s;
        }
    }
}
