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

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.CountDownTimer
import android.os.Handler
import android.os.IBinder
import android.os.Looper
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
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.hypot

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

  // Floating Quick Action Menu
  private var quickMenuCard: View? = null
  private var glowRingView: View? = null
  private var innerCircleView: FrameLayout? = null

  // Drag-to-Dismiss Bottom Target
  private var dismissTargetView: FrameLayout? = null
  private var dismissTargetCircle: FrameLayout? = null
  private var isOverDismissTarget = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    activeInstance = this
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
      vm?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    createNotificationChannel()
  }

  private fun triggerHaptic(durationMs: Long = 35L) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(durationMs)
      }
    } catch (_: Exception) {}
  }

  private fun saveBubblePosition(x: Int, y: Int) {
    try {
      val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit().putInt(KEY_BUBBLE_X, x).putInt(KEY_BUBBLE_Y, y).apply()
    } catch (_: Exception) {}
  }

  private fun getSavedPosition(defaultX: Int, defaultY: Int): Pair<Int, Int> {
    return try {
      val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val x = prefs.getInt(KEY_BUBBLE_X, defaultX)
      val y = prefs.getInt(KEY_BUBBLE_Y, defaultY)
      Pair(x, y)
    } catch (_: Exception) {
      Pair(defaultX, defaultY)
    }
  }

  private fun ensureForegroundSafe() {
    try {
      val notification = buildForegroundNotification()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (_: Exception) {}
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        ensureForegroundSafe()
        stopAlertSound()
        detachIncomingModal()
        stopForegroundCompat()
        detachFloatingBubble()
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_DISMISS_INCOMING -> {
        ensureForegroundSafe()
        stopAlertSound()
        detachIncomingModal()
        return START_STICKY
      }
      ACTION_INCOMING_ORDER -> {
        ensureForegroundSafe()
        val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: ""
        val orderNum = intent.getStringExtra(EXTRA_ORDER_NUMBER) ?: orderId
        val pickupLab = intent.getStringExtra(EXTRA_PICKUP_LAB) ?: "Pickup Lab"
        val pickupAddr = intent.getStringExtra(EXTRA_PICKUP_ADDRESS) ?: "Sample Collection Address"
        val targetLab = intent.getStringExtra(EXTRA_TARGET_LAB) ?: "Testing Lab"
        val targetAddr = intent.getStringExtra(EXTRA_TARGET_ADDRESS) ?: ""
        val distance = intent.getStringExtra(EXTRA_DISTANCE) ?: "Nearby"
        val payout = intent.getStringExtra(EXTRA_PAYOUT) ?: "Earn ₹100"
        val specimens = intent.getStringExtra(EXTRA_SPECIMENS) ?: "1 Test • Standard"
        val timeoutSec = intent.getIntExtra(EXTRA_TIMEOUT_SEC, 45)
        val surgeIncentive = intent.getIntExtra(EXTRA_SURGE_INCENTIVE, 0)

        currentIncomingOrderId = orderId
        currentIncomingOrderNumber = orderNum

        showIncomingOrderModal(
          orderId = orderId,
          orderNum = orderNum,
          pickupLab = pickupLab,
          pickupAddr = pickupAddr,
          targetLab = targetLab,
          targetAddr = targetAddr,
          distance = distance,
          payout = payout,
          specimens = specimens,
          timeoutSec = timeoutSec,
          surgeIncentive = surgeIncentive
        )
        return START_STICKY
      }
    }

    currentOnline = intent?.getBooleanExtra(EXTRA_IS_ONLINE, currentOnline) ?: currentOnline
    currentNearbyCount = intent?.getIntExtra(EXTRA_NEARBY_COUNT, currentNearbyCount) ?: currentNearbyCount
    currentCourierId = intent?.getStringExtra(EXTRA_COURIER_ID) ?: currentCourierId

    ensureForegroundSafe()

    if (canDrawOverlaysCompat(this)) {
      if (bubbleContainer == null) {
        attachFloatingBubble()
      } else {
        refreshBubbleAppearance()
      }
    }

    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    if (!currentOnline) {
      stopAlertSound()
      detachIncomingModal()
      hideDismissTarget()
      detachFloatingBubble()
      stopSelf()
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    if (activeInstance === this) {
      activeInstance = null
    }
    stopAlertSound()
    detachIncomingModal()
    hideDismissTarget()
    detachFloatingBubble()
  }

  private fun dp(value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      resources.displayMetrics
    ).toInt()
  }

  private fun dp(value: Double): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      resources.displayMetrics
    ).toInt()
  }

  private fun dp(value: Float): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value,
      resources.displayMetrics
    ).toInt()
  }

  /* =========================================================================
   * 1. Incoming Pickup Floating Modal Card Over Other Apps (Rapido Captain Style)
   * ========================================================================= */
  private fun showIncomingOrderModal(
    orderId: String,
    orderNum: String,
    pickupLab: String,
    pickupAddr: String,
    targetLab: String,
    targetAddr: String,
    distance: String,
    payout: String,
    specimens: String,
    timeoutSec: Int,
    surgeIncentive: Int
  ) {
    detachIncomingModal()
    acquireScreenWakeLock()
    startAlertSound()

    // Real Android High-Priority Heads-Up Drawer Notification with Full-Screen Alert Intent
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra("orderId", orderId)
        putExtra("action", "ACCEPT_ORDER")
      } ?: Intent()
      val launchPendingIntent = PendingIntent.getActivity(
        this,
        9901,
        launchIntent,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
          PendingIntent.FLAG_UPDATE_CURRENT
        }
      )

      val urgentBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, URGENT_CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
      }
      val notifIcon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
      val urgentNotif = urgentBuilder
        .setContentTitle("⚡ NEW SAMPLE PICKUP: " + (if (orderNum.isNotEmpty()) orderNum else orderId))
        .setContentText(pickupLab + " • " + payout + " (" + distance + ")")
        .setSmallIcon(notifIcon)
        .setContentIntent(launchPendingIntent)
        .setFullScreenIntent(launchPendingIntent, true)
        .setAutoCancel(true)
        .setOngoing(false)
        .apply {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            setCategory(Notification.CATEGORY_CALL)
            setPriority(Notification.PRIORITY_MAX)
            setVisibility(Notification.VISIBILITY_PUBLIC)
          }
        }
        .build()
      nm?.notify(URGENT_NOTIF_ID, urgentNotif)
    } catch (_: Exception) {}

    if (!canDrawOverlaysCompat(this)) return

    val wm = windowManager ?: return

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      val pad = dp(16)
      setPadding(pad, pad, pad, pad)
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(24).toFloat()
        setColor(Color.WHITE)
        setStroke(dp(2), Color.parseColor("#0D9488"))
      }
      background = bg
      elevation = dp(28).toFloat()
    }

    // 1. Top Header Row: Pulse pill & Countdown Badge
    val topRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    val liveBadge = TextView(this).apply {
      text = "⚡ NEW PICKUP REQUEST"
      setTextColor(Color.parseColor("#047857"))
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(10), dp(5), dp(10), dp(5))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#F0FDF4"))
        setStroke(dp(1), Color.parseColor("#BBF7D0"))
      }
    }
    topRow.addView(liveBadge)

    val spacerTop = View(this)
    val spacerTopLp = LinearLayout.LayoutParams(0, 1, 1f)
    topRow.addView(spacerTop, spacerTopLp)

    val timerBadge = TextView(this).apply {
      text = "⏱ \${timeoutSec}s"
      setTextColor(Color.parseColor("#B45309"))
      textSize = 13.5f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(10), dp(5), dp(10), dp(5))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#FEF3C7"))
        setStroke(dp(1), Color.parseColor("#FDE68A"))
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
          setColor(Color.parseColor("#FFFBEB"))
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
        text = "⚡ +₹\${surgeIncentive} SURGE HIKE INCLUDED"
        setTextColor(Color.parseColor("#B45309"))
        textSize = 11.5f
        typeface = Typeface.DEFAULT_BOLD
      }
      surgeBanner.addView(surgeText)
      root.addView(surgeBanner, surgeLp)
    }

    // 2. Price Hero Box (Rapido Big Earnings Banner)
    val priceBox = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      val padH = dp(14)
      val padV = dp(10)
      setPadding(padH, padV, padH, padV)
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(14).toFloat()
        setColor(Color.parseColor("#F0FDF4"))
        setStroke(dp(1), Color.parseColor("#99F6E4"))
      }
      background = bg
    }
    val priceBoxLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      topMargin = dp(10)
    }

    val priceRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    val priceText = TextView(this).apply {
      text = payout
      setTextColor(Color.parseColor("#047857"))
      textSize = 22f
      typeface = Typeface.DEFAULT_BOLD
    }
    priceRow.addView(priceText)

    val spacerPrice = View(this)
    val spacerPriceLp = LinearLayout.LayoutParams(0, 1, 1f)
    priceRow.addView(spacerPrice, spacerPriceLp)

    val orderTag = TextView(this).apply {
      text = orderNum
      setTextColor(Color.parseColor("#64748B"))
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
    }
    priceRow.addView(orderTag)
    priceBox.addView(priceRow)

    val payoutSub = TextView(this).apply {
      text = "Guaranteed Courier Earnings • Instant Transfer"
      setTextColor(Color.parseColor("#0D9488"))
      textSize = 11f
      typeface = Typeface.DEFAULT
    }
    priceBox.addView(payoutSub)
    root.addView(priceBox, priceBoxLp)

    // 3. Route Details Container (Pickup -> Drop with Distance & Cold Chain)
    val routeCard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      val pad = dp(12)
      setPadding(pad, pad, pad, pad)
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(16).toFloat()
        setColor(Color.parseColor("#F8FAFC"))
        setStroke(dp(1), Color.parseColor("#E2E8F0"))
      }
      background = bg
    }
    val routeCardLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      topMargin = dp(10)
    }

    // Pickup Point
    val pickupTitleRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val pickupDot = TextView(this).apply {
      text = "● "
      setTextColor(Color.parseColor("#0D9488"))
      textSize = 16f
    }
    val pickupLabView = TextView(this).apply {
      text = pickupLab
      setTextColor(Color.parseColor("#0F172A"))
      textSize = 14.5f
      typeface = Typeface.DEFAULT_BOLD
    }
    pickupTitleRow.addView(pickupDot)
    pickupTitleRow.addView(pickupLabView)
    routeCard.addView(pickupTitleRow)

    val pickupAddressView = TextView(this).apply {
      text = pickupAddr
      setTextColor(Color.parseColor("#475569"))
      textSize = 12f
      setPadding(dp(16), dp(1), 0, dp(2))
    }
    routeCard.addView(pickupAddressView)

    val distanceChip = TextView(this).apply {
      text = "📍 $distance"
      setTextColor(Color.parseColor("#0369A1"))
      textSize = 11.5f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(8), dp(3), dp(8), dp(3))
      val chipBg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(6).toFloat()
        setColor(Color.parseColor("#E0F2FE"))
      }
      background = chipBg
    }
    val distChipLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      marginStart = dp(16)
      topMargin = dp(2)
      bottomMargin = dp(4)
    }
    routeCard.addView(distanceChip, distChipLp)

    // Connecting Vertical Line
    val pathLine = View(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(Color.parseColor("#CBD5E1"))
      }
    }
    val pathLp = LinearLayout.LayoutParams(dp(2), dp(12)).apply {
      marginStart = dp(6)
      topMargin = dp(2)
      bottomMargin = dp(2)
    }
    routeCard.addView(pathLine, pathLp)

    // Drop Point
    val dropTitleRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val dropDot = TextView(this).apply {
      text = "● "
      setTextColor(Color.parseColor("#EF4444"))
      textSize = 16f
    }
    val dropLabView = TextView(this).apply {
      text = "Drop: $targetLab"
      setTextColor(Color.parseColor("#0F172A"))
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
    }
    dropTitleRow.addView(dropDot)
    dropTitleRow.addView(dropLabView)
    routeCard.addView(dropTitleRow)

    if (targetAddr.isNotEmpty()) {
      val dropAddressView = TextView(this).apply {
        text = targetAddr
        setTextColor(Color.parseColor("#475569"))
        textSize = 12f
        setPadding(dp(16), dp(1), 0, dp(2))
      }
      routeCard.addView(dropAddressView)
    }

    val specimensView = TextView(this).apply {
      text = "🧪 $specimens"
      setTextColor(Color.parseColor("#4338CA"))
      textSize = 11.5f
      setPadding(dp(16), dp(2), 0, 0)
    }
    routeCard.addView(specimensView)
    root.addView(routeCard, routeCardLp)

    // 4. Action Buttons: ✕ Reject & ⚡ ACCEPT PICKUP (Rapido style)
    val actionRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      val lp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(14)
      }
      layoutParams = lp
    }

    val declineBtn = TextView(this).apply {
      text = "✕ Reject"
      setTextColor(Color.parseColor("#DC2626"))
      textSize = 14.5f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(14).toFloat()
        setColor(Color.parseColor("#FEE2E2"))
        setStroke(dp(1), Color.parseColor("#FCA5A5"))
      }
      background = bg
      setPadding(0, dp(14), 0, dp(14))
      isClickable = true
      isFocusable = true
      setOnClickListener {
        handleIncomingOrderAction("DECLINE", orderId, orderNum)
      }
    }
    val declineLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginEnd = dp(10)
    }
    actionRow.addView(declineBtn, declineLp)

    val acceptBtn = TextView(this).apply {
      text = "⚡ ACCEPT PICKUP"
      setTextColor(Color.WHITE)
      textSize = 15.5f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      val bg = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(14).toFloat()
        setColor(Color.parseColor("#0D9488"))
      }
      background = bg
      setPadding(0, dp(14), 0, dp(14))
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
        timerBadge.text = "⏱ \${remSec}s"
        try {
          if (ringtone?.isPlaying == false) {
            ringtone?.play()
          }
        } catch (_: Exception) {}
      }

      override fun onFinish() {
        stopAlertSound()
        detachIncomingModal()
        pendingActionType = "EXPIRED"
        pendingActionOrderId = orderId
        actionListener?.invoke("EXPIRED", orderId)
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
    val modal = incomingModalView
    if (modal != null) {
      try {
        windowManager?.removeView(modal)
      } catch (_: Exception) {}
      incomingModalView = null
    }
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      nm?.cancel(URGENT_NOTIF_ID)
    } catch (_: Exception) {}
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
    } catch (_: Exception) {}

    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
      wakeLock = null
    } catch (_: Exception) {}

    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      nm?.cancel(URGENT_NOTIF_ID)
    } catch (_: Exception) {}
  }

  /* =========================================================================
   * 2. Drag-to-Dismiss Target & Persistent Floating Duty Bubble
   * ========================================================================= */
  private fun showDismissTarget() {
    if (dismissTargetView != null) return
    val wm = windowManager ?: return

    val targetContainer = FrameLayout(this)
    val targetSizePx = dp(64)

    val circle = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#E11D48")) // Vibrant Red/Crimson
        setStroke(dp(2), Color.WHITE)
      }
      elevation = dp(16).toFloat()
    }
    dismissTargetCircle = circle

    val crossText = TextView(this).apply {
      text = "✕"
      setTextColor(Color.WHITE)
      textSize = 22f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    val crossLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      gravity = Gravity.CENTER
    }
    circle.addView(crossText, crossLp)

    val circleLp = FrameLayout.LayoutParams(targetSizePx, targetSizePx).apply {
      gravity = Gravity.CENTER
    }
    targetContainer.addView(circle, circleLp)

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val displayMetrics = resources.displayMetrics
    val screenWidth = displayMetrics.widthPixels
    val screenHeight = displayMetrics.heightPixels

    val boxWidth = dp(120)
    val boxHeight = dp(90)
    val targetX = (screenWidth - boxWidth) / 2
    val targetY = screenHeight - boxHeight - dp(28)

    val targetLp = WindowManager.LayoutParams(
      boxWidth,
      boxHeight,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = targetX
      y = targetY
    }

    try {
      wm.addView(targetContainer, targetLp)
      dismissTargetView = targetContainer
      isOverDismissTarget = false
    } catch (_: Exception) {}
  }

  private fun updateDismissTargetState(isOver: Boolean) {
    if (isOver == isOverDismissTarget) return
    isOverDismissTarget = isOver
    val circle = dismissTargetCircle ?: return
    if (isOver) {
      circle.background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#991B1B")) // Deep Crimson active
        setStroke(dp(3), Color.WHITE)
      }
      circle.scaleX = 1.25f
      circle.scaleY = 1.25f
      triggerHaptic(40L)
    } else {
      circle.background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#E11D48"))
        setStroke(dp(2), Color.WHITE)
      }
      circle.scaleX = 1.0f
      circle.scaleY = 1.0f
    }
  }

  private fun hideDismissTarget() {
    val target = dismissTargetView ?: return
    try {
      windowManager?.removeView(target)
    } catch (_: Exception) {}
    dismissTargetView = null
    dismissTargetCircle = null
    isOverDismissTarget = false
  }

  private fun snapBubbleToEdge(currentX: Int, currentY: Int) {
    val container = bubbleContainer ?: return
    val params = layoutParams ?: return
    val orbSizePx = dp(68)
    val screenWidth = resources.displayMetrics.widthPixels
    val screenHeight = resources.displayMetrics.heightPixels

    val targetX = if (currentX + orbSizePx / 2 < screenWidth / 2) {
      dp(12)
    } else {
      screenWidth - orbSizePx - dp(12)
    }

    val minY = dp(50)
    val maxY = screenHeight - orbSizePx - dp(75)
    val targetY = currentY.coerceIn(minY, maxY)
    params.y = targetY

    val animator = ValueAnimator.ofInt(currentX, targetX).apply {
      duration = 200L
      interpolator = DecelerateInterpolator()
      addUpdateListener { va ->
        params.x = va.animatedValue as Int
        try {
          windowManager?.updateViewLayout(container, params)
        } catch (_: Exception) {}
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          saveBubblePosition(targetX, targetY)
        }
      })
    }
    animator.start()
  }

  private fun attachFloatingBubble() {
    if (bubbleContainer != null) return
    val wm = windowManager ?: return
    val orbSizePx = dp(68)
    val circleSizePx = dp(56)

    val container = FrameLayout(this)

    // 1. Outer Translucent Glow Ring matching Screenshot 2 design
    val glow = View(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        val glowColor = if (currentNearbyCount > 0) {
          Color.parseColor("#33F59E0B")
        } else if (currentOnline) {
          Color.parseColor("#330D9488")
        } else {
          Color.parseColor("#3394A3B8")
        }
        setColor(glowColor)
      }
    }
    val glowLp = FrameLayout.LayoutParams(orbSizePx, orbSizePx).apply {
      gravity = Gravity.CENTER
    }
    container.addView(glow, glowLp)
    glowRingView = glow

    // 2. Inner Circular Card with Teal / Amber / Slate Border & Elevation
    val circle = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.WHITE)
        val strokeColor = if (currentNearbyCount > 0) {
          Color.parseColor("#F59E0B")
        } else if (currentOnline) {
          Color.parseColor("#0D9488")
        } else {
          Color.parseColor("#94A3B8")
        }
        setStroke(dp(3), strokeColor)
      }
      clipToOutline = true
      elevation = dp(12).toFloat()
    }
    innerCircleView = circle

    // 3. Center Application Logo / Splash Brand Mark (NO TEXT)
    val appLogoView = ImageView(this).apply {
      scaleType = ImageView.ScaleType.FIT_CENTER
      val pad = dp(6)
      setPadding(pad, pad, pad, pad)
      val bikeResId = resources.getIdentifier("phlebo_courier_bike", "drawable", packageName)
      if (bikeResId != 0) {
        setImageResource(bikeResId)
      } else {
        val resId = resources.getIdentifier("phlebo_bubble_logo", "drawable", packageName)
        if (resId != 0) {
          setImageResource(resId)
        } else {
          val vectorResId = resources.getIdentifier("ic_labsetu_logo", "drawable", packageName)
          if (vectorResId != 0) {
            setImageResource(vectorResId)
          } else {
            try {
              val appIconDrawable = packageManager.getApplicationIcon(packageName)
              setImageDrawable(appIconDrawable)
            } catch (_: Exception) {
              setImageResource(android.R.drawable.sym_def_app_icon)
            }
          }
        }
      }
    }
    val logoLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    ).apply {
      gravity = Gravity.CENTER
    }
    circle.addView(appLogoView, logoLp)

    val circleLp = FrameLayout.LayoutParams(circleSizePx, circleSizePx).apply {
      gravity = Gravity.CENTER
    }
    container.addView(circle, circleLp)

    // 4. Online Status Dot at Bottom-Left
    val dot = View(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        val dotColor = if (currentNearbyCount > 0) {
          Color.parseColor("#F59E0B")
        } else if (currentOnline) {
          Color.parseColor("#10B981")
        } else {
          Color.parseColor("#94A3B8")
        }
        setColor(dotColor)
        setStroke(dp(2), Color.WHITE)
      }
    }
    val dotSize = dp(14)
    val dotLp = FrameLayout.LayoutParams(dotSize, dotSize).apply {
      gravity = Gravity.BOTTOM or Gravity.START
      marginStart = dp(5)
      bottomMargin = dp(5)
    }
    container.addView(dot, dotLp)
    statusDotView = dot

    // 5. Badge for Nearby Sample Pickups at Top-Right
    val badge = TextView(this).apply {
      text = if (currentNearbyCount > 9) "9+" else currentNearbyCount.toString()
      setTextColor(Color.WHITE)
      textSize = 10f
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
      marginEnd = dp(4)
      topMargin = dp(4)
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
    val screenWidth = displayMetrics.widthPixels
    val screenHeight = displayMetrics.heightPixels

    val defaultX = screenWidth - orbSizePx - dp(12)
    val defaultY = (screenHeight * 0.45).toInt()
    val (savedX, savedY) = getSavedPosition(defaultX, defaultY)

    val initialX = savedX.coerceIn(dp(10), screenWidth - orbSizePx - dp(10))
    val initialY = savedY.coerceIn(dp(50), screenHeight - orbSizePx - dp(75))

    val params = WindowManager.LayoutParams(
      orbSizePx + dp(8),
      orbSizePx + dp(8),
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
      private var isDragging = false

      override fun onTouch(v: View?, event: MotionEvent): Boolean {
        when (event.action) {
          MotionEvent.ACTION_DOWN -> {
            initialTouchX = event.rawX
            initialTouchY = event.rawY
            initialWindowX = params.x
            initialWindowY = params.y
            touchStartTime = System.currentTimeMillis()
            isDragging = false
            return true
          }
          MotionEvent.ACTION_MOVE -> {
            val dx = event.rawX - initialTouchX
            val dy = event.rawY - initialTouchY
            val moved = hypot(dx.toDouble(), dy.toDouble())

            if (moved > dp(8)) {
              if (!isDragging) {
                isDragging = true
                showDismissTarget()
                if (quickMenuCard != null) {
                  detachQuickActionMenu()
                }
              }
            }

            if (isDragging) {
              val screenH = resources.displayMetrics.heightPixels
              val screenW = resources.displayMetrics.widthPixels
              val newX = initialWindowX + dx.toInt()
              val newY = (initialWindowY + dy.toInt()).coerceIn(dp(40), screenH - orbSizePx - dp(40))

              params.x = newX
              params.y = newY
              try {
                windowManager?.updateViewLayout(container, params)
              } catch (_: Exception) {}

              // Check if hovering over bottom dismiss target
              val bubbleCenterX = params.x + orbSizePx / 2
              val bubbleCenterY = params.y + orbSizePx / 2
              val targetCenterX = screenW / 2
              val targetCenterY = screenH - dp(28) - dp(40)

              val distToTarget = hypot(
                (bubbleCenterX - targetCenterX).toDouble(),
                (bubbleCenterY - targetCenterY).toDouble()
              )

              val isOver = distToTarget < dp(75) || (bubbleCenterY > screenH - dp(115) && abs(bubbleCenterX - targetCenterX) < dp(70))
              updateDismissTargetState(isOver)
            }
            return true
          }
          MotionEvent.ACTION_UP -> {
            val moved = hypot(
              (event.rawX - initialTouchX).toDouble(),
              (event.rawY - initialTouchY).toDouble()
            )
            val duration = System.currentTimeMillis() - touchStartTime

            val wasOver = isOverDismissTarget
            hideDismissTarget()

            if (isDragging && wasOver) {
              triggerHaptic(50L)
              detachFloatingBubble()
              dutyChangeListener?.invoke("OFFLINE")
              return true
            }

            if (isDragging) {
              snapBubbleToEdge(params.x, params.y)
            } else if (moved < dp(8) && duration < 350) {
              toggleQuickActionMenu(params.x, params.y, orbSizePx)
            }
            isDragging = false
            return true
          }
        }
        return false
      }
    })

    try {
      wm.addView(container, params)
      bubbleContainer = container
      layoutParams = params
    } catch (_: Exception) {}
  }

  private fun refreshBubbleAppearance() {
    val dot = statusDotView
    if (dot != null) {
      val dotDrawable = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        val dotColor = if (currentNearbyCount > 0) {
          Color.parseColor("#F59E0B")
        } else if (currentOnline) {
          Color.parseColor("#10B981")
        } else {
          Color.parseColor("#94A3B8")
        }
        setColor(dotColor)
        setStroke(dp(2), Color.WHITE)
      }
      dot.background = dotDrawable
    }

    innerCircleView?.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.WHITE)
      val strokeColor = if (currentNearbyCount > 0) {
        Color.parseColor("#F59E0B")
      } else if (currentOnline) {
        Color.parseColor("#0D9488")
      } else {
        Color.parseColor("#94A3B8")
      }
      setStroke(dp(3), strokeColor)
    }

    glowRingView?.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      val glowColor = if (currentNearbyCount > 0) {
        Color.parseColor("#33F59E0B")
      } else if (currentOnline) {
        Color.parseColor("#330D9488")
      } else {
        Color.parseColor("#3394A3B8")
      }
      setColor(glowColor)
    }

    badgeView?.apply {
      text = if (currentNearbyCount > 9) "9+" else currentNearbyCount.toString()
      visibility = if (currentNearbyCount > 0) View.VISIBLE else View.GONE
    }
  }

  /* =========================================================================
   * 3. Floating Quick Action Card: High-End Executive Radar Modal
   * ========================================================================= */
  private fun toggleQuickActionMenu(anchorX: Int, anchorY: Int, bubbleSizePx: Int) {
    if (quickMenuCard != null) {
      detachQuickActionMenu()
    } else {
      showQuickActionMenu(anchorX, anchorY, bubbleSizePx)
    }
  }

  private fun launchAppWithAction(actionType: String, deepLinkUri: String) {
    detachQuickActionMenu()
    try {
      val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra("ACTION", actionType)
        data = Uri.parse(deepLinkUri)
      }
      if (launchIntent != null) {
        startActivity(launchIntent)
      }
    } catch (_: Exception) {}
  }

  private fun showQuickActionMenu(anchorX: Int, anchorY: Int, bubbleSizePx: Int) {
    val wm = windowManager ?: return
    detachQuickActionMenu()

    val displayMetrics = resources.displayMetrics
    val screenWidth = displayMetrics.widthPixels
    val screenHeight = displayMetrics.heightPixels

    val cardWidth = dp(320).coerceAtMost(screenWidth - dp(32))
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      val p = dp(14)
      setPadding(p, p, p, p)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(22).toFloat()
        setColor(Color.WHITE)
        setStroke(dp(2), Color.parseColor("#0D9488"))
      }
      elevation = dp(24).toFloat()
    }

    // 1. Executive Dark Navy Header Banner
    val headerCard = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      val hPad = dp(10)
      setPadding(hPad, hPad, hPad, hPad)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(14).toFloat()
        setColor(Color.parseColor("#0A2A5E"))
      }
    }

    val appIconCard = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.WHITE)
      }
      clipToOutline = true
    }
    val headerAppLogo = ImageView(this).apply {
      scaleType = ImageView.ScaleType.FIT_CENTER
      val p = dp(3)
      setPadding(p, p, p, p)
      val bikeResId = resources.getIdentifier("phlebo_courier_bike", "drawable", packageName)
      if (bikeResId != 0) {
        setImageResource(bikeResId)
      } else {
        val resId = resources.getIdentifier("phlebo_bubble_logo", "drawable", packageName)
        if (resId != 0) {
          setImageResource(resId)
        } else {
          val vectorResId = resources.getIdentifier("ic_labsetu_logo", "drawable", packageName)
          if (vectorResId != 0) {
            setImageResource(vectorResId)
          } else {
            try {
              setImageDrawable(packageManager.getApplicationIcon(packageName))
            } catch (_: Exception) {}
          }
        }
      }
    }
    appIconCard.addView(
      headerAppLogo,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    )
    headerCard.addView(appIconCard, LinearLayout.LayoutParams(dp(34), dp(34)))

    val headerTitleCol = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(10), 0, 0, 0)
    }
    val headerTitle = TextView(this).apply {
      text = "LabSetu Partner Radar"
      setTextColor(Color.WHITE)
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
    }
    val headerSubtitle = TextView(this).apply {
      text = if (currentOnline) "● On Duty • Live Radar Active" else "⚪ Off Duty • Standby Mode"
      setTextColor(if (currentOnline) Color.parseColor("#34D399") else Color.parseColor("#94A3B8"))
      textSize = 10.5f
      typeface = Typeface.DEFAULT_BOLD
    }
    headerTitleCol.addView(headerTitle)
    headerTitleCol.addView(headerSubtitle)
    headerCard.addView(
      headerTitleCol,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    )

    val closeBtn = TextView(this).apply {
      text = "✕"
      setTextColor(Color.WHITE)
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#1E3A8A"))
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        detachQuickActionMenu()
      }
    }
    headerCard.addView(closeBtn, LinearLayout.LayoutParams(dp(26), dp(26)))
    root.addView(headerCard)

    // 2. Duty Status Switcher (3-Way Pills)
    val dutyRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      val rowLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(10)
        bottomMargin = dp(8)
      }
      layoutParams = rowLp
    }

    // Online Pill
    val btnOnline = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(0, dp(7), 0, dp(7))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(10).toFloat()
        setColor(if (currentOnline) Color.parseColor("#DCFCE7") else Color.parseColor("#F8FAFC"))
        setStroke(
          dp(if (currentOnline) 2 else 1),
          if (currentOnline) Color.parseColor("#16A34A") else Color.parseColor("#E2E8F0")
        )
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        currentOnline = true
        refreshBubbleAppearance()
        dutyChangeListener?.invoke("ONLINE")
        detachQuickActionMenu()
        triggerHaptic(30L)
      }
    }
    val txtOnline = TextView(this).apply {
      text = "🟢 Online"
      textSize = 11f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(if (currentOnline) Color.parseColor("#15803D") else Color.parseColor("#64748B"))
      gravity = Gravity.CENTER
    }
    btnOnline.addView(txtOnline)
    dutyRow.addView(
      btnOnline,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginEnd = dp(4)
      }
    )

    // Break Pill
    val btnBreak = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(0, dp(7), 0, dp(7))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(10).toFloat()
        setColor(Color.parseColor("#F8FAFC"))
        setStroke(dp(1), Color.parseColor("#E2E8F0"))
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        currentOnline = false
        refreshBubbleAppearance()
        dutyChangeListener?.invoke("BREAK")
        detachQuickActionMenu()
        triggerHaptic(30L)
      }
    }
    val txtBreak = TextView(this).apply {
      text = "☕ Break"
      textSize = 11f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(Color.parseColor("#64748B"))
      gravity = Gravity.CENTER
    }
    btnBreak.addView(txtBreak)
    dutyRow.addView(
      btnBreak,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginStart = dp(2)
        marginEnd = dp(2)
      }
    )

    // Offline Pill
    val btnOffline = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(0, dp(7), 0, dp(7))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(10).toFloat()
        setColor(if (!currentOnline) Color.parseColor("#FEE2E2") else Color.parseColor("#F8FAFC"))
        setStroke(
          dp(if (!currentOnline) 2 else 1),
          if (!currentOnline) Color.parseColor("#DC2626") else Color.parseColor("#E2E8F0")
        )
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        currentOnline = false
        refreshBubbleAppearance()
        dutyChangeListener?.invoke("OFFLINE")
        detachQuickActionMenu()
        triggerHaptic(30L)
      }
    }
    val txtOffline = TextView(this).apply {
      text = "🔴 Offline"
      textSize = 11f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(if (!currentOnline) Color.parseColor("#B91C1C") else Color.parseColor("#64748B"))
      gravity = Gravity.CENTER
    }
    btnOffline.addView(txtOffline)
    dutyRow.addView(
      btnOffline,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginStart = dp(4)
      }
    )
    root.addView(dutyRow)

    // Scrollable Quick Actions Container
    val scroll = ScrollView(this).apply {
      isFillViewport = true
      overScrollMode = View.OVER_SCROLL_NEVER
    }
    val actionList = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
    }

    // Tile 1: Today's Assignments
    val todayCard = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      val p = dp(8)
      setPadding(p, p, p, p)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(12).toFloat()
        setColor(Color.parseColor("#F0FDFA"))
        setStroke(dp(1.2), Color.parseColor("#99F6E4"))
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        launchAppWithAction("OPEN_COLLECTIONS", "labsetu-phlebo://open-collections")
      }
    }
    val todayIconBox = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#CCFBF1"))
      }
    }
    val todayIconText = TextView(this).apply {
      text = "📦"
      textSize = 16f
      gravity = Gravity.CENTER
    }
    todayIconBox.addView(
      todayIconText,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    )
    todayCard.addView(todayIconBox, LinearLayout.LayoutParams(dp(34), dp(34)))

    val todayCol = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), 0, dp(4), 0)
    }
    val todayTitle = TextView(this).apply {
      text = "Today's Assignments"
      setTextColor(Color.parseColor("#0F766E"))
      textSize = 12.5f
      typeface = Typeface.DEFAULT_BOLD
    }
    val todaySub = TextView(this).apply {
      text = "Active sample pickups & assigned tasks"
      setTextColor(Color.parseColor("#475569"))
      textSize = 10f
    }
    todayCol.addView(todayTitle)
    todayCol.addView(todaySub)
    todayCard.addView(
      todayCol,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    )

    val todayArrow = TextView(this).apply {
      text = "Open ➔"
      setTextColor(Color.parseColor("#0D9488"))
      textSize = 10.5f
      typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(6).toFloat()
        setColor(Color.parseColor("#E6F7F5"))
      }
      val ap = dp(5)
      setPadding(ap, dp(2), ap, dp(2))
    }
    todayCard.addView(todayArrow)
    actionList.addView(
      todayCard,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(6)
      }
    )

    // Tile 2: Pending Collections (1–5 km Pickup Pool)
    val radarCard = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      val p = dp(8)
      setPadding(p, p, p, p)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(12).toFloat()
        setColor(Color.parseColor("#FFFBEB"))
        setStroke(dp(1.2), Color.parseColor("#FDE68A"))
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        launchAppWithAction("OPEN_REQUESTS", "labsetu-phlebo://open-requests")
      }
    }
    val radarIconBox = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#FEF3C7"))
      }
    }
    val radarIconText = TextView(this).apply {
      text = "⚡"
      textSize = 16f
      gravity = Gravity.CENTER
    }
    radarIconBox.addView(
      radarIconText,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    )
    radarCard.addView(radarIconBox, LinearLayout.LayoutParams(dp(34), dp(34)))

    val radarCol = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), 0, dp(4), 0)
    }
    val radarTitle = TextView(this).apply {
      text = "Pending Collections"
      setTextColor(Color.parseColor("#B45309"))
      textSize = 12.5f
      typeface = Typeface.DEFAULT_BOLD
    }
    val radarSub = TextView(this).apply {
      text = if (currentNearbyCount > 0) "$currentNearbyCount pending task\${if (currentNearbyCount > 1) \"s\" else \"\"}" else "1–5 km radar active nearby"
      setTextColor(Color.parseColor("#475569"))
      textSize = 10f
    }
    radarCol.addView(radarTitle)
    radarCol.addView(radarSub)
    radarCard.addView(
      radarCol,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    )

    val radarBadge = TextView(this).apply {
      text = if (currentNearbyCount > 0) "$currentNearbyCount Pending" else "Radar ➔"
      setTextColor(if (currentNearbyCount > 0) Color.WHITE else Color.parseColor("#D97706"))
      textSize = 10.5f
      typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(6).toFloat()
        setColor(if (currentNearbyCount > 0) Color.parseColor("#EF4444") else Color.parseColor("#FEF3C7"))
      }
      val ap = dp(5)
      setPadding(ap, dp(2), ap, dp(2))
    }
    radarCard.addView(radarBadge)
    actionList.addView(
      radarCard,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(6)
      }
    )

    // Tile 3: Collection History
    val historyCard = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      val p = dp(8)
      setPadding(p, p, p, p)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(12).toFloat()
        setColor(Color.parseColor("#F8FAFC"))
        setStroke(dp(1.2), Color.parseColor("#E2E8F0"))
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        launchAppWithAction("OPEN_HISTORY", "labsetu-phlebo://open-history")
      }
    }
    val historyIconBox = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#F1F5F9"))
      }
    }
    val historyIconText = TextView(this).apply {
      text = "📜"
      textSize = 16f
      gravity = Gravity.CENTER
    }
    historyIconBox.addView(
      historyIconText,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    )
    historyCard.addView(historyIconBox, LinearLayout.LayoutParams(dp(34), dp(34)))

    val historyCol = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), 0, dp(4), 0)
    }
    val historyTitle = TextView(this).apply {
      text = "Collection History"
      setTextColor(Color.parseColor("#1E293B"))
      textSize = 12.5f
      typeface = Typeface.DEFAULT_BOLD
    }
    val historySub = TextView(this).apply {
      text = "Past trips, sample logs & payouts"
      setTextColor(Color.parseColor("#475569"))
      textSize = 10f
    }
    historyCol.addView(historyTitle)
    historyCol.addView(historySub)
    historyCard.addView(
      historyCol,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    )
    val historyArrow = TextView(this).apply {
      text = "View ➔"
      setTextColor(Color.parseColor("#475569"))
      textSize = 10.5f
      typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(6).toFloat()
        setColor(Color.parseColor("#E2E8F0"))
      }
      val ap = dp(5)
      setPadding(ap, dp(2), ap, dp(2))
    }
    historyCard.addView(historyArrow)
    actionList.addView(
      historyCard,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(6)
      }
    )

    // Tile 4: Partner Support & SOPs
    val supportCard = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      val p = dp(8)
      setPadding(p, p, p, p)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(12).toFloat()
        setColor(Color.parseColor("#EFF6FF"))
        setStroke(dp(1.2), Color.parseColor("#BFDBFE"))
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        launchAppWithAction("OPEN_SUPPORT", "labsetu-phlebo://open-support")
      }
    }
    val supportIconBox = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(8).toFloat()
        setColor(Color.parseColor("#DBEAFE"))
      }
    }
    val supportIconText = TextView(this).apply {
      text = "📞"
      textSize = 16f
      gravity = Gravity.CENTER
    }
    supportIconBox.addView(
      supportIconText,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    )
    supportCard.addView(supportIconBox, LinearLayout.LayoutParams(dp(34), dp(34)))

    val supportCol = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), 0, dp(4), 0)
    }
    val supportTitle = TextView(this).apply {
      text = "Partner Support"
      setTextColor(Color.parseColor("#1E40AF"))
      textSize = 12.5f
      typeface = Typeface.DEFAULT_BOLD
    }
    val supportSub = TextView(this).apply {
      text = "Direct dispatch helpline & SOP guides"
      setTextColor(Color.parseColor("#475569"))
      textSize = 10f
    }
    supportCol.addView(supportTitle)
    supportCol.addView(supportSub)
    supportCard.addView(
      supportCol,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    )
    val supportArrow = TextView(this).apply {
      text = "Help ➔"
      setTextColor(Color.parseColor("#2563EB"))
      textSize = 10.5f
      typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(6).toFloat()
        setColor(Color.parseColor("#DBEAFE"))
      }
      val ap = dp(5)
      setPadding(ap, dp(2), ap, dp(2))
    }
    supportCard.addView(supportArrow)
    actionList.addView(
      supportCard,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(8)
      }
    )

    scroll.addView(actionList)
    val scrollLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      0,
      1f
    )
    root.addView(scroll, scrollLp)

    // 5. Full Width Primary Launch App Button
    val openAppBtn = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      val p = dp(10)
      setPadding(p, p, p, p)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(12).toFloat()
        setColor(Color.parseColor("#0A2A5E"))
      }
      isClickable = true
      isFocusable = true
      setOnClickListener {
        launchAppWithAction("OPEN_HOME", "labsetu-phlebo://open-home")
      }
    }
    val openAppText = TextView(this).apply {
      text = "🚀 Open LabSetu Partner App"
      setTextColor(Color.WHITE)
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    openAppBtn.addView(openAppText)
    root.addView(
      openAppBtn,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(4)
        bottomMargin = dp(4)
      }
    )

    // 6. Footer Status
    val footerText = TextView(this).apply {
      text = "📍 GPS Active • System-Level Overlay Ready"
      setTextColor(Color.parseColor("#94A3B8"))
      textSize = 10f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, dp(2), 0, 0)
    }
    root.addView(footerText)

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val maxCardH = (screenHeight - dp(140)).coerceAtLeast(dp(260))
    val menuX = ((screenWidth - cardWidth) / 2)
    val menuY = (anchorY - dp(80)).coerceIn(dp(50), screenHeight - maxCardH - dp(30))

    val lp = WindowManager.LayoutParams(
      cardWidth,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = menuX
      y = menuY
    }

    root.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_OUTSIDE) {
        detachQuickActionMenu()
        true
      } else {
        false
      }
    }

    try {
      wm.addView(root, lp)
      quickMenuCard = root
    } catch (_: Exception) {}
  }

  private fun detachQuickActionMenu() {
    val card = quickMenuCard ?: return
    try {
      windowManager?.removeView(card)
    } catch (_: Exception) {}
    quickMenuCard = null
  }

  private fun detachFloatingBubble() {
    detachQuickActionMenu()
    hideDismissTarget()
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
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

      val dutyChannel = NotificationChannel(
        CHANNEL_ID,
        "LabSetu Dispatch Overlay",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Background service for LabSetu sample dispatch overlay."
        setShowBadge(false)
        enableVibration(false)
        setSound(null, null)
      }
      nm.createNotificationChannel(dutyChannel)

      val urgentChannel = NotificationChannel(
        URGENT_CHANNEL_ID,
        "LabSetu Urgent Sample Pickup Broadcasts",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Heads-up alert notifications for incoming sample pickup broadcasts."
        setShowBadge(true)
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 800, 300, 800, 300, 800)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        enableLights(true)
        lightColor = Color.parseColor("#10B981")
      }
      nm.createNotificationChannel(urgentChannel)
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

    val title = "LabSetu Field Dispatch"
    val text = if (currentOnline) "On Duty • Dispatch Service Active" else "Off Duty • Standby"

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
    const val PREFS_NAME = "labsetu_floating_dispatch_prefs"
    const val KEY_BUBBLE_X = "bubble_x"
    const val KEY_BUBBLE_Y = "bubble_y"

    const val CHANNEL_ID = "labsetu_dispatch_overlay_channel"
    const val URGENT_CHANNEL_ID = "labsetu-urgent-pickups"
    const val NOTIF_ID = 918237
    const val URGENT_NOTIF_ID = 918238

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
    const val EXTRA_TARGET_ADDRESS = "targetAddress"
    const val EXTRA_DISTANCE = "distance"
    const val EXTRA_PAYOUT = "payout"
    const val EXTRA_SPECIMENS = "specimens"
    const val EXTRA_TIMEOUT_SEC = "timeoutSec"
    const val EXTRA_SURGE_INCENTIVE = "surgeIncentive"

    var activeInstance: FloatingDispatchOverlayService? = null
    var pendingActionType: String? = null
    var pendingActionOrderId: String? = null
    var actionListener: ((action: String, orderId: String) -> Unit)? = null
    var dutyChangeListener: ((newDuty: String) -> Unit)? = null

    fun dismissActiveIncoming() {
      Handler(Looper.getMainLooper()).post {
        try {
          activeInstance?.stopAlertSound()
          activeInstance?.detachIncomingModal()
        } catch (_: Exception) {}
      }
    }

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
import android.media.RingtoneManager
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

    FloatingDispatchOverlayService.dutyChangeListener = { newDuty ->
      try {
        val map = Arguments.createMap().apply {
          putString("dutyStatus", newDuty)
        }
        reactCtx
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("onOverlayDutyChange", map)
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
  fun openAppDetailsSettings(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.parse("package:" + reactCtx.packageName)
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactCtx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("APP_DETAILS_ERR", e.message, e)
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
        putExtra(FloatingDispatchOverlayService.EXTRA_TARGET_ADDRESS, orderData?.getString("targetAddress") ?: "")
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
      FloatingDispatchOverlayService.dismissActiveIncoming()
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
        val alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        nativeBookingPlayer = MediaPlayer.create(reactCtx, alertUri)?.apply {
          isLooping = true
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          start()
        }
        promise.resolve(nativeBookingPlayer != null)
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
        val notifUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val player = MediaPlayer.create(reactCtx, notifUri)?.apply {
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
        promise.resolve(player != null)
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

      // Copy brand logo to Android drawable resources for native FloatingDispatchOverlayService
      const drawableResPath = path.join(projectRoot, 'app', 'src', 'main', 'res', 'drawable');
      fs.mkdirSync(drawableResPath, { recursive: true });
      const logoSrc = path.join(__dirname, '..', 'assets', 'icon.png');
      if (fs.existsSync(logoSrc)) {
        fs.copyFileSync(logoSrc, path.join(drawableResPath, 'phlebo_bubble_logo.png'));
      }
      const vectorLogoSrc = path.join(__dirname, '..', 'assets', 'ic_labsetu_logo.xml');
      if (fs.existsSync(vectorLogoSrc)) {
        fs.copyFileSync(vectorLogoSrc, path.join(drawableResPath, 'ic_labsetu_logo.xml'));
      }
      const phleboBikeSrc = path.join(__dirname, '..', 'assets', 'phlebo_courier_bike.xml');
      if (fs.existsSync(phleboBikeSrc)) {
        fs.copyFileSync(phleboBikeSrc, path.join(drawableResPath, 'phlebo_courier_bike.xml'));
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

