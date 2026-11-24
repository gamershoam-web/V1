package com.v1.player.data

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.v1.player.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.TimeUnit

/**
 * Uploads one video from the phone to your Lumen server in 8 MB chunks.
 * If the connection drops (or the phone restarts) it picks up from the last chunk the server received.
 */
class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val uri = Uri.parse(inputData.getString(KEY_URI) ?: "")
    private val fileName = inputData.getString(KEY_NAME) ?: "video.mp4"
    private val title = inputData.getString(KEY_TITLE) ?: fileName
    private val size = inputData.getLong(KEY_SIZE, 0L)
    private val notificationId = (uri.toString().hashCode() and 0x0fffffff) + 1000

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val settings = ServerSettings(applicationContext)
        if (!settings.connected || size <= 0) return@withContext Result.failure()
        val api = settings.api()
        val prefs = applicationContext.getSharedPreferences("pending_uploads", Context.MODE_PRIVATE)
        val key = "$uri|$size|${api.baseUrl}"

        runCatching { setForeground(foregroundInfo(0f)) }

        try {
            val savedId = prefs.getString(key, null)
            val savedOffset = savedId?.let { api.uploadOffset(it) }
            if (savedId != null && savedOffset == null && alreadyOnServer(api)) {
                // The last chunk landed but we never heard back; don't upload it twice.
                prefs.edit().remove(key).apply()
                notifyFinished(success = true)
                return@withContext Result.success()
            }
            val uploadId: String
            var offset: Long
            if (savedId != null && savedOffset != null) {
                uploadId = savedId
                offset = savedOffset
            } else {
                uploadId = api.createUpload(fileName, size)
                offset = 0L
                prefs.edit().putString(key, uploadId).apply()
            }

            var lastReport = 0L
            var done = false
            while (!done) {
                val stream = applicationContext.contentResolver.openInputStream(uri)
                    ?: throw FileNotFoundException("Can't open $fileName")
                stream.use { input ->
                    input.skipFully(offset)
                    while (offset < size && !isStopped) {
                        val start = offset
                        val result = api.putChunk(uploadId, start, input, minOf(CHUNK_BYTES, size - start)) { sent ->
                            val now = System.currentTimeMillis()
                            if (now - lastReport > 700) {
                                lastReport = now
                                report((start + sent).toFloat() / size)
                            }
                        }
                        offset = result.offset
                        if (result.done) {
                            done = true
                            return@use
                        }
                        if (result.mismatch) return@use // re-open the file at the server's offset
                    }
                }
                if (isStopped) return@withContext Result.retry()
                if (!done && offset >= size) {
                    // Server has every byte; it finalises on the last chunk, so re-check its state.
                    if (api.uploadOffset(uploadId) == null) done = true
                }
            }
            prefs.edit().remove(key).apply()
            notifyFinished(success = true)
            Result.success(workDataOf(KEY_PROGRESS to 1f))
        } catch (e: ServerAuthException) {
            notifyFinished(success = false, reason = e.message)
            Result.failure()
        } catch (e: ServerException) {
            val permanent = e.code in 400..499 && e.code != 408 && e.code != 409 && e.code != 429
            if (permanent) {
                prefs.edit().remove(key).apply()
                notifyFinished(success = false, reason = e.message)
                Result.failure()
            } else {
                retryOrFail(e)
            }
        } catch (e: FileNotFoundException) {
            prefs.edit().remove(key).apply()
            notifyFinished(success = false, reason = "The video is no longer on this phone")
            Result.failure()
        } catch (e: IOException) {
            retryOrFail(e)
        }
    }

    private fun retryOrFail(e: Exception): Result =
        if (runAttemptCount < 25) Result.retry()
        else {
            notifyFinished(success = false, reason = e.message)
            Result.failure()
        }

    private suspend fun alreadyOnServer(api: ServerApi): Boolean = runCatching {
        api.videos().any { it.sizeBytes == size && fileName.startsWith(it.title) }
    }.getOrDefault(false)

    private fun report(fraction: Float) {
        setProgressAsync(workDataOf(KEY_PROGRESS to fraction, KEY_TITLE to title))
        runCatching { setForegroundAsync(foregroundInfo(fraction)) }
    }

    private fun foregroundInfo(fraction: Float): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_upload)
            .setContentTitle("Uploading $title")
            .setContentText("${(fraction * 100).toInt()}% · to your Lumen server")
            .setProgress(1000, (fraction * 1000).toInt(), false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(notificationId, notification)
        }
    }

    private fun notifyFinished(success: Boolean, reason: String? = null) {
        val nm = NotificationManagerCompat.from(applicationContext)
        if (!nm.areNotificationsEnabled()) return
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_upload)
            .setContentTitle(if (success) "Uploaded $title" else "Couldn't upload $title")
            .setContentText(if (success) "It's ready to watch on your server" else reason ?: "Try again later")
            .setAutoCancel(true)
            .build()
        try {
            nm.notify(notificationId + 1, notification)
        } catch (_: SecurityException) {
            // Notification permission was revoked; nothing to show.
        }
    }

    private fun InputStream.skipFully(bytes: Long) {
        var left = bytes
        val buf = ByteArray(64 * 1024)
        while (left > 0) {
            val skipped = skip(left)
            if (skipped > 0) {
                left -= skipped
                continue
            }
            val n = read(buf, 0, minOf(buf.size.toLong(), left).toInt())
            if (n < 0) throw IOException("The file is shorter than expected")
            left -= n
        }
    }

    companion object {
        const val TAG = "server-upload"
        const val CHANNEL_ID = "uploads"
        const val KEY_URI = "uri"
        const val KEY_NAME = "name"
        const val KEY_TITLE = "title"
        const val KEY_SIZE = "size"
        const val KEY_PROGRESS = "progress"
        private const val CHUNK_BYTES = 8L * 1024 * 1024

        fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val channel = NotificationChannel(CHANNEL_ID, "Uploads", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Progress of videos uploading to your server"
            }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        fun enqueue(context: Context, video: VideoItem, extraTag: String) {
            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setInputData(
                    workDataOf(
                        KEY_URI to video.uri.toString(),
                        KEY_NAME to video.fileName,
                        KEY_TITLE to video.title,
                        KEY_SIZE to video.sizeBytes,
                    )
                )
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .addTag(TAG)
                .addTag(extraTag)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork("upload:${video.uri}", ExistingWorkPolicy.KEEP, request)
        }
    }
}
