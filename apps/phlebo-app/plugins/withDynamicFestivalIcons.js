const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

const FESTIVAL_ALIASES = [
  {
    key: 'default',
    aliasName: 'LauncherDefault',
    resName: 'ic_launcher_festival_default',
    sourceRel: '../../packages/shared/assets/brand/icons/default/labsetu-icon-only.png',
    defaultEnabled: true,
  },
  {
    key: 'diwali',
    aliasName: 'LauncherDiwali',
    resName: 'ic_launcher_festival_diwali',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/diwali/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'holi',
    aliasName: 'LauncherHoli',
    resName: 'ic_launcher_festival_holi',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/holi/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'christmas',
    aliasName: 'LauncherChristmas',
    resName: 'ic_launcher_festival_christmas',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/christmas/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'new-year',
    aliasName: 'LauncherNewYear',
    resName: 'ic_launcher_festival_new_year',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/new-year/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'eid',
    aliasName: 'LauncherEid',
    resName: 'ic_launcher_festival_eid',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/eid/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'independence-day',
    aliasName: 'LauncherIndependenceDay',
    resName: 'ic_launcher_festival_independence_day',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/independence-day/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'republic-day',
    aliasName: 'LauncherRepublicDay',
    resName: 'ic_launcher_festival_republic_day',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/republic-day/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'raksha-bandhan',
    aliasName: 'LauncherRakshaBandhan',
    resName: 'ic_launcher_festival_raksha_bandhan',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/raksha-bandhan/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'navratri',
    aliasName: 'LauncherNavratri',
    resName: 'ic_launcher_festival_navratri',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/navratri/android-adaptive.png',
    defaultEnabled: false,
  },
  {
    key: 'dussehra',
    aliasName: 'LauncherDussehra',
    resName: 'ic_launcher_festival_dussehra',
    sourceRel: '../../packages/shared/assets/brand/icons/festivals/dussehra/android-adaptive.png',
    defaultEnabled: false,
  },
];

function buildDynamicLauncherModuleKotlin(packageName) {
  const mapEntries = FESTIVAL_ALIASES.map(
    (a) => `    "${a.key}" to "${packageName}.${a.aliasName}"`
  ).join(',\n');

  return `package ${packageName}

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DynamicLauncherIconModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val aliasMap: Map<String, String> = mapOf(
${mapEntries}
  )

  override fun getName(): String = "DynamicLauncherIcon"

  @ReactMethod
  fun getActiveLauncherIconKey(promise: Promise) {
    try {
      val pm = reactApplicationContext.packageManager
      for ((key, className) in aliasMap) {
        val component = ComponentName(reactApplicationContext.packageName, className)
        val state = pm.getComponentEnabledSetting(component)
        if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
          promise.resolve(key)
          return
        }
      }
      promise.resolve("default")
    } catch (e: Exception) {
      promise.reject("ICON_READ_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setLauncherIconKey(requestedKey: String, promise: Promise) {
    try {
      val targetKey = if (aliasMap.containsKey(requestedKey)) requestedKey else "default"
      val targetClass = aliasMap[targetKey]!!
      val pm = reactApplicationContext.packageManager
      val pkg = reactApplicationContext.packageName

      val targetComponent = ComponentName(pkg, targetClass)
      val currentTargetState = pm.getComponentEnabledSetting(targetComponent)

      // Check if already exclusively active to avoid unnecessary launcher flicker
      if (currentTargetState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
        var othersDisabled = true
        for ((key, className) in aliasMap) {
          if (key != targetKey) {
            val st = pm.getComponentEnabledSetting(ComponentName(pkg, className))
            if (st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
              (key == "default" && st == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)
            ) {
              othersDisabled = false
              break
            }
          }
        }
        if (othersDisabled) {
          promise.resolve(targetKey)
          return
        }
      }

      // Enable target alias first, then disable all other aliases
      pm.setComponentEnabledSetting(
        targetComponent,
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP
      )

      for ((key, className) in aliasMap) {
        if (key != targetKey) {
          val comp = ComponentName(pkg, className)
          pm.setComponentEnabledSetting(
            comp,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
          )
        }
      }

      promise.resolve(targetKey)
    } catch (e: Exception) {
      promise.reject("ICON_SWITCH_ERROR", e.message, e)
    }
  }
}
`;
}

