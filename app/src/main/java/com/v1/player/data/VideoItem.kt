package com.v1.player.data

import android.net.Uri

data class VideoItem(
    val id: Long,
    val uri: Uri,
    val title: String,
    val durationMs: Long,
    val sizeBytes: Long,
    val dateAddedSec: Long,
    val folder: String,
    val width: Int,
    val height: Int,
) {
    val thumbnail get() = VideoThumbnail(uri, id)
}

/** Lightweight description of something the player should play. */
data class PlayItem(val uri: Uri, val title: String)
