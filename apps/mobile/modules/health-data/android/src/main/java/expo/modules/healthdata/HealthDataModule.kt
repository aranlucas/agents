package expo.modules.healthdata

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.Duration
import java.time.Instant

private const val providerPackageName = "com.google.android.apps.healthdata"

private val requiredPermissions = setOf(
  HealthPermission.getReadPermission(ExerciseSessionRecord::class),
  HealthPermission.getReadPermission(DistanceRecord::class),
  HealthPermission.getReadPermission(ElevationGainedRecord::class),
  HealthPermission.getReadPermission(HeartRateRecord::class)
)

private class HealthPermissionsContract : AppContextActivityResultContract<ArrayList<String>, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: android.content.Context, input: ArrayList<String>) =
    delegate.createIntent(context, input.toSet())

  override fun parseResult(input: ArrayList<String>, resultCode: Int, intent: android.content.Intent?) =
    delegate.parseResult(resultCode, intent)
}

class HealthDataModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HealthData")

    lateinit var permissionLauncher: AppContextActivityResultLauncher<ArrayList<String>, Set<String>>

    RegisterActivityContracts {
      permissionLauncher = registerForActivityResult(HealthPermissionsContract())
    }

    AsyncFunction("getAvailabilityAsync") {
      availability()
    }

    AsyncFunction("getPermissionStatusAsync").Coroutine<Map<String, Any>> {
      val client = requireClient()
      permissionResult(client.permissionController.getGrantedPermissions())
    }

    AsyncFunction("requestPermissionsAsync").Coroutine<Map<String, Any>> {
      requireClient()
      val granted = permissionLauncher.launch(ArrayList(requiredPermissions))
      permissionResult(granted)
    }

    AsyncFunction("readActivitiesAsync") Coroutine { after: String, before: String, pageToken: String?, requestedPageSize: Int? ->
      val client = requireClient()
      val granted = client.permissionController.getGrantedPermissions()
      if (!granted.containsAll(requiredPermissions)) {
        throw IllegalStateException("Health Connect permissions are required")
      }
      val start = Instant.parse(after)
      val end = Instant.parse(before)
      val pageSize = (requestedPageSize ?: 100).coerceIn(1, 100)
      val response = client.readRecords(
        ReadRecordsRequest<ExerciseSessionRecord>(
          timeRangeFilter = TimeRangeFilter.between(start, end),
          pageSize = pageSize,
          pageToken = pageToken,
          ascendingOrder = false
        )
      )
      mapOf(
        "activities" to response.records.map { record -> normalizeActivity(client, record) },
        "nextPageToken" to response.pageToken
      )
    }
  }

  private fun availability(): Map<String, Any> {
    val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable")
    val sdkStatus = HealthConnectClient.getSdkStatus(context, providerPackageName)
    val status = when (sdkStatus) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
      else -> "unavailable"
    }
    return mapOf("status" to status, "providerPackage" to providerPackageName)
  }

  private fun requireClient(): HealthConnectClient {
    val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable")
    if (HealthConnectClient.getSdkStatus(context, providerPackageName) != HealthConnectClient.SDK_AVAILABLE) {
      throw IllegalStateException("Health Connect is unavailable or needs an update")
    }
    return HealthConnectClient.getOrCreate(context, providerPackageName)
  }

  private fun permissionResult(granted: Set<String>) = mapOf(
    "granted" to granted.containsAll(requiredPermissions),
    "grantedPermissions" to granted.sorted(),
    "requiredPermissions" to requiredPermissions.sorted()
  )

  private suspend fun normalizeActivity(
    client: HealthConnectClient,
    record: ExerciseSessionRecord
  ): Map<String, Any?> {
    val aggregation = client.aggregate(
      AggregateRequest(
        metrics = setOf(
          DistanceRecord.DISTANCE_TOTAL,
          ElevationGainedRecord.ELEVATION_GAINED_TOTAL,
          HeartRateRecord.BPM_AVG
        ),
        timeRangeFilter = TimeRangeFilter.between(record.startTime, record.endTime),
        dataOriginFilter = setOf(record.metadata.dataOrigin)
      )
    )
    val elapsedSeconds = Duration.between(record.startTime, record.endTime).seconds
    return mapOf(
      "id" to record.metadata.id,
      "source" to "health_connect",
      "name" to (record.title?.takeIf { it.isNotBlank() } ?: sportName(record.exerciseType)),
      "sport_type" to sportName(record.exerciseType),
      "start_date" to record.startTime.toString(),
      "end_date" to record.endTime.toString(),
      "moving_time_s" to elapsedSeconds,
      "elapsed_time_s" to elapsedSeconds,
      "distance_m" to aggregation[DistanceRecord.DISTANCE_TOTAL]?.inMeters,
      "total_elevation_gain_m" to aggregation[ElevationGainedRecord.ELEVATION_GAINED_TOTAL]?.inMeters,
      "average_heartrate" to aggregation[HeartRateRecord.BPM_AVG]?.toDouble(),
      "data_origin" to record.metadata.dataOrigin.packageName
    )
  }

  private fun sportName(exerciseType: Int): String = when (exerciseType) {
    ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "Cycling"
    ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Indoor cycling"
    ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "Hiking"
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "Running"
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Treadmill running"
    ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "Strength training"
    ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Open-water swimming"
    ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "Pool swimming"
    ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Walking"
    ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "Yoga"
    else -> "Workout"
  }
}
