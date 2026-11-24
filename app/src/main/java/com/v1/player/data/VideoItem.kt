package com.v1.player.data

import android.net.Uri

data class VideoItem(
    val id: Long,
    val uri: Uri,
    val title: String,
    /** File name including extension, e.g. "Holiday.mp4". */
    val fileName: String,
    val durationMs: Long,
    val sizeBytes: Long,
    val dateAddedSec: Long,
    val folder: String,
    val width: Int,
    val height: Int,
) {
    val thumbnail get() = VideoThumbnail(uri, id)
}

/**
 * Lightweight description of something the player should play.
 * [serverId] is set for videos streamed from your Lumen server; [resumeMs] overrides the locally saved position.
 */
data class PlayItem(
    val uri: Uri,
    val title: String,
    val serverId: String? = null,
    val resumeMs: Long? = null,
) {
    val mediaId: String get() = if (serverId != null) "server:$serverId" else uri.toString()
}
