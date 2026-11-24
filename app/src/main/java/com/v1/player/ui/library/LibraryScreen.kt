package com.v1.player.ui.library

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.VideoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.WorkInfo
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.v1.player.data.ServerVideo
import com.v1.player.data.VideoItem
import com.v1.player.ui.theme.LocalGlass
import com.v1.player.ui.theme.glass
import com.v1.player.ui.theme.pressScale
import com.v1.player.util.formatDuration
import com.v1.player.util.formatSize
import com.v1.player.util.resolutionLabel
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.haze

/** Thumbnail on the server; needs the sign-in header. */
data class ServerThumb(val url: String, val auth: String?)

/** What a video card shows, whether the video is on the phone or on the server. */
data class CardModel(
    val key: String,
    val title: String,
    val subtitle: String,
    val durationMs: Long,
    val progress: Float,
    val thumb: Any?,
    val badge: String? = null,
)

data class CardAction(val label: String, val icon: ImageVector, val danger: Boolean = false, val onClick: () -> Unit)

/** Everything the library screen can ask for. */
interface LibraryActions {
    fun requestPermission()
    fun refresh()
    fun setTab(tab: LibraryTab)
    fun setQuery(query: String)
    fun selectFolder(folder: String?)
    fun setSort(sort: SortOrder)
    fun toggleGrid()
    fun openLocal(list: List<VideoItem>, index: Int, fromStart: Boolean = false)
    fun openServer(list: List<ServerVideo>, index: Int, fromStart: Boolean = false)
    fun openFile()
    fun openStream(url: String)
    fun uploadToServer(video: VideoItem)
    fun clearLocalProgress(video: VideoItem)
    fun clearServerProgress(video: ServerVideo)
    fun deleteServerVideo(video: ServerVideo)
    fun connect(address: String, password: String)
    fun resetConnect()
    fun disconnect()
    fun clearFailedUploads()
    fun serverThumb(video: ServerVideo): ServerThumb?
}

private val CardShape = RoundedCornerShape(16.dp)
private val ThumbShape = RoundedCornerShape(14.dp)
private const val TAB_BAR_HEIGHT = 60

