# keytest.py IN OUT  — replicate the in-game chroma key (keyInto) on a frame and
# composite the result over MAGENTA so any leftover blue fringe is obvious.
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float64)
R, G, B = a[:, :, 0].copy(), a[:, :, 1].copy(), a[:, :, 2].copy()
alpha = np.full(R.shape, 255.0)
hard = (B > 80) & (B > R * 1.18) & (B > G * 1.10)            # blue -> transparent
soft = (~hard) & (B > 70) & (B > R * 1.05) & (B > G)          # soft edge + despill
alpha[hard] = 0
alpha[soft] = np.clip(alpha[soft] - 110, 0, 255)
R[soft] = np.minimum(R[soft], G[soft])
mag = np.array([255.0, 0.0, 255.0])
af = (alpha / 255.0)[:, :, None]
rgb = np.stack([R, G, B], axis=2)
out = rgb * af + mag * (1 - af)
Image.fromarray(out.astype(np.uint8)).save(sys.argv[2])
print('  keyed; transparent px = %.1f%%' % (100.0 * (alpha == 0).mean()))
