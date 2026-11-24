package com.v1.player.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material.icons.outlined.VideoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.v1.player.data.SeriesInfo
import com.v1.player.data.ServerVideo
import com.v1.player.util.formatDuration

// region Library row

/** "Series" section on the server tab: a row of series, or a hint to create the first one. */
@Composable
internal fun SeriesSection(
    series: List<SeriesInfo>,
    videos: Map<String, ServerVideo>,
    actions: LibraryActions,
    onNewSeries: () -> Unit,
) {
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 8.dp, top = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Series",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onNewSeries) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("New series")
            }
        }
        if (series.isEmpty()) {
            Text(
                "Group episodes into a series with seasons. Lumen remembers where you are and plays the next episode for you.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
        } else {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(series, key = { it.id }) { sr ->
                    SeriesCard(sr, posterThumb(sr, videos, actions), Modifier.width(212.dp)) { actions.openSeries(sr.id) }
                }
            }
        }
    }
}

internal fun posterThumb(series: SeriesInfo, videos: Map<String, ServerVideo>, actions: LibraryActions): Any? =
    series.posterVideoId?.let(videos::get)?.takeIf { it.hasThumb }?.let { actions.serverThumb(it) }

/** A series card: its poster with two "pages" peeking out above, so it reads as a stack. */
@Composable
private fun SeriesCard(series: SeriesInfo, poster: Any?, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
    ) {
        Box(Modifier.padding(top = 10.dp)) {
            val layer = MaterialTheme.colorScheme.surfaceVariant
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (-10).dp)
                    .fillMaxWidth(0.82f)
                    .height(14.dp)
                    .clip(RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp))
                    .background(layer.copy(alpha = 0.5f))
            )
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (-5).dp)
                    .fillMaxWidth(0.91f)
                    .height(14.dp)
                    .clip(RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp))
                    .background(layer)
            )
            Thumbnail(
                CardModel(
                    key = series.id,
                    title = series.title,
                    subtitle = "",
                    durationMs = 0,
                    progress = 0f,
                    thumb = poster,
                    badge = "${series.episodeCount} ep",
                ),
                Modifier.fillMaxWidth(),
            )
        }
        Text(
            series.title,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 2.dp, top = 8.dp),
        )
        Text(
            seriesStatus(series),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            modifier = Modifier.padding(start = 2.dp, top = 2.dp, bottom = 4.dp),
        )
    }
}

private fun seriesStatus(series: SeriesInfo): String {
    val seasons = series.seasons.size
    val status = when {
        series.episodeCount == 0 -> "No episodes yet"
        series.watchedCount >= series.episodeCount -> "All watched"
        series.nextUp != null -> "Next: ${series.nextUp.label}"
        else -> ""
    }
    return "$seasons season${if (seasons == 1) "" else "s"} · $status"
}

// endregion

// region Series screen

