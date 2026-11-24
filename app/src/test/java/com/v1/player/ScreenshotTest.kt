package com.v1.player

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.media3.exoplayer.ExoPlayer
import androidx.test.core.app.ApplicationProvider
import com.v1.player.data.ServerVideo
import com.v1.player.data.VideoItem
import com.v1.player.ui.library.ConnectState
import com.v1.player.ui.library.LibraryActions
import com.v1.player.ui.library.LibraryScreen
import com.v1.player.ui.library.LibraryState
import com.v1.player.ui.library.LibraryTab
import com.v1.player.ui.library.ServerState
import com.v1.player.ui.library.ServerThumb
import com.v1.player.ui.library.SortOrder
import com.v1.player.ui.player.PlayerActions
import com.v1.player.ui.player.PlayerScreen
import com.v1.player.ui.player.ResumeNotice
import com.v1.player.ui.theme.LumenTheme
import coil.imageLoader
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Renders key screens to PNG files in app/build/screenshots so the look can be reviewed
 * without a device. Run with: ./gradlew testDebugUnitTest --tests '*ScreenshotTest*'
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenshotTest {

    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val outDir = File("build/screenshots").apply { mkdirs() }

    private fun thumb(n: Int): String {
        val url = javaClass.classLoader!!.getResource("thumbs/t$n.jpg")!!
        return "file://" + File(url.toURI()).absolutePath
    }

    private val now = System.currentTimeMillis()
    private val titles = listOf(
        "Kelp forest dive", "Golden hour at the pier", "Morning in the Dolomites",
        "Tokyo after midnight", "First snow", "Dune crossing",
    )
    private val serverVideos = titles.mapIndexed { i, title ->
        ServerVideo(
            id = "v$i", title = title, fileName = "$title.mp4", sizeBytes = (180L + i * 95) * 1024 * 1024,
            durationMs = (6 + i * 7) * 60_000L, width = 1920, height = 1080, created = now - i * 86_400_000L,
            hasThumb = true, ready = true,
            progressMs = if (i == 0 || i == 3) (2 + i) * 60_000L else 0L,
            progressUpdated = now - i * 1000L,
        )
    }

    private val actions = object : LibraryActions {
        override fun requestPermission() = Unit
        override fun refresh() = Unit
        override fun setTab(tab: LibraryTab) = Unit
        override fun setQuery(query: String) = Unit
        override fun selectFolder(folder: String?) = Unit
        override fun setSort(sort: SortOrder) = Unit
        override fun toggleGrid() = Unit
        override fun openLocal(list: List<VideoItem>, index: Int, fromStart: Boolean) = Unit
        override fun openServer(list: List<ServerVideo>, index: Int, fromStart: Boolean) = Unit
        override fun openFile() = Unit
        override fun openStream(url: String) = Unit
        override fun uploadToServer(video: VideoItem) = Unit
        override fun clearLocalProgress(video: VideoItem) = Unit
        override fun clearServerProgress(video: ServerVideo) = Unit
        override fun deleteServerVideo(video: ServerVideo) = Unit
        override fun connect(address: String, password: String) = Unit
        override fun resetConnect() = Unit
        override fun disconnect() = Unit
        override fun clearFailedUploads() = Unit
        override fun serverThumb(video: ServerVideo) = ServerThumb(thumb(video.id.drop(1).toInt() + 1), null)
    }

    private fun serverState() = LibraryState(
        loading = false,
        tab = LibraryTab.SERVER,
        server = ServerState(connected = true, url = "https://videos.example.com", loaded = true, videos = serverVideos),
    )

    /** Load every thumbnail once up front so the first screenshot isn't missing images. */
    @Before
    fun warmUpImages() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        runBlocking {
            (1..6).forEach { n ->
                context.imageLoader.execute(coil.request.ImageRequest.Builder(context).data(thumb(n)).build())
            }
        }
    }

    private fun capture(name: String) {
        // Compose tests pause endless animations (the drifting backdrop); just let images load.
        repeat(14) {
            Thread.sleep(200)
            rule.waitForIdle()
        }
        // Draw the whole window (Robolectric renders it with the real Android graphics stack).
        val root = rule.activity.window.decorView
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        rule.runOnUiThread { root.draw(Canvas(bitmap)) }
        File(outDir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test
    fun libraryServerDark() = library("library-server-dark", dark = true)

    @Test
    fun libraryServerLight() = library("library-server-light", dark = false)

    private fun library(name: String, dark: Boolean) {
        rule.setContent {
            LumenTheme(darkTheme = dark) {
                LibraryScreen(state = serverState(), connectState = ConnectState.Idle, hasPermission = true, actions = actions)
            }
        }
        capture(name)
    }

    @Test
    fun connectPromptDark() {
        rule.setContent {
            LumenTheme(darkTheme = true) {
                LibraryScreen(
                    state = LibraryState(loading = false, tab = LibraryTab.SERVER),
                    connectState = ConnectState.Idle,
                    hasPermission = true,
                    actions = actions,
                )
            }
        }
        capture("connect-dark")
    }

    @Test
    @Config(qualifiers = "w891dp-h411dp-xxhdpi")
    fun player() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val player = ExoPlayer.Builder(context).build()
        val playerActions = object : PlayerActions {
            override fun close() = Unit
            override fun toggleRotation() = Unit
            override val pipSupported = true
            override fun enterPip() = Unit
            override fun next() = Unit
            override fun previous() = Unit
            override fun getBrightness() = 0.5f
            override fun setBrightness(value: Float) = Unit
            override fun getVolume() = 0.5f
            override fun setVolume(value: Float) = Unit
            override fun pickSubtitleFile() = Unit
            override fun startOver() = Unit
        }
        rule.setContent {
            LumenTheme(darkTheme = true) {
                androidx.compose.foundation.layout.Box {
                    // Stand-in for a video frame behind the controls.
                    coil.compose.AsyncImage(
                        model = thumb(1),
                        contentDescription = null,
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = androidx.compose.ui.Modifier.matchParentSize(),
                    )
                    PlayerScreen(player = player, actions = playerActions, inPip = false, resumeNotice = ResumeNotice(754_000L))
                }
            }
        }
        capture("player")
        player.release()
    }
}
