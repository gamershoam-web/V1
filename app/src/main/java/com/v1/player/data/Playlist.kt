package com.v1.player.data

import android.net.Uri

/**
 * Hands the list the user was browsing over to the player, so next/previous work.
 * Kept in memory instead of in the Intent to stay clear of Binder size limits.
 */
object Playlist {
    private var items: List<PlayItem> = emptyList()
    private var start = 0

    fun set(items: List<PlayItem>, start: Int) {
        this.items = items
        this.start = start
    }

    /** Returns the pending playlist if it starts with [uri], and clears it either way. */
    fun take(uri: Uri): Pair<List<PlayItem>, Int>? {
        val result = if (items.getOrNull(start)?.uri == uri) items to start else null
        items = emptyList()
        start = 0
        return result
    }
}
