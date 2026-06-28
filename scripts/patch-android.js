#!/usr/bin/env node
/* Re-apply durable Android config after `npx cap sync` / `cap add android`.
   Capacitor regenerates MainActivity.java on sync, wiping our immersive-fullscreen
   code, so this rewrites it every time. Mirrors Dumpling Drop / Rail the Way.
   Wired into `npm run mobile:sync`. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'android');

if (!fs.existsSync(path.join(A, 'app'))) {
  console.log('[patch-android] android/ not present yet, skipping.');
  process.exit(0);
}

const appId = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8')).appId;
const pkgParts = appId.split('.');

const maSrc = `package ${appId};

import android.os.Build;
import android.os.Bundle;
import android.content.pm.ActivityInfo;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// Immersive fullscreen: hide status + navigation bars (sticky), draw edge-to-edge
// into the display cutout. Patched by scripts/patch-android.js.
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SoftHaptic.class); // must precede super.onCreate (bridge consumes plugins in load())
    super.onCreate(savedInstanceState);
    // allow <video autoplay muted> to start without a tap (Android WebView blocks media autoplay by default)
    try { getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false); } catch (Exception e) {}
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      getWindow().getAttributes().layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }
    applyImmersive();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) applyImmersive();
  }

  private void applyImmersive() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat c =
      WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    if (c != null) {
      c.hide(WindowInsetsCompat.Type.systemBars());
      c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
  }
}
`;

// Custom low-amplitude vibration plugin. The @capacitor/haptics plugin's softest preset
// (selectionChanged) is amplitude 100/255 -- still too strong for the frequent X-mark tick.
// This exposes createOneShot(duration, amplitude) so JS can request a genuinely faint tap.
const softSrc = `package ${appId};

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SoftHaptic")
public class SoftHaptic extends Plugin {
  @PluginMethod
  public void buzz(PluginCall call) {
    int duration = call.getInt("duration", 18);
    int amplitude = call.getInt("amplitude", 50);
    try {
      Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
      if (v != null && v.hasVibrator()) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          if (amplitude < 1) amplitude = 1;
          if (amplitude > 255) amplitude = 255;
          // no amplitude control -> keep the pulse very brief so it stays light
          if (!v.hasAmplitudeControl() && duration > 10) duration = 10;
          v.vibrate(VibrationEffect.createOneShot(duration, amplitude));
        } else {
          v.vibrate(duration);
        }
      }
    } catch (Exception e) {}
    call.resolve();
  }
}
`;

const javaRoot = path.join(A, 'app', 'src', 'main', 'java');
const maPath = path.join(javaRoot, ...pkgParts, 'MainActivity.java');
const softPath = path.join(javaRoot, ...pkgParts, 'SoftHaptic.java');

// remove any stale MainActivity.java left at a different package path
function rmStale(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) rmStale(p);
    else if (ent.name === 'MainActivity.java' && p !== maPath) fs.rmSync(p);
  }
}
rmStale(javaRoot);

fs.mkdirSync(path.dirname(maPath), { recursive: true });
fs.writeFileSync(maPath, maSrc, 'utf8');
fs.writeFileSync(softPath, softSrc, 'utf8');
console.log('[patch-android] MainActivity set to immersive fullscreen + SoftHaptic plugin written.');
