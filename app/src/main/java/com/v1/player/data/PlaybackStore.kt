package com.v1.player.data

import android.content.Context

/** Remembers where each video was left off (and when) so playback can resume. */
class PlaybackStore(context: Context) {
    private val prefs = context.getSharedPreferences("playback_positions", Context.MODE_PRIVATE)
    private val times = context.getSharedPreferences("playback_times", Context.MODE_PRIVATE)

    fun position(key: String): Long = prefs.getLong(key, 0L)

    fun save(key: String, positionMs: Long, durationMs: Long) {
        val finished = durationMs > 0 && positionMs >= durationMs - END_MARGIN_MS
        if (positionMs < MIN_POSITION_MS || finished) {
            clear(key)
        } else {
            prefs.edit().putLong(key, positionMs).apply()
            times.edit().putLong(key, System.currentTimeMillis()).apply()
        }
    }

    fun clear(key: String) {
        prefs.edit().remove(key).apply()
        times.edit().remove(key).apply()
    }

    fun all(): Map<String, Long> =
        prefs.all.mapNotNull { (k, v) -> (v as? Long)?.let { k to it } }.toMap()

    /** When each saved position was last updated (ms since epoch). */
    fun updatedTimes(): Map<String, Long> =
        times.all.mapNotNull { (k, v) -> (v as? Long)?.let { k to it } }.toMap()

    private companion object {
        const val MIN_POSITION_MS = 5_000L
        const val END_MARGIN_MS = 5_000L
    }
}
