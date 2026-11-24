package com.v1.player.ui.player

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.Rational
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import com.v1.player.data.PlayItem
import com.v1.player.data.PlaybackStore
import com.v1.player.data.Playlist
import com.v1.player.data.ServerSettings
import com.v1.player.data.ServerSync
import com.v1.player.data.VideoRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.lang.ref.WeakReference

@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity(), PlayerActions {

    private lateinit var player: ExoPlayer
    private var mediaSession: MediaSession? = null
    private lateinit var store: PlaybackStore
    private lateinit var audioManager: AudioManager

    private val inPip = mutableStateOf(false)
    private val resumeNotice = mutableStateOf<ResumeNotice?>(null)
    /** Resume positions handed over with the playlist (e.g. from the server), by media id. */
    private val resumeOverrides = mutableMapOf<String, Long>()
    private var lastMediaId: String? = null
    /** True once the user picked an orientation by hand; stops auto-rotation. */
    private var orientationLocked = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Only ever keep one player around (e.g. one sitting in picture-in-picture).
        current?.get()?.takeIf { it !== this }?.finish()
        current = WeakReference(this)

        store = PlaybackStore(this)
        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager

        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        hideSystemUi()

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(serverAwareDataSource()))
            .setSeekBackIncrementMs(SEEK_STEP_MS)
            .setSeekForwardIncrementMs(SEEK_STEP_MS)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        player.addListener(playerListener)
        // Unique id: an older player (e.g. in picture-in-picture) may not be destroyed yet.
        mediaSession = MediaSession.Builder(this, player)
            .setId("player-${System.nanoTime()}")
            .build()

        if (!load(intent)) return

        setContent {
            PlayerScreen(
                player = player,
                actions = this,
                inPip = inPip.value,
                resumeNotice = resumeNotice.value,
            )
        }

        // Save progress regularly so it survives crashes and playlist hops.
        lifecycleScope.launch {
            while (isActive) {
                delay(5_000)
                if (player.isPlaying) saveProgress()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        saveProgress()
        setIntent(intent)
        orientationLocked = false
        load(intent)
    }

    /** Starts playback for the uri in [intent]. Returns false (and finishes) if there is nothing to play. */
    private fun load(intent: Intent): Boolean {
        val uri = intent.data
        if (uri == null) {
            finish()
            return false
        }
        val (items, start) = Playlist.take(uri)
            ?: (listOf(PlayItem(uri, VideoRepository.displayName(this, uri))) to 0)

        resumeOverrides.clear()
        items.forEach { item -> item.resumeMs?.let { resumeOverrides[item.mediaId] = it } }
        val first = items[start]
        val startPosition = resumePositionFor(first.mediaId)
        player.setMediaItems(items.map { it.toMediaItem() }, start, startPosition)
        player.prepare()
        player.playWhenReady = true
        lastMediaId = first.mediaId
        announceResume(startPosition)
        return true
    }

    /** Server-provided position if we have one (it may come from another device), else the local one. */
    private fun resumePositionFor(mediaId: String): Long =
        resumeOverrides[mediaId] ?: store.position(mediaId)

    private fun announceResume(positionMs: Long) {
        resumeNotice.value = if (positionMs > 0) ResumeNotice(positionMs) else null
    }

    /** Adds the server's sign-in token to requests for the server only, never to other hosts. */
    private fun serverAwareDataSource(): DataSource.Factory {
        val settings = ServerSettings(this)
        val server = settings.url?.let(Uri::parse)
        val auth = if (settings.connected) settings.api().authHeader else null
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("V1Player")
        val withAuth = ResolvingDataSource.Factory(http) { spec ->
            val u = spec.uri
            if (auth != null && server != null && u.scheme == server.scheme && u.host == server.host && u.port == server.port) {
                spec.withAdditionalHeaders(mapOf("Authorization" to auth))
            } else {
                spec
            }
        }
        return DefaultDataSource.Factory(this, withAuth)
    }

    private fun PlayItem.toMediaItem(): MediaItem {
        val builder = MediaItem.Builder()
            .setUri(uri)
            .setMediaId(mediaId)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
        val path = uri.lastPathSegment.orEmpty()
        if (path.endsWith(".m3u8", ignoreCase = true)) {
            builder.setMimeType(MimeTypes.APPLICATION_M3U8)
        }
        return builder.build()
    }

    private val playerListener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val previous = lastMediaId
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && previous != null) {
                markFinished(previous) // watched to the end
            }
            lastMediaId = mediaItem?.mediaId
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_SEEK ||
                reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO
            ) {
                val resume = mediaItem?.mediaId?.let(::resumePositionFor) ?: 0L
                if (resume > 0) player.seekTo(resume)
                announceResume(resume)
            }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) {
                player.currentMediaItem?.mediaId?.let(::markFinished)
            }
        }

        override fun onVideoSizeChanged(videoSize: VideoSize) {
            if (videoSize.width == 0 || videoSize.height == 0) return
            if (!orientationLocked && !isInPipMode()) {
                val wide = videoSize.width * videoSize.pixelWidthHeightRatio >= videoSize.height
                requestedOrientation = if (wide) {
                    ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                } else {
                    ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
                }
            }
            updatePipParams()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            updatePipParams()
        }
    }

    // region PlayerActions

    override fun close() = finish()

    override fun toggleRotation() {
        orientationLocked = true
        val landscape = resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        requestedOrientation = if (landscape) {
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
        } else {
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
    }

    override val pipSupported: Boolean
        get() = packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    override fun enterPip() {
        if (!pipSupported) return
        runCatching { enterPictureInPictureMode(buildPipParams()) }
    }

    override fun next() {
        saveProgress()
        player.seekToNextMediaItem()
    }

    override fun previous() {
        saveProgress()
        // Restart the current video if we're a few seconds in, otherwise go back one.
        if (player.currentPosition > 3_000 || !player.hasPreviousMediaItem()) player.seekTo(0)
        else player.seekToPreviousMediaItem()
    }

    override fun getBrightness(): Float {
        val current = window.attributes.screenBrightness
        if (current >= 0f) return current
        return runCatching {
            Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS) / 255f
        }.getOrDefault(0.5f)
    }

    override fun setBrightness(value: Float) {
        window.attributes = window.attributes.apply {
            screenBrightness = value.coerceIn(0.01f, 1f)
        }
    }

    override fun getVolume(): Float {
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        return audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / max
    }

    override fun setVolume(value: Float) {
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val index = (value.coerceIn(0f, 1f) * max).toInt()
        if (index != audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)) {
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
        }
    }

    override fun startOver() {
        resumeNotice.value = null
        player.seekTo(0)
        player.play()
        saveProgress()
    }

    override fun pickSubtitleFile() {
        runCatching { subtitlePicker.launch(arrayOf("*/*")) }
    }

    // endregion

    private val subtitlePicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) attachSubtitle(uri)
    }

    /** Adds an external subtitle file (.srt, .vtt, .ass/.ssa, .ttml) to the current video and turns it on. */
    private fun attachSubtitle(uri: Uri) {
        val item = player.currentMediaItem ?: return
        val name = VideoRepository.displayName(this, uri)
        val fileName = runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
        }.getOrNull() ?: uri.lastPathSegment.orEmpty()
        val mime = when (fileName.substringAfterLast('.', "").lowercase()) {
            "vtt" -> MimeTypes.TEXT_VTT
            "ass", "ssa" -> MimeTypes.TEXT_SSA
            "ttml", "dfxp", "xml" -> MimeTypes.APPLICATION_TTML
            else -> MimeTypes.APPLICATION_SUBRIP
        }
        val subtitle = MediaItem.SubtitleConfiguration.Builder(uri)
            .setMimeType(mime)
            .setLabel(name)
            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
            .build()
        val existing = item.localConfiguration?.subtitleConfigurations.orEmpty()
        val updated = item.buildUpon().setSubtitleConfigurations(existing + subtitle).build()

        val index = player.currentMediaItemIndex
        val position = player.currentPosition
        val wasPlaying = player.playWhenReady
        player.replaceMediaItem(index, updated)
        player.seekTo(index, position)
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .build()
        player.playWhenReady = wasPlaying
    }

    private fun saveProgress() {
        if (!::player.isInitialized) return
        val id = player.currentMediaItem?.mediaId ?: return
        if (player.playbackState == Player.STATE_ENDED) {
            markFinished(id)
            return
        }
        val duration = player.duration.takeIf { it != C.TIME_UNSET } ?: 0L
        val position = player.currentPosition
        store.save(id, position, duration)
        resumeOverrides.remove(id) // our own, newer position now lives in the store
        serverIdOf(id)?.let { ServerSync.pushProgress(this, it, position, duration) }
    }

    private fun markFinished(mediaId: String) {
        store.clear(mediaId)
        resumeOverrides.remove(mediaId)
        val duration = player.duration.takeIf { it != C.TIME_UNSET } ?: 0L
        serverIdOf(mediaId)?.let { ServerSync.pushProgress(this, it, duration, duration) }
    }

    private fun serverIdOf(mediaId: String): String? = mediaId.removePrefix("server:").takeIf { mediaId.startsWith("server:") }

    private fun isInPipMode() = isInPictureInPictureMode

    private fun buildPipParams(): PictureInPictureParams {
        val size = player.videoSize
        val builder = PictureInPictureParams.Builder()
        if (size.width > 0 && size.height > 0) {
            val ratio = (size.width * size.pixelWidthHeightRatio) / size.height
            val clamped = ratio.coerceIn(1f / 2.39f, 2.39f)
            builder.setAspectRatio(Rational((clamped * 1000).toInt(), 1000))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(player.isPlaying)
            builder.setSeamlessResizeEnabled(true)
        }
        return builder.build()
    }

    private fun updatePipParams() {
        if (!pipSupported) return
        runCatching { setPictureInPictureParams(buildPipParams()) }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // Android 12+ handles this automatically via setAutoEnterEnabled.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && player.isPlaying) enterPip()
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        inPip.value = isInPictureInPictureMode
        if (!isInPictureInPictureMode) hideSystemUi()
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
    }

    override fun onPause() {
        super.onPause()
        saveProgress()
        if (!isInPipMode()) player.pause()
    }

    override fun onStop() {
        super.onStop()
        saveProgress()
        player.pause()
    }

    override fun onDestroy() {
        if (::player.isInitialized) {
            saveProgress()
            player.removeListener(playerListener)
            mediaSession?.release()
            mediaSession = null
            player.release()
        }
        if (current?.get() === this) current = null
        super.onDestroy()
    }

    private fun hideSystemUi() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    companion object {
        const val SEEK_STEP_MS = 10_000L
        private var current: WeakReference<PlayerActivity>? = null
    }
}

/** What the Compose UI can ask the hosting activity to do. */
interface PlayerActions {
    fun close()
    fun toggleRotation()
    val pipSupported: Boolean
    fun enterPip()
    fun next()
    fun previous()
    fun getBrightness(): Float
    fun setBrightness(value: Float)
    fun getVolume(): Float
    fun setVolume(value: Float)
    fun pickSubtitleFile()
    fun startOver()
}

/** Shown briefly when a video picks up where you left off. */
data class ResumeNotice(val positionMs: Long, val stamp: Long = System.nanoTime())