@Composable
fun LibraryScreen(
    state: LibraryState,
    connectState: ConnectState,
    hasPermission: Boolean,
    actions: LibraryActions,
) {
    var searching by rememberSaveable { mutableStateOf(false) }
    var showStreamDialog by rememberSaveable { mutableStateOf(false) }
    var showServerDialog by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<ServerVideo?>(null) }
    val hazeState = remember { HazeState() }
    val density = LocalDensity.current
    var topBarHeight by remember { mutableStateOf(0.dp) }
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val contentPadding = PaddingValues(
        top = topBarHeight + 8.dp,
        bottom = navBottom + TAB_BAR_HEIGHT.dp + 32.dp,
    )

    val ambientThumb: Any? = when (state.tab) {
        LibraryTab.PHONE -> if (hasPermission) heroLocal(state)?.thumbnail else null
        LibraryTab.SERVER -> heroServer(state)?.takeIf { it.hasThumb }?.let { actions.serverThumb(it) }
    }

    Box(Modifier.fillMaxSize()) {
        // Everything in here can be seen, blurred, through the glass bars on top.
        Box(
            Modifier
                .fillMaxSize()
                .haze(hazeState)
        ) {
            AmbientBackdrop(ambientThumb)
            AnimatedContent(
                targetState = state.tab,
                transitionSpec = {
                    val dir = if (targetState.ordinal > initialState.ordinal) 1 else -1
                    (fadeIn(tween(260)) + slideInHorizontally(tween(320)) { it * dir / 10 }) togetherWith
                        (fadeOut(tween(180)) + slideOutHorizontally(tween(320)) { -it * dir / 10 })
                },
                label = "tab",
            ) { tab ->
                when (tab) {
                    LibraryTab.PHONE -> PhoneContent(state, hasPermission, actions, contentPadding)
                    LibraryTab.SERVER -> ServerContent(
                        state = state,
                        actions = actions,
                        contentPadding = contentPadding,
                        onOpenServerDialog = { showServerDialog = true },
                        onDelete = { confirmDelete = it },
                    )
                }
            }
        }

        LibraryTopBar(
            state = state,
            searching = searching,
            hasPermission = hasPermission,
            onSearchingChange = {
                searching = it
                if (!it) actions.setQuery("")
            },
            actions = actions,
            onOpenStream = { showStreamDialog = true },
            onOpenServer = { showServerDialog = true },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .glass(RectangleShape, haze = hazeState)
                .onSizeChanged { topBarHeight = with(density) { it.height.toDp() } },
        )

        GlassTabBar(
            selected = state.tab.ordinal,
            tabs = listOf("This phone" to Icons.Filled.Smartphone, "Server" to Icons.Filled.Cloud),
            onSelect = { actions.setTab(LibraryTab.entries[it]) },
            hazeState = hazeState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 16.dp),
        )
    }

    if (showStreamDialog) {
        StreamDialog(
            onDismiss = { showStreamDialog = false },
            onPlay = {
                showStreamDialog = false
                actions.openStream(it)
            },
        )
    }
    if (showServerDialog) {
        ServerDialog(
            server = state.server,
            connectState = connectState,
            actions = actions,
            onDismiss = {
                showServerDialog = false
                actions.resetConnect()
            },
        )
    }
    // Close the dialog once a connection succeeds.
    LaunchedEffect(state.server.connected) {
        if (state.server.connected && connectState == ConnectState.Idle) showServerDialog = false
    }
    confirmDelete?.let { video ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Delete from server?") },
            text = { Text("\"${video.title}\" will be removed from your server for every device. This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = null
                    actions.deleteServerVideo(video)
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }
}

/** Floating glass capsule with a lit pill that slides to the selected tab. */
@Composable
private fun GlassTabBar(
    selected: Int,
    tabs: List<Pair<String, ImageVector>>,
    onSelect: (Int) -> Unit,
    hazeState: HazeState,
    modifier: Modifier = Modifier,
) {
    val glass = LocalGlass.current
    val pill = CircleShape
    BoxWithConstraints(
        modifier
            .widthIn(max = 300.dp)
            .fillMaxWidth(0.78f)
            .height(TAB_BAR_HEIGHT.dp)
            .glass(pill, haze = hazeState)
            .padding(5.dp)
    ) {
        val tabWidth = maxWidth / tabs.size
        val offset by animateDpAsState(
            targetValue = tabWidth * selected,
            animationSpec = spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow),
            label = "tabPill",
        )
        Box(
            Modifier
                .offset { IntOffset(offset.roundToPx(), 0) }
                .width(tabWidth)
                .fillMaxHeight()
                .glass(pill, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = if (glass.dark) 0.14f else 0.07f))
        )
        Row(Modifier.fillMaxSize()) {
            tabs.forEachIndexed { index, (label, icon) ->
                val color by animateColorAsState(
                    if (index == selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    label = "tabColor",
                )
                Row(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(pill)
                        .clickable { onSelect(index) },
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(label, color = color, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

// region Phone tab

@Composable
private fun PhoneContent(
    state: LibraryState,
    hasPermission: Boolean,
    actions: LibraryActions,
    contentPadding: PaddingValues,
) {
    when {
        !hasPermission -> PermissionPrompt(actions::requestPermission, actions::openFile, contentPadding)
        state.loading -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
        else -> RefreshBox(state.refreshing, actions::refresh, contentPadding) {
            val visible = state.visible
            val hero = if (state.query.isBlank()) heroLocal(state) else null
            val continueList = if (state.query.isBlank()) state.continueLocal.filter { it.id != hero?.id } else emptyList()
            val cards = remember(visible, state.positions) { visible.map { it.toCard(state) } }
            val continueCards = remember(continueList, state.positions) { continueList.map { it.toCard(state) } }
            val openHero: (Boolean) -> Unit = { fromStart ->
                val h = hero!!
                val i = visible.indexOfFirst { it.id == h.id }
                if (i >= 0) actions.openLocal(visible, i, fromStart) else actions.openLocal(listOf(h), 0, fromStart)
            }

            VideoCollection(
                cards = cards,
                grid = state.grid,
                contentPadding = contentPadding,
                onClick = { actions.openLocal(visible, it) },
                actionsFor = { index -> localActions(visible[index], state, actions) },
                header = {
                    Column {
                        hero?.let { h ->
                            HeroCard(
                                card = h.toCard(state),
                                resuming = state.progressOf(h) > 0f,
                                onPlay = { openHero(false) },
                                onStartOver = { openHero(true) },
                            )
                        }
                        if (continueCards.isNotEmpty()) {
                            ContinueRow(continueCards) { i -> actions.openLocal(continueList, i) }
                        }
                        if (hero != null) SectionTitle("All videos")
                        if (state.folders.size > 1) FolderChips(state, actions::selectFolder)
                        if (visible.isEmpty()) {
                            EmptyState(
                                if (state.query.isNotBlank()) "No videos match \"${state.query}\""
                                else "No videos found on this phone"
                            )
                        }
                    }
                },
            )
        }
    }
}

private fun VideoItem.toCard(state: LibraryState) = CardModel(
    key = "l$id",
    title = title,
    subtitle = listOfNotNull(
        resolutionLabel(width, height),
        formatSize(sizeBytes).ifEmpty { null },
        folder,
    ).joinToString(" · "),
    durationMs = durationMs,
    progress = state.progressOf(this),
    thumb = thumbnail,
)

private fun localActions(video: VideoItem, state: LibraryState, actions: LibraryActions): List<CardAction> = buildList {
    if (state.progressOf(video) > 0f) {
        add(CardAction("Start from beginning", Icons.Filled.Replay) { actions.clearLocalProgress(video) })
    }
    if (state.server.connected) {
        add(CardAction("Upload to server", Icons.Filled.CloudUpload) { actions.uploadToServer(video) })
    }
}

// endregion

// region Server tab

@Composable
private fun ServerContent(
    state: LibraryState,
    actions: LibraryActions,
    contentPadding: PaddingValues,
    onOpenServerDialog: () -> Unit,
    onDelete: (ServerVideo) -> Unit,
) {
    val server = state.server
    when {
        !server.connected -> ConnectPrompt(server.error, onOpenServerDialog, contentPadding)
        !server.loaded && server.error == null ->
            Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
        !server.loaded && server.error != null -> MessageState(
            icon = Icons.Outlined.CloudOff,
            title = "Couldn't reach your server",
            message = server.error,
            primary = "Try again" to { actions.refresh() },
            secondary = "Server settings" to onOpenServerDialog,
            contentPadding = contentPadding,
        )
        else -> RefreshBox(server.refreshing, actions::refresh, contentPadding) {
            val visible = state.visibleServer
            val hero = if (state.query.isBlank()) heroServer(state) else null
            val continueList = if (state.query.isBlank()) state.continueServer.filter { it.id != hero?.id } else emptyList()
            val cards = remember(visible) { visible.map { it.toCard(actions) } }
            val continueCards = remember(continueList) { continueList.map { it.toCard(actions) } }
            val openHero: (Boolean) -> Unit = { fromStart ->
                val h = hero!!
                val i = visible.indexOfFirst { it.id == h.id }
                if (i >= 0) actions.openServer(visible, i, fromStart) else actions.openServer(listOf(h), 0, fromStart)
            }

            VideoCollection(
                cards = cards,
                grid = state.grid,
                contentPadding = contentPadding,
                onClick = { actions.openServer(visible, it) },
                actionsFor = { index ->
                    val video = visible[index]
                    buildList {
                        if (video.progressMs > 0) {
                            add(CardAction("Start from beginning", Icons.Filled.Replay) { actions.clearServerProgress(video) })
                        }
                        add(CardAction("Delete from server", Icons.Filled.Delete, danger = true) { onDelete(video) })
                    }
                },
                header = {
                    Column {
                        if (server.error != null) ErrorBanner(server.error)
                        if (state.uploads.isNotEmpty()) UploadsCard(state.uploads, actions::clearFailedUploads)
                        hero?.let { h ->
                            HeroCard(
                                card = h.toCard(actions),
                                resuming = h.progressMs > 0,
                                onPlay = { openHero(false) },
                                onStartOver = { openHero(true) },
                            )
                        }
                        if (continueCards.isNotEmpty()) {
                            ContinueRow(continueCards) { i -> actions.openServer(continueList, i) }
                        }
                        if (hero != null) SectionTitle("All videos")
                        if (visible.isEmpty()) {
                            EmptyState(
                                if (state.query.isNotBlank()) "No videos match \"${state.query}\""
                                else "No videos on your server yet.\n\nUpload from the website, or tap ⋮ on a video in \"This phone\" and choose Upload to server."
                            )
                        }
                    }
                },
            )
        }
    }
}

private fun ServerVideo.toCard(actions: LibraryActions) = CardModel(
    key = "s$id",
    title = title,
    subtitle = listOfNotNull(
        resolutionLabel(width, height),
        formatSize(sizeBytes).ifEmpty { null },
    ).joinToString(" · ").ifEmpty { "On your server" },
    durationMs = durationMs,
    progress = if (durationMs > 0) (progressMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f,
    thumb = if (hasThumb) actions.serverThumb(this) else null,
    badge = if (!ready) "Processing" else null,
)

@Composable
private fun ConnectPrompt(error: String?, onConnect: () -> Unit, contentPadding: PaddingValues) {
    MessageState(
        icon = Icons.Outlined.Cloud,
        title = "Watch from your own server",
        message = error ?: "Connect your Lumen server to stream your videos anywhere, pick up where you left off on any device, and upload from this phone.",
        primary = "Connect server" to onConnect,
        contentPadding = contentPadding,
    )
}

@Composable
private fun UploadsCard(uploads: List<UploadStatus>, onClearFailed: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.92f))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CloudUpload, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Text("Uploading from this phone", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            if (uploads.any { it.state == WorkInfo.State.FAILED }) {
                TextButton(onClick = onClearFailed) { Text("Clear") }
            }
        }
        uploads.forEach { upload ->
            Spacer(Modifier.height(10.dp))
            Text(upload.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
            val label = when (upload.state) {
                WorkInfo.State.RUNNING -> "${(upload.progress * 100).toInt()}%"
                WorkInfo.State.FAILED -> "Failed"
                else -> "Waiting for connection…"
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (upload.state == WorkInfo.State.RUNNING) {
                    LinearProgressIndicator(
                        progress = { upload.progress },
                        strokeCap = StrokeCap.Round,
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.width(10.dp))
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (upload.state == WorkInfo.State.FAILED) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Text(
        message,
        color = MaterialTheme.colorScheme.onErrorContainer,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.9f))
            .padding(14.dp),
    )
}

@Composable
private fun ServerDialog(
    server: ServerState,
    connectState: ConnectState,
    actions: LibraryActions,
    onDismiss: () -> Unit,
) {
    var address by rememberSaveable { mutableStateOf(server.url.orEmpty()) }
    var password by rememberSaveable { mutableStateOf("") }
    val working = connectState == ConnectState.Working

    if (server.connected) {
        AlertDialog(
            onDismissRequest = onDismiss,
            icon = { Icon(Icons.Filled.Dns, contentDescription = null) },
            title = { Text("Your server") },
            text = {
                Column {
                    Text("Connected to", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(server.url.orEmpty(), style = MaterialTheme.typography.bodyLarge)
                    if (server.url?.startsWith("http://") == true) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "This connection isn't encrypted. Give your server a domain to switch to HTTPS.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
            dismissButton = {
                TextButton(onClick = {
                    actions.disconnect()
                    onDismiss()
                }) { Text("Disconnect", color = MaterialTheme.colorScheme.error) }
            },
        )
        return
    }

    AlertDialog(
        onDismissRequest = { if (!working) onDismiss() },
        icon = { Icon(Icons.Filled.Dns, contentDescription = null) },
        title = { Text("Connect your server") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("Server address") },
                    placeholder = { Text("videos.example.com") },
                    supportingText = { Text("Your domain, or http://IP:8080 without one") },
                    singleLine = true,
                    enabled = !working,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password (only if you set one)") },
                    singleLine = true,
                    enabled = !working,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = {
                        if (address.isNotBlank()) actions.connect(address, password)
                    }),
                )
                when (connectState) {
                    is ConnectState.Failed -> Text(
                        connectState.message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    ConnectState.Working -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("Connecting…", style = MaterialTheme.typography.bodyMedium)
                    }
                    ConnectState.Idle -> Unit
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { actions.connect(address, password) },
                enabled = !working && address.isNotBlank(),
            ) { Text("Connect") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !working) { Text("Cancel") } },
    )
}

// endregion

// region Shared building blocks

/** Pull to refresh, with the spinner placed below the floating top bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RefreshBox(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    contentPadding: PaddingValues,
    content: @Composable () -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        state = pullState,
        modifier = Modifier.fillMaxSize(),
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = pullState,
                isRefreshing = refreshing,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = contentPadding.calculateTopPadding()),
            )
        },
    ) {
        content()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LibraryTopBar(
    state: LibraryState,
    searching: Boolean,
    hasPermission: Boolean,
    onSearchingChange: (Boolean) -> Unit,
    actions: LibraryActions,
    onOpenStream: () -> Unit,
    onOpenServer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var sortMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }
    val showListTools = if (state.tab == LibraryTab.PHONE) hasPermission else state.server.connected
    val count = if (state.tab == LibraryTab.PHONE) state.videos.size else state.server.videos.size
    val showCount = if (state.tab == LibraryTab.PHONE) hasPermission && !state.loading else state.server.loaded

    TopAppBar(
        modifier = modifier,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Color.Transparent,
            scrolledContainerColor = Color.Transparent,
        ),
        navigationIcon = {
            if (searching) {
                IconButton(onClick = { onSearchingChange(false) }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Close search")
                }
            }
        },
        title = {
            if (searching) {
                SearchField(state.query, actions::setQuery)
            } else {
                Column {
                    Text("Lumen", fontWeight = FontWeight.Bold)
                    AnimatedVisibility(showCount) {
                        Text(
                            "$count videos" + if (state.tab == LibraryTab.SERVER) " on your server" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        actions = {
            if (showListTools && !searching) {
                IconButton(onClick = { onSearchingChange(true) }) {
                    Icon(Icons.Filled.Search, contentDescription = "Search")
                }
            }
            if (showListTools) {
                IconButton(onClick = actions::toggleGrid) {
                    Icon(
                        if (state.grid) Icons.AutoMirrored.Filled.ViewList else Icons.Filled.GridView,
                        contentDescription = if (state.grid) "List view" else "Grid view",
                    )
                }
                Box {
                    IconButton(onClick = { sortMenu = true }) {
                        Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Sort")
                    }
                    DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                        SortOrder.entries.forEach { order ->
                            DropdownMenuItem(
                                text = { Text(order.label) },
                                trailingIcon = {
                                    if (order == state.sort) Icon(Icons.Filled.Check, contentDescription = null)
                                },
                                onClick = {
                                    sortMenu = false
                                    actions.setSort(order)
                                },
                            )
                        }
                    }
                }
            }
            Box {
                IconButton(onClick = { moreMenu = true }) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "More")
                }
                DropdownMenu(expanded = moreMenu, onDismissRequest = { moreMenu = false }) {
                    DropdownMenuItem(
                        text = { Text(if (state.server.connected) "Your server" else "Connect server…") },
                        leadingIcon = { Icon(Icons.Filled.Dns, contentDescription = null) },
                        onClick = {
                            moreMenu = false
                            onOpenServer()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Open file…") },
                        leadingIcon = { Icon(Icons.Filled.FolderOpen, contentDescription = null) },
                        onClick = {
                            moreMenu = false
                            actions.openFile()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Play from URL…") },
                        leadingIcon = { Icon(Icons.Filled.Link, contentDescription = null) },
                        onClick = {
                            moreMenu = false
                            onOpenStream()
                        },
                    )
                }
            }
        },
    )
}

@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit) {
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) { focus.requestFocus() }
    TextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = { Text("Search videos") },
        singleLine = true,
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Filled.Close, contentDescription = "Clear")
                }
            }
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .focusRequester(focus),
    )
}

@Composable
private fun FolderChips(state: LibraryState, onFolderSelect: (String?) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            GlassChip("All", selected = state.folder == null) { onFolderSelect(null) }
        }
        items(state.folders, key = { it.name }) { folder ->
            GlassChip("${folder.name}  ${folder.count}", selected = state.folder == folder.name) {
                onFolderSelect(if (state.folder == folder.name) null else folder.name)
            }
        }
    }
}

@Composable
private fun GlassChip(text: String, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val background by animateColorAsState(
        if (selected) colors.onSurface else colors.surfaceVariant.copy(alpha = 0.7f),
        label = "chip",
    )
    val textColor by animateColorAsState(if (selected) colors.surface else colors.onSurface, label = "chipText")
    Text(
        text,
        color = textColor,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(CircleShape)
            .background(background)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 20.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun ContinueRow(cards: List<CardModel>, onClick: (Int) -> Unit) {
    Column {
        SectionTitle("Continue watching")
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(cards, key = { _, c -> c.key }) { index, card ->
                val interaction = remember { MutableInteractionSource() }
                Column(
                    Modifier
                        .animateItem()
                        .width(232.dp)
                        .pressScale(interaction)
                        .clip(CardShape)
                        .clickable(interactionSource = interaction, indication = LocalIndication.current) { onClick(index) }
                ) {
                    Thumbnail(card, Modifier.fillMaxWidth())
                    Text(
                        card.title,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 8.dp),
                    )
                    val left = (card.durationMs * (1f - card.progress)).toLong()
                    Text(
                        if (card.durationMs > 0) "${formatDuration(left)} left" else "In progress",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 2.dp, bottom = 4.dp),
                    )
                }
            }
        }
    }
}

/** Grid or list of video cards with an optional header (chips, continue watching…) on top. */
@Composable
private fun VideoCollection(
    cards: List<CardModel>,
    grid: Boolean,
    contentPadding: PaddingValues,
    onClick: (Int) -> Unit,
    actionsFor: (Int) -> List<CardAction>,
    header: @Composable () -> Unit,
) {
    val top = contentPadding.calculateTopPadding()
    val bottom = contentPadding.calculateBottomPadding()
    if (grid) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 168.dp),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top, bottom = bottom),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                // The header is full width; undo the grid's side padding for edge-to-edge rows.
                Box(Modifier.layoutEdgeToEdge(32.dp)) { header() }
            }
            itemsIndexed(cards, key = { _, c -> c.key }) { index, card ->
                GridCard(
                    card,
                    onClick = { onClick(index) },
                    actions = { actionsFor(index) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    } else {
        LazyColumn(
            contentPadding = PaddingValues(top = top, bottom = bottom),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "header") { header() }
            itemsIndexed(cards, key = { _, c -> c.key }) { index, card ->
                ListCard(
                    card,
                    onClick = { onClick(index) },
                    actions = { actionsFor(index) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}

/** Lets a full-span grid header reach the screen edges despite the grid's side content padding. */
private fun Modifier.layoutEdgeToEdge(extraWidth: Dp): Modifier = this.then(
    Modifier.layout { measurable, constraints ->
        val extra = extraWidth.roundToPx()
        val placeable = measurable.measure(
            constraints.copy(
                minWidth = constraints.minWidth + extra,
                maxWidth = constraints.maxWidth + extra,
            )
        )
        layout(placeable.width - extra, placeable.height) {
            placeable.place(-extra / 2, 0)
        }
    }
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GridCard(
    card: CardModel,
    onClick: () -> Unit,
    actions: () -> List<CardAction>,
    modifier: Modifier = Modifier,
) {
    var menu by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier
            .pressScale(interaction)
            .clip(CardShape)
            .combinedClickable(
                interactionSource = interaction,
                indication = LocalIndication.current,
                onClick = onClick,
                onLongClick = { menu = true },
            )
    ) {
        Thumbnail(card, Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.Top) {
            Column(
                Modifier
                    .weight(1f)
                    .padding(start = 2.dp, top = 8.dp, bottom = 4.dp)
            ) {
                Text(
                    card.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    card.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            CardMenu(menu, onOpen = { menu = true }, onClose = { menu = false }, actions = actions)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ListCard(
    card: CardModel,
    onClick: () -> Unit,
    actions: () -> List<CardAction>,
    modifier: Modifier = Modifier,
) {
    var menu by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier
            .fillMaxWidth()
            .pressScale(interaction, pressedScale = 0.98f)
            .combinedClickable(
                interactionSource = interaction,
                indication = LocalIndication.current,
                onClick = onClick,
                onLongClick = { menu = true },
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Thumbnail(card, Modifier.width(132.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                card.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                card.subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        CardMenu(menu, onOpen = { menu = true }, onClose = { menu = false }, actions = actions)
    }
}

@Composable
private fun CardMenu(open: Boolean, onOpen: () -> Unit, onClose: () -> Unit, actions: () -> List<CardAction>) {
    val items = if (open) actions() else emptyList()
    Box {
        IconButton(onClick = onOpen) {
            Icon(
                Icons.Filled.MoreVert,
                contentDescription = "Options",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = onClose) {
            if (items.isEmpty()) {
                DropdownMenuItem(
                    text = { Text("Connect a server to upload", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    onClick = onClose,
                    enabled = false,
                )
            }
            items.forEach { action ->
                val color = if (action.danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                DropdownMenuItem(
                    text = { Text(action.label, color = color) },
                    leadingIcon = { Icon(action.icon, contentDescription = null, tint = color) },
                    onClick = {
                        onClose()
                        action.onClick()
                    },
                )
            }
        }
    }
}

/** Loads a thumbnail model (local MediaStore frame or server image with its sign-in header). */
@Composable
private fun ThumbImage(thumb: Any?, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val model = remember(thumb) {
        when (thumb) {
            is ServerThumb -> ImageRequest.Builder(context)
                .data(thumb.url)
                .apply { thumb.auth?.let { addHeader("Authorization", it) } }
                .memoryCacheKey(thumb.url)
                .diskCacheKey(thumb.url)
                .crossfade(true)
                .build()
            else -> thumb
        }
    }
    if (model != null) {
        AsyncImage(
            model = model,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = modifier,
        )
    }
}

@Composable
private fun Thumbnail(card: CardModel, modifier: Modifier = Modifier) {
    Box(
        modifier
            .aspectRatio(16f / 9f)
            .clip(ThumbShape)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
    ) {
        Icon(
            Icons.Outlined.VideoLibrary,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier
                .align(Alignment.Center)
                .size(28.dp),
        )
        ThumbImage(card.thumb, Modifier.fillMaxSize())
        card.badge?.let { Badge(it, Modifier.align(Alignment.BottomStart)) }
        if (card.durationMs > 0) Badge(formatDuration(card.durationMs), Modifier.align(Alignment.BottomEnd))
        AnimatedVisibility(card.progress > 0f, modifier = Modifier.align(Alignment.BottomCenter)) {
            LinearProgressIndicator(
                progress = { card.progress },
                color = MaterialTheme.colorScheme.primary,
                trackColor = Color.White.copy(alpha = 0.35f),
                strokeCap = StrokeCap.Butt,
                gapSize = 0.dp,
                drawStopIndicator = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp),
            )
        }
    }
}

/** Small frosted label on a thumbnail (duration, "Processing"). */
@Composable
private fun Badge(text: String, modifier: Modifier) {
    Text(
        text,
        color = Color.White,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .padding(6.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Brush.verticalGradient(listOf(Color(0x8C000000), Color(0xA6000000))))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun PermissionPrompt(onRequestPermission: () -> Unit, onOpenFile: () -> Unit, contentPadding: PaddingValues) {
    MessageState(
        icon = Icons.Outlined.VideoLibrary,
        title = "See all your videos",
        message = "Allow access to videos on this device to browse and play them.",
        primary = "Allow access" to onRequestPermission,
        secondary = "Open a single file instead" to onOpenFile,
        contentPadding = contentPadding,
    )
}

/** A centred glass card with an icon, a message and one or two buttons. */
@Composable
private fun MessageState(
    icon: ImageVector,
    title: String,
    message: String,
    primary: Pair<String, () -> Unit>,
    secondary: Pair<String, () -> Unit>? = null,
    contentPadding: PaddingValues,
) {
    Box(
        Modifier
            .fillMaxSize()
            .padding(contentPadding)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 420.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(38.dp))
            }
            Spacer(Modifier.height(20.dp))
            Text(title, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = primary.second,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.onSurface,
                    contentColor = MaterialTheme.colorScheme.surface,
                ),
            ) { Text(primary.first, fontWeight = FontWeight.SemiBold) }
            secondary?.let { (label, action) ->
                Spacer(Modifier.height(6.dp))
                OutlinedButton(onClick = action) { Text(label) }
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Text(
        message,
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp, vertical = 64.dp),
    )
}

@Composable
private fun StreamDialog(onDismiss: () -> Unit, onPlay: (String) -> Unit) {
    var url by rememberSaveable { mutableStateOf("") }
    val valid = url.trim().let { it.startsWith("http://") || it.startsWith("https://") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Play from URL") },
        text = {
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                placeholder = { Text("https://example.com/video.mp4") },
                supportingText = { Text("MP4, WebM, MKV and HLS (.m3u8) links work") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { if (valid) onPlay(url.trim()) }),
            )
        },
        confirmButton = {
            TextButton(onClick = { onPlay(url.trim()) }, enabled = valid) { Text("Play") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

// endregion

/** The featured video on the phone tab: the one you were last watching, otherwise the newest. */
private fun heroLocal(state: LibraryState): VideoItem? =
    state.continueLocal.firstOrNull() ?: state.videos.maxByOrNull { it.dateAddedSec }

/** The featured video on the server tab. */
private fun heroServer(state: LibraryState): ServerVideo? =
    state.continueServer.firstOrNull() ?: state.server.videos.maxByOrNull { it.created }

/** Big featured card at the top of the library: resume where you left off, or play the newest. */
@Composable
private fun HeroCard(card: CardModel, resuming: Boolean, onPlay: () -> Unit, onStartOver: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        val ratio = if (maxWidth < 600.dp) 4f / 3.6f else 21f / 9f
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(ratio)
                .pressScale(interaction, pressedScale = 0.985f)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.Black)
                .clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onPlay)
        ) {
            ThumbImage(card.thumb, Modifier.fillMaxSize())
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Transparent,
                            0.35f to Color.Transparent,
                            1f to Color.Black.copy(alpha = 0.88f),
                        )
                    )
            )
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(20.dp)
            ) {
                Text(
                    if (resuming) "CONTINUE WATCHING" else "LATEST",
                    color = Color.White.copy(alpha = 0.72f),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    card.title,
                    color = Color.White,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (resuming) {
                        Box(
                            Modifier
                                .width(88.dp)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(Color.White.copy(alpha = 0.28f))
                        ) {
                            Box(
                                Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth(card.progress)
                                    .background(MaterialTheme.colorScheme.primary)
                            )
                        }
                        Spacer(Modifier.width(10.dp))
                    }
                    val left = (card.durationMs * (1f - card.progress)).toLong()
                    Text(
                        when {
                            resuming && card.durationMs > 0 -> "${formatDuration(left)} left"
                            card.durationMs > 0 -> "${formatDuration(card.durationMs)} · ${card.subtitle}"
                            else -> card.subtitle
                        },
                        color = Color.White.copy(alpha = 0.8f),
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = onPlay,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF111113)),
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (resuming) "Resume" else "Play", fontWeight = FontWeight.SemiBold)
                    }
                    if (resuming) {
                        Button(
                            onClick = onStartOver,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.White.copy(alpha = 0.18f),
                                contentColor = Color.White,
                            ),
                        ) { Text("Start over", fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
        }
    }
}
