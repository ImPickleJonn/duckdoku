# clean-duck-bg.py IN OUT
# Force a perfectly flat chroma-key background behind the duck (and any prop):
# paint everything that is NOT the duck/props flat blue #006BFF so the in-game
# chroma key removes it cleanly. Keeps: the largest blob (the duck) + any other
# sizeable COLORED blob (a held/dropped prop like a banana, trophy, flag).
# Drops: the blue bg, stray white X marks, grid lines, sticker border, specks.
import sys
import numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage

KEY = np.array([0, 107, 255], dtype=np.uint8)   # #006BFF, the in-game key color
FLAGS = sys.argv[3:]
STRICT = ('strict' in FLAGS)   # keep ONLY the duck (no props) — for the head/face frames
POP = ('pop' in FLAGS)         # boost saturation+brightness to match the vivid master

def clean(inp, outp):
    a = np.asarray(Image.open(inp).convert('RGB')).astype(np.int32)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    is_blue = (B > 95) & (B > R * 1.08) & (B > G * 1.03)   # royal/azure bg (incl. soft gradient)
    fg = ~is_blue
    lbl, n = ndimage.label(fg)
    keep = np.zeros(a.shape[:2], dtype=bool)
    if n >= 1:
        counts = np.bincount(lbl.ravel()); counts[0] = 0
        biggest = int(counts.argmax())
        total = a.shape[0] * a.shape[1]
        for i in range(1, n + 1):
            m = (lbl == i)
            if i == biggest:                       # the duck
                keep |= m; continue
            if STRICT:                             # faces: keep ONLY the duck, drop everything else
                continue
            if counts[i] < total * 0.004:          # tiny speck (stray X dot / grid bit) -> drop
                continue
            mr, mg, mb = R[m].mean(), G[m].mean(), B[m].mean()
            mn, mx = min(mr, mg, mb), max(mr, mg, mb)
            if mn > 168 and (mx - mn) < 50:        # whitish/cream blob (X mark, grid, border) -> drop
                continue
            keep |= m                              # sizeable COLORED blob -> a real prop -> keep
        keep = ndimage.binary_fill_holes(keep)     # fill blue specks inside the duck/prop
    else:
        keep = fg
    out = a.copy().astype(np.uint8)
    out[~keep] = KEY
    img = Image.fromarray(out)
    if POP:  # vivid like the master app-icon duck (bg stays blue-dominant -> still keys)
        img = ImageEnhance.Color(img).enhance(1.42)
        img = ImageEnhance.Brightness(img).enhance(1.09)
    img.save(outp)
    print('  cleaned bg: %d blobs, kept %.1f%%%s' % (n, 100.0 * keep.mean(), ' +pop' if POP else ''))

if __name__ == '__main__':
    clean(sys.argv[1], sys.argv[2])
