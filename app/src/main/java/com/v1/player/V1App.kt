package com.v1.player

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.v1.player.data.UploadWorker
import com.v1.player.data.VideoThumbnailFetcher
import com.v1.player.data.VideoThumbnailKeyer

class V1App : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        UploadWorker.createChannel(this)
    }

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .components {
                add(VideoThumbnailFetcher.Factory())
                add(VideoThumbnailKeyer())
            }
            .crossfade(true)
            .build()
}
