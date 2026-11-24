package com.v1.player.data

import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import coil.ImageLoader
import coil.decode.DataSource
import coil.fetch.DrawableResult
import coil.fetch.FetchResult
import coil.fetch.Fetcher
import coil.key.Keyer
import coil.request.Options

/** Coil model that loads the system's cached MediaStore thumbnail (fast, no decoding of the video). */
data class VideoThumbnail(val uri: Uri, val id: Long)

class VideoThumbnailFetcher(
    private val data: VideoThumbnail,
    private val options: Options,
) : Fetcher {

    @Suppress("DEPRECATION")
    override suspend fun fetch(): FetchResult {
        val resolver = options.context.contentResolver
        val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            resolver.loadThumbnail(data.uri, Size(512, 512), null)
        } else {
            MediaStore.Video.Thumbnails.getThumbnail(
                resolver, data.id, MediaStore.Video.Thumbnails.MINI_KIND, null
            ) ?: error("No thumbnail for ${data.uri}")
        }
        return DrawableResult(
            drawable = BitmapDrawable(options.context.resources, bitmap),
            isSampled = true,
            dataSource = DataSource.DISK,
        )
    }

    class Factory : Fetcher.Factory<VideoThumbnail> {
        override fun create(data: VideoThumbnail, options: Options, imageLoader: ImageLoader): Fetcher =
            VideoThumbnailFetcher(data, options)
    }
}

class VideoThumbnailKeyer : Keyer<VideoThumbnail> {
    override fun key(data: VideoThumbnail, options: Options) = "thumb:${data.uri}"
}