function buildDynamicLauncherPackageKotlin(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DynamicLauncherIconPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(DynamicLauncherIconModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

module.exports = function withDynamicFestivalIcons(config) {
  // 1. Configure AndroidManifest <activity-alias> entries
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const app = manifest.application && manifest.application[0];
    if (!app) return modConfig;

    const activities = app.activity || [];
    const mainActivity = activities.find(
      (act) =>
        act.$ &&
        (act.$['android:name'] === '.MainActivity' ||
          String(act.$['android:name']).endsWith('.MainActivity'))
    );

    if (mainActivity && Array.isArray(mainActivity['intent-filter'])) {
      // Remove LAUNCHER category from MainActivity so only the active activity-alias appears in launcher
      for (const filter of mainActivity['intent-filter']) {
        if (Array.isArray(filter.category)) {
          filter.category = filter.category.filter(
            (cat) => cat?.$?.['android:name'] !== 'android.intent.category.LAUNCHER'
          );
        }
      }
      mainActivity['intent-filter'] = mainActivity['intent-filter'].filter((filter) => {
        const hasAction = Array.isArray(filter.action) && filter.action.length > 0;
        const hasCategory = Array.isArray(filter.category) && filter.category.length > 0;
        const hasData = Array.isArray(filter.data) && filter.data.length > 0;
        // Drop empty MAIN-only filter left behind after stripping LAUNCHER, keep deep-link filters
        if (hasData) return true;
        return hasAction && hasCategory;
      });
    }

    const existingAliases = Array.isArray(app['activity-alias']) ? app['activity-alias'] : [];
    const aliasNames = new Set(FESTIVAL_ALIASES.map((a) => `.${a.aliasName}`));
    const preservedAliases = existingAliases.filter(
      (al) => !aliasNames.has(al?.$?.['android:name'])
    );

    const generatedAliases = FESTIVAL_ALIASES.map((a) => ({
      $: {
        'android:name': `.${a.aliasName}`,
        'android:targetActivity': '.MainActivity',
        'android:enabled': a.defaultEnabled ? 'true' : 'false',
        'android:exported': 'true',
        'android:icon': `@mipmap/${a.resName}`,
        'android:roundIcon': `@mipmap/${a.resName}`,
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        },
      ],
    }));

    app['activity-alias'] = [...preservedAliases, ...generatedAliases];
    return modConfig;
  });

  // 2. Write festival drawable/mipmap resources and Kotlin native module
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const androidRoot = modConfig.modRequest.platformProjectRoot;
      const packageName =
        (modConfig.android && modConfig.android.package) || 'com.diagnostic.phleboapp';

      const drawableDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'drawable-nodpi');
      const mipmapDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26');
      const valuesDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'values');
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.mkdirSync(mipmapDir, { recursive: true });
      fs.mkdirSync(valuesDir, { recursive: true });

      const bgColorFile = path.join(valuesDir, 'festival_icon_colors.xml');
      fs.writeFileSync(
        bgColorFile,
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="labsetu_festival_icon_bg">#FFFFFF</color>\n</resources>\n`,
        'utf8'
      );

      for (const alias of FESTIVAL_ALIASES) {
        const srcImg = path.resolve(projectRoot, alias.sourceRel);
        if (fs.existsSync(srcImg)) {
          fs.copyFileSync(srcImg, path.join(drawableDir, `${alias.resName}_fg.png`));
          const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/labsetu_festival_icon_bg" />
  <foreground android:drawable="@drawable/${alias.resName}_fg" />
</adaptive-icon>
`;
          fs.writeFileSync(path.join(mipmapDir, `${alias.resName}.xml`), adaptiveXml, 'utf8');
        }
      }

      const javaDir = path.join(androidRoot, 'app', 'src', 'main', 'java', ...packageName.split('.'));
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(
        path.join(javaDir, 'DynamicLauncherIconModule.kt'),
        buildDynamicLauncherModuleKotlin(packageName),
        'utf8'
      );
      fs.writeFileSync(
        path.join(javaDir, 'DynamicLauncherIconPackage.kt'),
        buildDynamicLauncherPackageKotlin(packageName),
        'utf8'
      );

      return modConfig;
    },
  ]);

  // 3. Register DynamicLauncherIconPackage in MainApplication
  config = withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes('DynamicLauncherIconPackage')) {
      contents = contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n              add(DynamicLauncherIconPackage())'
      );
      modConfig.modResults.contents = contents;
    }
    return modConfig;
  });

  return config;
};
