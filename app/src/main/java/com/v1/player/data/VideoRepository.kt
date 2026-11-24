package com.v1.player.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class VideoRepository(private val context: Context) {

    suspend fun loadVideos(): List<VideoItem> = withContext(Dispatchers.IO) {
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        }
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Video.Media.WIDTH,
            MediaStore.Video.Media.HEIGHT,
        )
        val videos = mutableListOf<VideoItem>()
        runCatching {
            context.contentResolver.query(
                collection, projection, null, null,
                "${MediaStore.Video.Media.DATE_ADDED} DESC"
            )?.use { c ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                val durCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
                val sizeCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                val dateCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED)
                val bucketCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)
                val wCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.WIDTH)
                val hCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.HEIGHT)
                while (c.moveToNext()) {
                    val id = c.getLong(idCol)
                    val name = c.getString(nameCol) ?: "Video"
                    videos += VideoItem(
                        id = id,
                        uri = ContentUris.withAppendedId(collection, id),
                        title = name.substringBeforeLast('.', name),
                        durationMs = c.getLong(durCol),
                        sizeBytes = c.getLong(sizeCol),
                        dateAddedSec = c.getLong(dateCol),
                        folder = c.getString(bucketCol) ?: "Other",
                        width = c.getInt(wCol),
                        height = c.getInt(hCol),
                    )
                }
            }
        }
        videos
    }

    companion object {
        /** Best-effort human readable name for any uri (content, file or http). */
        fun displayName(context: Context, uri: Uri): String {
            if (uri.scheme == "content") {
                runCatching {
                    context.contentResolver.query(
                        uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null
                    )?.use { c ->
                        if (c.moveToFirst()) {
                            val name = c.getString(0)
                            if (!name.isNullOrBlank()) return name.substringBeforeLast('.', name)
                        }
                    }
                }
            }
            val last = uri.lastPathSegment?.substringAfterLast('/')
            return if (last.isNullOrBlank()) uri.host ?: "Video" else Uri.decode(last).substringBeforeLast('.', last)
        }
    }
}
