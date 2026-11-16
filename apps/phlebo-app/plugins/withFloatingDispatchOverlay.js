const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

const REQUIRED_ANDROID_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
  'android.permission.USE_FULL_SCREEN_INTENT',
];

function buildOverlayServiceKotlin(packageName) {
  return `package ${packageName}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.CountDownTimer
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

class FloatingDispatchOverlayService : Service() {
  private var windowManager: WindowManager? = null
  private var bubbleContainer: FrameLayout? = null
  private var badgeView: TextView? = null
  private var statusDotView: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null

  // Floating Incoming Pickup Modal Over Screen
  private var incomingModalView: View? = null
  private var bookingPlayer: MediaPlayer? = null
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private var countdownTimer: CountDownTimer? = null
  private var wakeLock: PowerManager.WakeLock? = null

  private var currentOnline = true
  private var currentNearbyCount = 0
  private var currentCourierId = "LabSetu"

  private var currentIncomingOrderId: String? = null
  private var currentIncomingOrderNumber: String? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopAlertSound()
        detachIncomingModal()
        stopForegroundCompat()
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_DISMISS_INCOMING -> {
        stopAlertSound()
        detachIncomingModal()
        return START_STICKY
      }
      ACTION_INCOMING_ORDER -> {
        val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: ""
        val orderNum = intent.getStringExtra(EXTRA_ORDER_NUMBER) ?: orderId
        val pickupLab = intent.getStringExtra(EXTRA_PICKUP_LAB) ?: "Pickup Lab"
        val pickupAddr = intent.getStringExtra(EXTRA_PICKUP_ADDRESS) ?: "Sample Collection Address"
        val targetLab = intent.getStringExtra(EXTRA_TARGET_LAB) ?: "Testing Lab"
        val distance = intent.getStringExtra(EXTRA_DISTANCE) ?: "Nearby"
        val payout = intent.getStringExtra(EXTRA_PAYOUT) ?: "Earn ₹100"
        val specimens = intent.getStringExtra(EXTRA_SPECIMENS) ?: "1 Test • Standard"
        val timeoutSec = intent.getIntExtra(EXTRA_TIMEOUT_SEC, 45)
        val surgeIncentive = intent.getIntExtra(EXTRA_SURGE_INCENTIVE, 0)

        currentIncomingOrderId = orderId
        currentIncomingOrderNumber = orderNum

        if (canDrawOverlaysCompat(this)) {
          showIncomingOrderModal(
            orderId = orderId,
            orderNum = orderNum,
            pickupLab = pickupLab,
            pickupAddr = pickupAddr,
            targetLab = targetLab,
            distance = distance,
            payout = payout,
            specimens = specimens,
            timeoutSec = timeoutSec,
            surgeIncentive = surgeIncentive
          )
        }
        return START_STICKY
      }
    }

    currentOnline = intent?.getBooleanExtra(EXTRA_IS_ONLINE, currentOnline) ?: currentOnline
    currentNearbyCount = intent?.getIntExtra(EXTRA_NEARBY_COUNT, currentNearbyCount) ?: currentNearbyCount
    currentCourierId = intent?.getStringExtra(EXTRA_COURIER_ID) ?: currentCourierId

    val notification = buildForegroundNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, notification)
    }

    if (canDrawOverlaysCompat(this)) {
      if (bubbleContainer == null) {
        attachFloatingBubble()
      } else {
        refreshBubbleAppearance()
      }
    }

    return START_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    stopAlertSound()
    detachIncomingModal()
    detachFloatingBubble()
  }

  private fun dp(value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      resources.displayMetrics
    ).toInt()
  }

  /* =========================================================================
   * 1. Incoming Pickup Floating Modal Card Over Other Apps
   * ========================================================================= */
  private fun showIncomingOrderModal(
    orderId: String,
    orderNum: String,
    pickupLab: String,
    pickupAddr: String,
    targetLab: String,
    distance: String,
    payout: String,
    specimens: String,
    timeoutSec: Int,
    surgeIncentive: Int
  ) {
    detachIncomingModal()
    acquireScreenWakeLock()
    startAlertSound()

    val wm = windowManager ?: return

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      val pad = dp(16)
      setPadding(pad, pad, pad, pad)
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(20).toFloat()
        setColor(Color.parseColor("#0F172A")) // Deep dark slate
        setStroke(dp(2), Color.parseColor("#0D9488")) // Teal border
      }
      background = bg
      elevation = dp(24).toFloat()
    }

    // Top Header Row: Pulse pill & Countdown Badge
    val topRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    val liveBadge = TextView(this).apply {
      text = "⚡ NEW SAMPLE PICKUP"
      setTextColor(Color.parseColor("#10B981"))
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(8), dp(4), dp(8), dp(4))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#064E3B"))
      }
    }
    topRow.addView(liveBadge)

    val spacerTop = View(this)
    val spacerTopLp = LinearLayout.LayoutParams(0, 1, 1f)
    topRow.addView(spacerTop, spacerTopLp)

    val timerBadge = TextView(this).apply {
      text = "\${timeoutSec}s"
      setTextColor(Color.parseColor("#F59E0B"))
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(10), dp(4), dp(10), dp(4))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#451A03"))
      }
    }
    topRow.addView(timerBadge)
    root.addView(topRow)

    // Optional Surge Price Hike Add-On Banner
    if (surgeIncentive > 0) {
      val surgeBanner = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        val padH = dp(10)
        val padV = dp(6)
        setPadding(padH, padV, padH, padV)
        val bg = GradientDrawable().apply {
          shape = GradientDrawable.RECTANGLE
          cornerRadius = dp(8).toFloat()
          setColor(Color.parseColor("#451A03"))
          setStroke(dp(1), Color.parseColor("#F59E0B"))
        }
        background = bg
      }
      val surgeLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(8)
      }
      val surgeText = TextView(this).apply {
        text = "⚡ +₹\${surgeIncentive} PRICE HIKE ADD-ON INCLUDED"
        setTextColor(Color.parseColor("#FBBF24"))
        textSize = 11.5f
        typeface = Typeface.DEFAULT_BOLD
      }
      surgeBanner.addView(surgeText)
      root.addView(surgeBanner, surgeLp)
    }

    // Animated / Colored Timer Line
    val timerBar = View(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(2).toFloat()
        setColor(Color.parseColor("#0D9488"))
      }
    }
    val barLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(3)).apply {
      topMargin = dp(8)
      bottomMargin = dp(10)
    }
    root.addView(timerBar, barLp)

    // Order Info & Payout Row
    val orderRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    val orderNumView = TextView(this).apply {
      text = orderNum
      setTextColor(Color.WHITE)
      textSize = 17f
      typeface = Typeface.DEFAULT_BOLD
    }
    orderRow.addView(orderNumView)

    val spacerOrder = View(this)
    val spacerOrderLp = LinearLayout.LayoutParams(0, 1, 1f)
    orderRow.addView(spacerOrder, spacerOrderLp)

    val payoutBadge = TextView(this).apply {
      text = payout
      setTextColor(Color.parseColor("#34D399"))
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(10), dp(4), dp(10), dp(4))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#065F46"))
      }
    }
    orderRow.addView(payoutBadge)
    root.addView(orderRow)

    // Pickup Details
    val pickupSection = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(10), 0, dp(4))
    }

    val pickupTitleRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val pickupDot = TextView(this).apply {
      text = "● "
      setTextColor(Color.parseColor("#10B981"))
      textSize = 14f
    }
    val pickupLabView = TextView(this).apply {
      text = pickupLab
      setTextColor(Color.parseColor("#F8FAFC"))
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
    }
    pickupTitleRow.addView(pickupDot)
    pickupTitleRow.addView(pickupLabView)
    pickupSection.addView(pickupTitleRow)

    val pickupAddressView = TextView(this).apply {
      text = pickupAddr
      setTextColor(Color.parseColor("#94A3B8"))
      textSize = 12f
      setPadding(dp(16), dp(2), 0, dp(2))
    }
    pickupSection.addView(pickupAddressView)

    val distanceView = TextView(this).apply {
      text = "📍 $distance"
      setTextColor(Color.parseColor("#38BDF8"))
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(16), 0, 0, 0)
    }
    pickupSection.addView(distanceView)
    root.addView(pickupSection)

    // Drop Hub Details
    val dropSection = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(4), 0, dp(8))
    }
    val dropTitleRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val dropDot = TextView(this).apply {
      text = "● "
      setTextColor(Color.parseColor("#EF4444"))
      textSize = 14f
    }
    val dropLabView = TextView(this).apply {
      text = "Drop: $targetLab"
      setTextColor(Color.parseColor("#E2E8F0"))
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
    }
    dropTitleRow.addView(dropDot)
    dropTitleRow.addView(dropLabView)
    dropSection.addView(dropTitleRow)

    val specimensView = TextView(this).apply {
      text = "🧪 $specimens"
      setTextColor(Color.parseColor("#A5B4FC"))
      textSize = 12f
      setPadding(dp(16), dp(2), 0, 0)
    }
    dropSection.addView(specimensView)
    root.addView(dropSection)

    // Action Buttons: Decline & Accept
    val actionRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      val lp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(12)
      }
      layoutParams = lp
    }

    val declineBtn = TextView(this).apply {
      text = "✕ Decline"
      setTextColor(Color.parseColor("#F87171"))
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(12).toFloat()
        setColor(Color.parseColor("#1E293B"))
        setStroke(dp(1), Color.parseColor("#DC2626"))
      }
      background = bg
      setPadding(0, dp(12), 0, dp(12))
      isClickable = true
      isFocusable = true
      setOnClickListener {
        handleIncomingOrderAction("DECLINE", orderId, orderNum)
      }
    }
    val declineLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginEnd = dp(8)
    }
    actionRow.addView(declineBtn, declineLp)

    val acceptBtn = TextView(this).apply {
      text = "✓ ACCEPT PICKUP"
      setTextColor(Color.WHITE)
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(12).toFloat()
        setColor(Color.parseColor("#0D9488"))
      }
      background = bg
      setPadding(0, dp(12), 0, dp(12))
      isClickable = true
      isFocusable = true
      setOnClickListener {
        handleIncomingOrderAction("ACCEPT", orderId, orderNum)
      }
    }
    val acceptLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.8f)
    actionRow.addView(acceptBtn, acceptLp)

    root.addView(actionRow)

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val screenW = resources.displayMetrics.widthPixels
    val modalWidth = (screenW - dp(24)).coerceAtLeast(dp(280))

    val lp = WindowManager.LayoutParams(
      modalWidth,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.CENTER
      x = 0
      y = 0
    }

    wm.addView(root, lp)
    incomingModalView = root

    // Start 45-Second Countdown Timer with looping ringtone
    val durationMs = (timeoutSec.coerceIn(10, 60)) * 1000L
    countdownTimer?.cancel()
    countdownTimer = object : CountDownTimer(durationMs, 1000L) {
      override fun onTick(millisUntilFinished: Long) {
        val remSec = (millisUntilFinished / 1000L).toInt()
        timerBadge.text = "\${remSec}s"
        try {
          if (ringtone?.isPlaying == false) {
            ringtone?.play()
          }
        } catch (_: Exception) {}
      }

      override fun onFinish() {
        stopAlertSound()
        detachIncomingModal()
      }
    }.start()
  }

  private fun handleIncomingOrderAction(action: String, orderId: String, orderNum: String) {
    stopAlertSound()
    detachIncomingModal()

    pendingActionType = action
    pendingActionOrderId = orderId

    actionListener?.invoke(action, orderId)

    if (action == "ACCEPT") {
      try {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          putExtra("AUTO_OPEN_ORDER_ID", orderId)
          putExtra("AUTO_OPEN_ORDER_NUMBER", orderNum)
          putExtra("ACTION", "CLAIM_PICKUP")
        }
        if (launchIntent != null) {
          startActivity(launchIntent)
        }
      } catch (_: Exception) {}
    }
  }

  private fun detachIncomingModal() {
    val modal = incomingModalView ?: return
    try {
      windowManager?.removeView(modal)
    } catch (_: Exception) {}
    incomingModalView = null
  }

  private fun acquireScreenWakeLock() {
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
      wakeLock?.release()
      wakeLock = pm?.newWakeLock(
        PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
          PowerManager.ACQUIRE_CAUSES_WAKEUP or
          PowerManager.ON_AFTER_RELEASE,
        "LabSetu:IncomingPickup"
      )?.apply {
        setReferenceCounted(false)
        acquire(48000L)
      }
    } catch (_: Exception) {}
  }

  private fun startAlertSound() {
    try {
      stopAlertSound()
      val resId = resources.getIdentifier("booking_alert", "raw", packageName)
      if (resId != 0) {
        bookingPlayer = MediaPlayer.create(applicationContext, resId)?.apply {
          isLooping = true
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          start()
        }
      } else {
        val alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        ringtone = RingtoneManager.getRingtone(applicationContext, alertUri)?.apply {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            audioAttributes = AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            isLooping = true
          }
          play()
        }
      }
    } catch (_: Exception) {}

    try {
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vm?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      val pattern = longArrayOf(0, 800, 300, 800, 300, 1000)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(pattern, 0)
      }
    } catch (_: Exception) {}
  }

  private fun stopAlertSound() {
    try {
      countdownTimer?.cancel()
      countdownTimer = null
    } catch (_: Exception) {}

    try {
      bookingPlayer?.stop()
      bookingPlayer?.release()
      bookingPlayer = null
    } catch (_: Exception) {}

    try {
      ringtone?.stop()
      ringtone = null
    } catch (_: Exception) {}

    try {
      vibrator?.cancel()
      vibrator = null
    } catch (_: Exception) {}

    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
      wakeLock = null
    } catch (_: Exception) {}
  }

  /* =========================================================================
   * 2. Persistent Floating Duty Bubble (Minimised Quick-Return Orb)
   * ========================================================================= */
  private fun attachFloatingBubble() {
    val wm = windowManager ?: return
    val sizePx = dp(60)

    val container = FrameLayout(this)
    val circle = FrameLayout(this)
    val circleDrawable = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.WHITE)
      setStroke(dp(3), Color.parseColor("#0D9488"))
    }
    circle.background = circleDrawable
    circle.elevation = dp(10).toFloat()

    val label = TextView(this).apply {
      text = "LS"
      setTextColor(Color.parseColor("#0F766E"))
      textSize = 17f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    val labelLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    )
    circle.addView(label, labelLp)

    val circleLp = FrameLayout.LayoutParams(sizePx, sizePx).apply {
      gravity = Gravity.CENTER
    }
    container.addView(circle, circleLp)

    // Online Status Dot
    val dot = View(this)
    val dotDrawable = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(if (currentOnline) Color.parseColor("#10B981") else Color.parseColor("#94A3B8"))
      setStroke(dp(2), Color.WHITE)
    }
    dot.background = dotDrawable
    val dotSize = dp(14)
    val dotLp = FrameLayout.LayoutParams(dotSize, dotSize).apply {
      gravity = Gravity.BOTTOM or Gravity.START
      marginStart = dp(4)
      bottomMargin = dp(4)
    }
    container.addView(dot, dotLp)
    statusDotView = dot

    // Badge for nearby bookings
    val badge = TextView(this).apply {
      text = if (currentNearbyCount > 9) "9+" else currentNearbyCount.toString()
      setTextColor(Color.WHITE)
      textSize = 11f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      val badgeBg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(9).toFloat()
        setColor(Color.parseColor("#EF4444"))
        setStroke(dp(1), Color.WHITE)
      }
      background = badgeBg
      visibility = if (currentNearbyCount > 0) View.VISIBLE else View.GONE
    }
    val badgeLp = FrameLayout.LayoutParams(dp(22), dp(18)).apply {
      gravity = Gravity.TOP or Gravity.END
      marginEnd = dp(2)
      topMargin = dp(2)
    }
    container.addView(badge, badgeLp)
    badgeView = badge

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val displayMetrics = resources.displayMetrics
    val initialX = displayMetrics.widthPixels - sizePx - dp(16)
    val initialY = (displayMetrics.heightPixels * 0.45).toInt()

    val params = WindowManager.LayoutParams(
      sizePx + dp(12),
      sizePx + dp(12),
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = initialX
      y = initialY
    }

    container.setOnTouchListener(object : View.OnTouchListener {
      private var initialTouchX = 0f
      private var initialTouchY = 0f
      private var initialWindowX = 0
      private var initialWindowY = 0
      private var touchStartTime = 0L

      override fun onTouch(v: View?, event: MotionEvent): Boolean {
        when (event.action) {
          MotionEvent.ACTION_DOWN -> {
            initialTouchX = event.rawX
            initialTouchY = event.rawY
            initialWindowX = params.x
            initialWindowY = params.y
            touchStartTime = System.currentTimeMillis()
            return true
          }
          MotionEvent.ACTION_MOVE -> {
            params.x = initialWindowX + (event.rawX - initialTouchX).toInt()
            params.y = initialWindowY + (event.rawY - initialTouchY).toInt()
            windowManager?.updateViewLayout(container, params)
            return true
          }
          MotionEvent.ACTION_UP -> {
            val moved = Math.hypot(
              (event.rawX - initialTouchX).toDouble(),
              (event.rawY - initialTouchY).toDouble()
            )
            val duration = System.currentTimeMillis() - touchStartTime
            if (moved < dp(8) && duration < 300) {
              openAppFromFloatingBubble()
            } else {
              val screenWidth = resources.displayMetrics.widthPixels
              val finalX = if (params.x + sizePx / 2 < screenWidth / 2) dp(12) else screenWidth - sizePx - dp(24)
              params.x = finalX
              windowManager?.updateViewLayout(container, params)
            }
            return true
          }
        }
        return false
      }
    })

    wm.addView(container, params)
    bubbleContainer = container
    layoutParams = params
  }

  private fun refreshBubbleAppearance() {
    val dot = statusDotView ?: return
    val dotDrawable = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(if (currentOnline) Color.parseColor("#10B981") else Color.parseColor("#94A3B8"))
      setStroke(dp(2), Color.WHITE)
    }
    dot.background = dotDrawable

    badgeView?.apply {
      text = if (currentNearbyCount > 9) "9+" else currentNearbyCount.toString()
      visibility = if (currentNearbyCount > 0) View.VISIBLE else View.GONE
    }
  }

  private fun detachFloatingBubble() {
    val bubble = bubbleContainer ?: return
    try {
      windowManager?.removeView(bubble)
    } catch (_: Exception) {}
    bubbleContainer = null
  }

  private fun openAppFromFloatingBubble() {
    try {
      val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      if (launchIntent != null) {
        startActivity(launchIntent)
      }
    } catch (_: Exception) {}
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "LabSetu Dispatch Overlay",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Shows live status and quick return to LabSetu dispatch radar."
        setShowBadge(false)
      }
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.createNotificationChannel(channel)
    }
  }

  private fun buildForegroundNotification(): Notification {
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      packageManager.getLaunchIntentForPackage(packageName) ?: Intent(),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
    )

    val title = if (currentOnline) "🟢 LabSetu On Duty • $currentCourierId" else "⚪ LabSetu On Standby • $currentCourierId"
    val text = if (currentNearbyCount > 0) {
      "⚡ $currentNearbyCount sample pickup request(s) nearby. Tap to open radar."
    } else {
      "Floating radar active. Tap to jump back to LabSetu."
    }

    val iconRes = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(iconRes)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  companion object {
    const val CHANNEL_ID = "labsetu_dispatch_overlay_channel"
    const val NOTIF_ID = 918237

    const val ACTION_START = "ACTION_START_OVERLAY"
    const val ACTION_STOP = "ACTION_STOP_OVERLAY"
    const val ACTION_INCOMING_ORDER = "ACTION_INCOMING_ORDER"
    const val ACTION_DISMISS_INCOMING = "ACTION_DISMISS_INCOMING"

    const val EXTRA_IS_ONLINE = "isOnline"
    const val EXTRA_NEARBY_COUNT = "nearbyCount"
    const val EXTRA_COURIER_ID = "courierId"

    const val EXTRA_ORDER_ID = "orderId"
    const val EXTRA_ORDER_NUMBER = "orderNumber"
    const val EXTRA_PICKUP_LAB = "pickupLab"
    const val EXTRA_PICKUP_ADDRESS = "pickupAddress"
    const val EXTRA_TARGET_LAB = "targetLab"
    const val EXTRA_DISTANCE = "distance"
    const val EXTRA_PAYOUT = "payout"
    const val EXTRA_SPECIMENS = "specimens"
    const val EXTRA_TIMEOUT_SEC = "timeoutSec"
    const val EXTRA_SURGE_INCENTIVE = "surgeIncentive"

    var pendingActionType: String? = null
    var pendingActionOrderId: String? = null
    var actionListener: ((action: String, orderId: String) -> Unit)? = null

    fun canDrawOverlaysCompat(context: Context): Boolean {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(context)
      } else {
        true
      }
    }
  }
}
`;
}

