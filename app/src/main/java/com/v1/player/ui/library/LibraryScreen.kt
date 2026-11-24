package com.v1.player.ui.library

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.VideoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.v1.player.data.VideoItem
import com.v1.player.util.formatDuration
import com.v1.player.util.formatSize
import com.v1.player.util.resolutionLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    state: LibraryState,
    hasPermission: Boolean,
    onRequestPermission: () -> Unit,
    onRefresh: () -> Unit,
    onQueryChange: (String) -> Unit,
    onFolderSelect: (String?) -> Unit,
    onSortChange: (SortOrder) -> Unit,
    onToggleGrid: () -> Unit,
    onOpenVideo: (List<VideoItem>, Int) -> Unit,
    onOpenFile: () -> Unit,
    onOpenStream: (String) -> Unit,
) {
    var searching by rememberSaveable { mutableStateOf(false) }
    var showStreamDialog by rememberSaveable { mutableStateOf(false) }
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LibraryTopBar(
                state = state,
                searching = searching,
                hasPermission = hasPermission,
                onSearchingChange = {
                    searching = it
                    if (!it) onQueryChange("")
                },
                onQueryChange = onQueryChange,
                onSortChange = onSortChange,
                onToggleGrid = onToggleGrid,
                onOpenFile = onOpenFile,
                onOpenStream = { showStreamDialog = true },
                scrollBehavior = scrollBehavior,
            )
        },
    ) { padding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                !hasPermission -> PermissionPrompt(onRequestPermission, onOpenFile)
                state.loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = onRefresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    Column(Modifier.fillMaxSize()) {
                        if (state.folders.size > 1) {
                            FolderChips(state, onFolderSelect)
                        }
                        val visible = state.visible
                        if (visible.isEmpty()) {
                            EmptyState(
                                if (state.query.isNotBlank()) "No videos match \"${state.query}\""
                                else "No videos found on this device"
                            )
                        } else if (state.grid) {
                            VideoGrid(visible, state, onOpenVideo)
                        } else {
                            VideoList(visible, state, onOpenVideo)
                        }
                    }
                }
            }
        }
    }

    if (showStreamDialog) {
        StreamDialog(
            onDismiss = { showStreamDialog = false },
            onPlay = {
                showStreamDialog = false
                onOpenStream(it)
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LibraryTopBar(
    state: LibraryState,
    searching: Boolean,
    hasPermission: Boolean,
    onSearchingChange: (Boolean) -> Unit,
    onQueryChange: (String) -> Unit,
    onSortChange: (SortOrder) -> Unit,
    onToggleGrid: () -> Unit,
    onOpenFile: () -> Unit,
    onOpenStream: () -> Unit,
    scrollBehavior: androidx.compose.material3.TopAppBarScrollBehavior,
) {
    var sortMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }

    TopAppBar(
        scrollBehavior = scrollBehavior,
        navigationIcon = {
            if (searching) {
                IconButton(onClick = { onSearchingChange(false) }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Close search")
                }
            }
        },
        title = {
            if (searching) {
                SearchField(state.query, onQueryChange)
            } else {
                Column {
                    Text("Videos", fontWeight = FontWeight.SemiBold)
                    if (hasPermission && !state.loading) {
                        Text(
                            "${state.videos.size} videos",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        actions = {
            if (hasPermission && !searching) {
                IconButton(onClick = { onSearchingChange(true) }) {
                    Icon(Icons.Filled.Search, contentDescription = "Search")
                }
            }
            if (hasPermission) {
                IconButton(onClick = onToggleGrid) {
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
                                    onSortChange(order)
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
                        text = { Text("Open file…") },
                        leadingIcon = { Icon(Icons.Filled.FolderOpen, contentDescription = null) },
                        onClick = {
                            moreMenu = false
                            onOpenFile()
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
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            FilterChip(
                selected = state.folder == null,
                onClick = { onFolderSelect(null) },
                label = { Text("All") },
            )
        }
        items(state.folders, key = { it.name }) { folder ->
            FilterChip(
                selected = state.folder == folder.name,
                onClick = { onFolderSelect(if (state.folder == folder.name) null else folder.name) },
                label = { Text("${folder.name}  ${folder.count}") },
            )
        }
    }
}

@Composable
private fun VideoGrid(
    videos: List<VideoItem>,
    state: LibraryState,
    onOpenVideo: (List<VideoItem>, Int) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 168.dp),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(videos, key = { it.id }) { video ->
            Column(
                Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { onOpenVideo(videos, videos.indexOf(video)) }
            ) {
                Thumbnail(video, state.progressOf(video), Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Text(
                    video.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 2.dp),
                )
                Text(
                    subtitle(video),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 2.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun VideoList(
    videos: List<VideoItem>,
    state: LibraryState,
    onOpenVideo: (List<VideoItem>, Int) -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(vertical = 8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(videos, key = { it.id }) { video ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onOpenVideo(videos, videos.indexOf(video)) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Thumbnail(video, state.progressOf(video), Modifier.width(136.dp))
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        video.title,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        subtitle(video),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun Thumbnail(video: VideoItem, progress: Float, modifier: Modifier = Modifier) {
    Box(
        modifier
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Icon(
            Icons.Outlined.VideoLibrary,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier
                .align(Alignment.Center)
                .size(28.dp),
        )
        AsyncImage(
            model = video.thumbnail,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        if (video.durationMs > 0) {
            Text(
                formatDuration(video.durationMs),
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(6.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color.Black.copy(alpha = 0.65f))
                    .padding(horizontal = 5.dp, vertical = 1.dp),
            )
        }
        AnimatedVisibility(progress > 0f, modifier = Modifier.align(Alignment.BottomCenter)) {
            LinearProgressIndicator(
                progress = { progress },
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

private fun subtitle(video: VideoItem): String = listOfNotNull(
    resolutionLabel(video.width, video.height),
    formatSize(video.sizeBytes).ifEmpty { null },
    video.folder,
).joinToString(" · ")

@Composable
private fun PermissionPrompt(onRequestPermission: () -> Unit, onOpenFile: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Outlined.VideoLibrary,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(72.dp),
        )
        Spacer(Modifier.height(24.dp))
        Text(
            "See all your videos",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Allow access to videos on this device to browse and play them.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onRequestPermission) { Text("Allow access") }
        TextButton(onClick = onOpenFile) { Text("Open a single file instead") }
    }
}

@Composable
private fun EmptyState(message: String) {
    Box(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
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
