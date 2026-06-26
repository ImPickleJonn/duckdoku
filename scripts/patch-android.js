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
    super.onCreate(savedInstanceState);
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

const javaRoot = path.join(A, 'app', 'src', 'main', 'java');
const maPath = path.join(javaRoot, ...pkgParts, 'MainActivity.java');

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
console.log('[patch-android] MainActivity set to immersive fullscreen.');