@Composable
internal fun SeriesScreen(
    series: SeriesInfo,
    seasonId: String?,
    videos: Map<String, ServerVideo>,
    actions: LibraryActions,
) {
    val season = series.seasons.firstOrNull { it.id == seasonId } ?: series.seasons.first()
    val episodes = season.episodes.mapNotNull(videos::get)
    val poster = posterThumb(series, videos, actions)
    val insets = WindowInsets.safeDrawing.asPaddingValues()

    var renameSeries by remember { mutableStateOf(false) }
    var deleteSeries by remember { mutableStateOf(false) }
    var renameSeason by remember { mutableStateOf(false) }
    var deleteSeason by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        AmbientBackdrop(poster)
        LazyColumn(
            contentPadding = PaddingValues(top = insets.calculateTopPadding(), bottom = insets.calculateBottomPadding() + 24.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "top") {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { actions.openSeries(null) }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                    Spacer(Modifier.weight(1f))
                    OverflowMenu(
                        "Series options",
                        listOf(
                            MenuEntry("Rename series", Icons.Filled.Edit) { renameSeries = true },
                            MenuEntry("Delete series", Icons.Filled.Delete, danger = true) { deleteSeries = true },
                        ),
                    )
                }
            }
            item(key = "header") {
                Column(Modifier.padding(horizontal = 20.dp)) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 9f)
                            .clip(RoundedCornerShape(20.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Icon(
                            Icons.Outlined.VideoLibrary,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier
                                .align(Alignment.Center)
                                .size(36.dp),
                        )
                        ThumbImage(poster, Modifier.fillMaxSize())
                    }
                    Spacer(Modifier.height(18.dp))
                    Text(
                        "SERIES",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(series.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    val n = series.seasons.size
                    Text(
                        listOfNotNull(
                            "$n season${if (n == 1) "" else "s"}",
                            "${series.episodeCount} episode${if (series.episodeCount == 1) "" else "s"}",
                            series.watchedCount.takeIf { it > 0 }?.let { "$it watched" },
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val next = series.nextUp?.let { nu -> videos[nu.videoId]?.let { nu to it } }
                    if (next != null) {
                        val (nu, video) = next
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = { actions.playSeries(series, nu.videoId) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.onSurface,
                                contentColor = MaterialTheme.colorScheme.surface,
                            ),
                        ) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(6.dp))
                            val verb = when {
                                video.progressMs > 0 -> "Resume"
                                series.watchedCount > 0 -> "Play"
                                else -> "Start"
                            }
                            Text("$verb ${nu.label}", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            item(key = "seasons") {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(series.seasons, key = { it.id }) { se ->
                        val selected = se.id == season.id
                        SeasonChip(
                            text = se.title,
                            count = se.episodes.size,
                            selected = selected,
                        ) { actions.selectSeason(se.id) }
                    }
                    item(key = "add-season") {
                        Row(
                            Modifier
                                .clip(CircleShape)
                                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                .clickable { actions.addSeason(series.id) }
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(4.dp))
                            Text("Season", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            item(key = "season-head") {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 20.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        season.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { picking = true }) {
                        Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Add episodes")
                    }
                    OverflowMenu(
                        "Season options",
                        listOf(
                            MenuEntry("Rename season", Icons.Filled.Edit) { renameSeason = true },
                            MenuEntry("Delete season", Icons.Filled.Delete, danger = true) { deleteSeason = true },
                        ),
                    )
                }
            }
            if (episodes.isEmpty()) {
                item(key = "empty") {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 32.dp, vertical = 36.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("No episodes in this season yet", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Pick videos from your server to add them in order.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = { picking = true },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.onSurface,
                                contentColor = MaterialTheme.colorScheme.surface,
                            ),
                        ) { Text("Add episodes") }
                    }
                }
            }
            itemsIndexed(episodes, key = { _, v -> "ep-" + v.id }) { index, video ->
                val isNext = series.nextUp?.videoId == video.id &&
                    series.seasons.getOrNull(series.nextUp.season - 1)?.id == season.id
                EpisodeRow(
                    number = index + 1,
                    video = video,
                    isNext = isNext,
                    thumb = if (video.hasThumb) actions.serverThumb(video) else null,
                    canMoveUp = index > 0,
                    canMoveDown = index < episodes.lastIndex,
                    onPlay = { actions.playSeries(series, video.id) },
                    onMove = { delta -> actions.moveEpisode(series, season.id, index, index + delta) },
                    onRemove = { actions.removeEpisode(series.id, season.id, video.id) },
                    modifier = Modifier.animateItem(),
                )
                if (index < episodes.lastIndex) {
                    HorizontalDivider(
                        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                        modifier = Modifier.padding(start = 64.dp, end = 16.dp),
                    )
                }
            }
        }
    }

    if (renameSeries) {
        TextPromptDialog("Rename series", series.title, "Save", onDismiss = { renameSeries = false }) {
            renameSeries = false
            actions.renameSeries(series.id, it)
        }
    }
    if (deleteSeries) {
        ConfirmDialog(
            title = "Delete series?",
            message = "\"${series.title}\" and its seasons will be removed. The videos stay on your server.",
            confirm = "Delete series",
            onDismiss = { deleteSeries = false },
        ) {
            deleteSeries = false
            actions.deleteSeries(series.id)
        }
    }
    if (renameSeason) {
        TextPromptDialog("Rename season", season.title, "Save", onDismiss = { renameSeason = false }) {
            renameSeason = false
            actions.renameSeason(series.id, season.id, it)
        }
    }
    if (deleteSeason) {
        val count = season.episodes.size
        ConfirmDialog(
            title = "Delete ${season.title}?",
            message = if (count > 0) "Its $count episode${if (count == 1) "" else "s"} will be removed from this series. The videos stay on your server."
            else "This season is empty.",
            confirm = "Delete season",
            onDismiss = { deleteSeason = false },
        ) {
            deleteSeason = false
            actions.deleteSeason(series.id, season.id)
        }
    }
    if (picking) {
        EpisodePickerDialog(
            seasonTitle = season.title,
            videos = videos.values.toList(),
            alreadyAdded = season.episodes.toSet(),
            thumbFor = { if (it.hasThumb) actions.serverThumb(it) else null },
            onDismiss = { picking = false },
        ) { ids ->
            picking = false
            actions.addEpisodes(series.id, season.id, ids, season.title)
        }
    }
}

@Composable
private fun SeasonChip(text: String, count: Int, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        Modifier
            .clip(CircleShape)
            .background(if (selected) colors.onSurface else colors.surfaceVariant.copy(alpha = 0.7f))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val fg = if (selected) colors.surface else colors.onSurface
        Text(text, color = fg, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(6.dp))
        Text("$count", color = fg.copy(alpha = 0.6f), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun EpisodeRow(
    number: Int,
    video: ServerVideo,
    isNext: Boolean,
    thumb: Any?,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onPlay: () -> Unit,
    onMove: (Int) -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val status = when {
        video.watched -> "Watched"
        video.progressMs > 0 && video.durationMs > 0 -> "${formatDuration(video.durationMs - video.progressMs)} left"
        video.durationMs > 0 -> formatDuration(video.durationMs)
        else -> ""
    }
    Row(
        modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay)
            .padding(start = 8.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "$number",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(40.dp),
        )
        Thumbnail(
            CardModel(
                key = video.id,
                title = video.title,
                subtitle = "",
                durationMs = video.durationMs,
                progress = if (video.durationMs > 0) (video.progressMs.toFloat() / video.durationMs).coerceIn(0f, 1f) else 0f,
                thumb = thumb,
            ),
            Modifier.width(128.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                video.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = if (video.watched) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isNext) {
                    Text(
                        "UP NEXT",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1A1200),
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(Color(0xFFF5A524))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        OverflowMenu(
            "Episode options",
            buildList {
                if (canMoveUp) add(MenuEntry("Move up", Icons.Filled.ArrowUpward) { onMove(-1) })
                if (canMoveDown) add(MenuEntry("Move down", Icons.Filled.ArrowDownward) { onMove(1) })
                add(MenuEntry("Remove from season", Icons.Filled.RemoveCircleOutline, danger = true, onClick = onRemove))
            },
        )
    }
}

// endregion

// region Dialogs and menus

internal data class MenuEntry(val label: String, val icon: ImageVector, val danger: Boolean = false, val onClick: () -> Unit)

@Composable
internal fun OverflowMenu(description: String, entries: List<MenuEntry>) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(Icons.Filled.MoreVert, contentDescription = description, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            entries.forEach { entry ->
                val color = if (entry.danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                DropdownMenuItem(
                    text = { Text(entry.label, color = color) },
                    leadingIcon = { Icon(entry.icon, contentDescription = null, tint = color) },
                    onClick = {
                        open = false
                        entry.onClick()
                    },
                )
            }
        }
    }
}

@Composable
internal fun TextPromptDialog(
    title: String,
    initial: String,
    confirm: String,
    placeholder: String = "",
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var text by rememberSaveable { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it.take(200) },
                placeholder = { Text(placeholder) },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(text.trim()) }, enabled = text.isNotBlank()) { Text(confirm) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
internal fun ConfirmDialog(title: String, message: String, confirm: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirm, color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Pick server videos to add to a season; they're added in natural name order (E2 before E10). */
@Composable
private fun EpisodePickerDialog(
    seasonTitle: String,
    videos: List<ServerVideo>,
    alreadyAdded: Set<String>,
    thumbFor: (ServerVideo) -> Any?,
    onDismiss: () -> Unit,
    onAdd: (List<String>) -> Unit,
) {
    val sorted = remember(videos) { videos.sortedWith(compareBy(NaturalOrder) { it.title }) }
    val chosen = remember { mutableStateListOf<String>() }
    var query by rememberSaveable { mutableStateOf("") }
    val shown = sorted.filter { query.isBlank() || it.title.contains(query.trim(), ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add episodes to $seasonTitle") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search your videos") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(Modifier.heightIn(max = 380.dp)) {
                    if (shown.isEmpty()) {
                        item {
                            Text(
                                if (query.isBlank()) "No videos on your server yet." else "No videos match.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 16.dp),
                            )
                        }
                    }
                    items(shown, key = { it.id }) { video ->
                        val added = video.id in alreadyAdded
                        val checked = added || video.id in chosen
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable(enabled = !added) {
                                    if (video.id in chosen) chosen.remove(video.id) else chosen.add(video.id)
                                }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(
                                checked = checked,
                                onCheckedChange = null,
                                enabled = !added,
                                colors = CheckboxDefaults.colors(checkedColor = MaterialTheme.colorScheme.primary),
                            )
                            Spacer(Modifier.width(8.dp))
                            Thumbnail(
                                CardModel(video.id, video.title, "", video.durationMs, 0f, thumbFor(video)),
                                Modifier.width(88.dp),
                            )
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(video.title, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                if (added) {
                                    Text(
                                        "Already in this season",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(sorted.map { it.id }.filter { it in chosen }) },
                enabled = chosen.isNotEmpty(),
            ) { Text(if (chosen.isEmpty()) "Add" else "Add ${chosen.size}") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** "Add to series…" from a video's menu: tap a season, or start a new series with this video. */
@Composable
internal fun AddToSeriesDialog(
    video: ServerVideo,
    series: List<SeriesInfo>,
    onDismiss: () -> Unit,
    onPick: (SeriesInfo, String) -> Unit,
    onCreate: (String) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add to series") },
        text = {
            LazyColumn(Modifier.heightIn(max = 420.dp)) {
                item {
                    Text(video.title, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(12.dp))
                }
                items(series, key = { it.id }) { sr ->
                    Text(sr.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp, bottom = 6.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(sr.seasons, key = { it.id }) { se ->
                            val has = video.id in se.episodes
                            Row(
                                Modifier
                                    .clip(CircleShape)
                                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                    .clickable(enabled = !has) { onPick(sr, se.id) }
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (has) {
                                    Icon(Icons.Filled.Check, contentDescription = "Already added", modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                }
                                Text(
                                    se.title,
                                    style = MaterialTheme.typography.labelLarge,
                                    color = if (has) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }
                }
                item {
                    Spacer(Modifier.height(16.dp))
                    Text(
                        if (series.isEmpty()) "START A NEW SERIES" else "OR START A NEW SERIES",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = name,
                            onValueChange = { name = it.take(200) },
                            placeholder = { Text("Series name") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = { onCreate(name.trim()) }, enabled = name.isNotBlank()) { Text("Create") }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

/** Sorts "Episode 2" before "Episode 10". */
private val NaturalOrder = Comparator<String> { a, b ->
    val chunks = Regex("\\d+|\\D+")
    val x = chunks.findAll(a.lowercase()).map { it.value }.toList()
    val y = chunks.findAll(b.lowercase()).map { it.value }.toList()
    for (i in 0 until minOf(x.size, y.size)) {
        val p = x[i]
        val q = y[i]
        val c = if (p[0].isDigit() && q[0].isDigit()) {
            p.trimStart('0').length.compareTo(q.trimStart('0').length).takeIf { it != 0 }
                ?: p.trimStart('0').compareTo(q.trimStart('0'))
        } else {
            p.compareTo(q)
        }
        if (c != 0) return@Comparator c
    }
    x.size.compareTo(y.size)
}

// endregion