function buildOverlayModuleKotlin(packageName) {
  return `package ${packageName}

import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class FloatingDispatchOverlayModule(
  private val reactCtx: ReactApplicationContext
) : ReactContextBaseJavaModule(reactCtx) {

  companion object {
    private var nativeBookingPlayer: MediaPlayer? = null
  }

  init {
    FloatingDispatchOverlayService.actionListener = { action, orderId ->
      try {
        val map = Arguments.createMap().apply {
          putString("action", action)
          putString("orderId", orderId)
        }
        reactCtx
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("onIncomingOrderAction", map)
      } catch (_: Exception) {}
    }
  }

  override fun getName(): String = "FloatingDispatchOverlayModule"

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      promise.resolve(FloatingDispatchOverlayService.canDrawOverlaysCompat(reactCtx))
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun openOverlayPermissionSettings(promise: Promise) {
    try {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + reactCtx.packageName)
        )
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + reactCtx.packageName))
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactCtx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OVERLAY_SETTINGS_ERR", e.message, e)
    }
  }

  @ReactMethod
  fun startOverlay(options: ReadableMap?, promise: Promise) {
    try {
      if (!FloatingDispatchOverlayService.canDrawOverlaysCompat(reactCtx)) {
        promise.resolve(false)
        return
      }
      val svcIntent = Intent(reactCtx, FloatingDispatchOverlayService::class.java).apply {
        action = FloatingDispatchOverlayService.ACTION_START
        putExtra(
          FloatingDispatchOverlayService.EXTRA_IS_ONLINE,
          if (options?.hasKey("isOnline") == true) options.getBoolean("isOnline") else true
        )
        putExtra(
          FloatingDispatchOverlayService.EXTRA_NEARBY_COUNT,
          if (options?.hasKey("nearbyCount") == true) options.getInt("nearbyCount") else 0
        )
        putExtra(
          FloatingDispatchOverlayService.EXTRA_COURIER_ID,
          if (options?.hasKey("courierId") == true) options.getString("courierId") else "LabSetu"
        )
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactCtx.startForegroundService(svcIntent)
      } else {
        reactCtx.startService(svcIntent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OVERLAY_START_ERR", e.message, e)
    }
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    try {
      val svcIntent = Intent(reactCtx, FloatingDispatchOverlayService::class.java).apply {
        action = FloatingDispatchOverlayService.ACTION_STOP
      }
      reactCtx.stopService(svcIntent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun triggerIncomingPickupModal(orderData: ReadableMap?, promise: Promise) {
    try {
      if (!FloatingDispatchOverlayService.canDrawOverlaysCompat(reactCtx)) {
        promise.resolve(false)
        return
      }
      val svcIntent = Intent(reactCtx, FloatingDispatchOverlayService::class.java).apply {
        action = FloatingDispatchOverlayService.ACTION_INCOMING_ORDER
        putExtra(FloatingDispatchOverlayService.EXTRA_ORDER_ID, orderData?.getString("orderId") ?: "")
        putExtra(FloatingDispatchOverlayService.EXTRA_ORDER_NUMBER, orderData?.getString("orderNumber") ?: "")
        putExtra(FloatingDispatchOverlayService.EXTRA_PICKUP_LAB, orderData?.getString("pickupLab") ?: "")
        putExtra(FloatingDispatchOverlayService.EXTRA_PICKUP_ADDRESS, orderData?.getString("pickupAddress") ?: "")
        putExtra(FloatingDispatchOverlayService.EXTRA_TARGET_LAB, orderData?.getString("targetLab") ?: "")
        putExtra(FloatingDispatchOverlayService.EXTRA_DISTANCE, orderData?.getString("distance") ?: "")
        putExtra(FloatingDispatchOverlayService.EXTRA_PAYOUT, orderData?.getString("payout") ?: "")
        putExtra(FloatingDispatchOverlayService.EXTRA_SPECIMENS, orderData?.getString("specimens") ?: "")
        putExtra(
          FloatingDispatchOverlayService.EXTRA_TIMEOUT_SEC,
          if (orderData?.hasKey("timeoutSec") == true) orderData.getInt("timeoutSec") else 45
        )
        putExtra(
          FloatingDispatchOverlayService.EXTRA_SURGE_INCENTIVE,
          if (orderData?.hasKey("surgeIncentive") == true) orderData.getInt("surgeIncentive") else 0
        )
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactCtx.startForegroundService(svcIntent)
      } else {
        reactCtx.startService(svcIntent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("INCOMING_OVERLAY_ERR", e.message, e)
    }
  }

  @ReactMethod
  fun dismissIncomingPickupModal(promise: Promise) {
    try {
      val svcIntent = Intent(reactCtx, FloatingDispatchOverlayService::class.java).apply {
        action = FloatingDispatchOverlayService.ACTION_DISMISS_INCOMING
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactCtx.startForegroundService(svcIntent)
      } else {
        reactCtx.startService(svcIntent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun getPendingOrderAction(promise: Promise) {
    val action = FloatingDispatchOverlayService.pendingActionType
    val orderId = FloatingDispatchOverlayService.pendingActionOrderId
    if (action != null && orderId != null) {
      val map = Arguments.createMap().apply {
        putString("action", action)
        putString("orderId", orderId)
      }
      FloatingDispatchOverlayService.pendingActionType = null
      FloatingDispatchOverlayService.pendingActionOrderId = null
      promise.resolve(map)
    } else {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun playBookingRingtone(promise: Promise) {
    try {
      nativeBookingPlayer?.stop()
      nativeBookingPlayer?.release()
      nativeBookingPlayer = null
      val resId = reactCtx.resources.getIdentifier("booking_alert", "raw", reactCtx.packageName)
      if (resId != 0) {
        nativeBookingPlayer = MediaPlayer.create(reactCtx, resId)?.apply {
          isLooping = true
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          start()
        }
        promise.resolve(true)
      } else {
        promise.resolve(false)
      }
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stopBookingRingtone(promise: Promise) {
    try {
      nativeBookingPlayer?.stop()
      nativeBookingPlayer?.release()
      nativeBookingPlayer = null
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun playNotificationChime(promise: Promise) {
    try {
      val resId = reactCtx.resources.getIdentifier("notification_alert", "raw", reactCtx.packageName)
      if (resId != 0) {
        MediaPlayer.create(reactCtx, resId)?.apply {
          isLooping = false
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          setOnCompletionListener { mp ->
            try {
              mp.release()
            } catch (_: Exception) {}
          }
          start()
        }
        promise.resolve(true)
      } else {
        promise.resolve(false)
      }
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }
}
`;
}

