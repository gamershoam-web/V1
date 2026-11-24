package com.v1.player

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.v1.player.data.PlayItem
import com.v1.player.data.Playlist
import com.v1.player.ui.library.LibraryScreen
import com.v1.player.ui.library.LibraryViewModel
import com.v1.player.ui.player.PlayerActivity
import com.v1.player.ui.theme.V1Theme

class MainActivity : ComponentActivity() {
    private val viewModel: LibraryViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            V1Theme {
                val state by viewModel.state.collectAsStateWithLifecycle()
                var hasPermission by remember { mutableStateOf(hasVideoPermission(this)) }

                val permissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions()
                ) {
                    hasPermission = hasVideoPermission(this)
                    if (hasPermission) viewModel.load()
                }
                val openDocument = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument()
                ) { uri -> if (uri != null) play(uri) }

                // Re-check access and refresh when coming back (e.g. from settings or the player).
                LifecycleResumeEffect(Unit) {
                    hasPermission = hasVideoPermission(this@MainActivity)
                    if (hasPermission) viewModel.load()
                    onPauseOrDispose { }
                }

                LibraryScreen(
                    state = state,
                    hasPermission = hasPermission,
                    onRequestPermission = { requestPermission { permissionLauncher.launch(videoPermissions()) } },
                    onRefresh = { viewModel.load(userInitiated = true) },
                    onQueryChange = viewModel::setQuery,
                    onFolderSelect = viewModel::selectFolder,
                    onSortChange = viewModel::setSort,
                    onToggleGrid = viewModel::toggleGrid,
                    onOpenVideo = { list, index ->
                        Playlist.set(list.map { PlayItem(it.uri, it.title) }, index)
                        play(list[index].uri)
                    },
                    onOpenFile = { openDocument.launch(arrayOf("video/*")) },
                    onOpenStream = { play(Uri.parse(it)) },
                )
            }
        }
    }

    /**
     * Asks for access, or - if the user already said no and Android won't show the dialog again -
     * opens this app's settings page so they can allow it there.
     */
    private fun requestPermission(launch: () -> Unit) {
        val prefs = getSharedPreferences("library_settings", MODE_PRIVATE)
        val askedBefore = prefs.getBoolean("asked_permission", false)
        val canAskAgain = videoPermissions().any { shouldShowRequestPermissionRationale(it) }
        if (askedBefore && !canAskAgain) {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
            )
        } else {
            prefs.edit().putBoolean("asked_permission", true).apply()
            launch()
        }
    }

    private fun play(uri: Uri) {
        startActivity(
            Intent(this, PlayerActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .setData(uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
    }

    private companion object {
        fun videoPermissions(): Array<String> = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> arrayOf(
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
            )
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
                arrayOf(Manifest.permission.READ_MEDIA_VIDEO)
            else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

        /** Full or partial (Android 14 "selected videos") access both count. */
        fun hasVideoPermission(context: Context): Boolean = videoPermissions().any {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }
}