function buildOverlayPackageKotlin(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FloatingDispatchOverlayPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(FloatingDispatchOverlayModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

module.exports = function withFloatingDispatchOverlay(config) {
  const pkgName = config?.android?.package || 'com.diagnostic.phleboapp';

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [];
    }

    const existing = new Set(
      manifest['uses-permission']
        .map((item) => item?.$?.['android:name'])
        .filter(Boolean)
    );

    for (const permissionName of REQUIRED_ANDROID_PERMISSIONS) {
      if (!existing.has(permissionName)) {
        manifest['uses-permission'].push({
          $: { 'android:name': permissionName },
        });
        existing.add(permissionName);
      }
    }

    const appList = manifest.application;
    if (Array.isArray(appList) && appList[0]) {
      const appNode = appList[0];
      if (!Array.isArray(appNode.service)) {
        appNode.service = [];
      }
      const serviceName = '.FloatingDispatchOverlayService';
      const hasService = appNode.service.some(
        (svc) => svc?.$?.['android:name'] === serviceName || svc?.$?.['android:name'] === `${pkgName}${serviceName}`
      );
      if (!hasService) {
        appNode.service.push({
          $: {
            'android:name': serviceName,
            'android:enabled': 'true',
            'android:exported': 'false',
            'android:foregroundServiceType': 'specialUse',
          },
          property: [
            {
              $: {
                'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
                'android:value': 'floating_phlebo_dispatch_overlay',
              },
            },
          ],
        });
      }
    }

    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.platformProjectRoot;
      const pkgPath = path.join(projectRoot, 'app', 'src', 'main', 'java', ...pkgName.split('.'));
      fs.mkdirSync(pkgPath, { recursive: true });
      fs.writeFileSync(
        path.join(pkgPath, 'FloatingDispatchOverlayService.kt'),
        buildOverlayServiceKotlin(pkgName),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pkgPath, 'FloatingDispatchOverlayModule.kt'),
        buildOverlayModuleKotlin(pkgName),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pkgPath, 'FloatingDispatchOverlayPackage.kt'),
        buildOverlayPackageKotlin(pkgName),
        'utf8'
      );

      // Copy custom audio alert ringtones to Android raw resources
      const rawResPath = path.join(projectRoot, 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawResPath, { recursive: true });
      const bookingAlertSrc = path.join(__dirname, '..', 'assets', 'sounds', 'booking_alert.wav');
      const notificationAlertSrc = path.join(__dirname, '..', 'assets', 'sounds', 'notification_alert.wav');
      if (fs.existsSync(bookingAlertSrc)) {
        fs.copyFileSync(bookingAlertSrc, path.join(rawResPath, 'booking_alert.wav'));
      }
      if (fs.existsSync(notificationAlertSrc)) {
        fs.copyFileSync(notificationAlertSrc, path.join(rawResPath, 'notification_alert.wav'));
      }

      return mod;
    },
  ]);

  config = withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents || '';
    if (!contents.includes('FloatingDispatchOverlayPackage')) {
      if (contents.includes('PackageList(this).packages.apply {')) {
        contents = contents.replace(
          'PackageList(this).packages.apply {',
          'PackageList(this).packages.apply {\n              add(FloatingDispatchOverlayPackage())'
        );
      } else if (contents.includes('PackageList(this).packages')) {
        contents = contents.replace(
          'PackageList(this).packages',
          'PackageList(this).packages.apply { add(FloatingDispatchOverlayPackage()) }'
        );
      }
      mod.modResults.contents = contents;
    }
    return mod;
  });

  return config;
};

