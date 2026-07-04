"""
Proxy de calibración visual — NO es el render final.

Reproduce en numpy las mismas ecuaciones que src/shaders/simulation.ts
(difusión + reacción biestable + ruido térmico) y un modelo de sombreado
aproximado equivalente al de organism.ts (albedo por umbral suave, bump
mesoscópico, moteado microscópico como proxy de especular).

Proyección equirrectangular plana, luz fija, sin perspectiva real de
esfera. Sirve para juzgar: ancho/cantidad de dominios (macro), si el
bump mesoscópico se lee como estructura independiente, si el moteado
micro se lee como material y no como ruido de video, y si el contraste
tonal general comunica "materia" en vez de "diagrama".
"""
import numpy as np

rng = np.random.default_rng(7)

RES = 256


def value_noise(res, low_res, seed):
    r = np.random.default_rng(seed)
    grid = r.uniform(-1, 1, size=(low_res, low_res)).astype(np.float32)
    # bilinear upsample, wrap in x (longitude), clamp in y (latitude)
    ys = np.linspace(0, low_res, res, endpoint=False)
    xs = np.linspace(0, low_res, res, endpoint=False)
    y0 = np.floor(ys).astype(int) % low_res
    y1 = (y0 + 1) % low_res
    x0 = np.floor(xs).astype(int) % low_res
    x1 = (x0 + 1) % low_res
    fy = (ys - np.floor(ys)).reshape(-1, 1)
    fx = (xs - np.floor(xs)).reshape(1, -1)
    top = grid[np.ix_(y0, x0)] * (1 - fx) + grid[np.ix_(y0, x1)] * fx
    bot = grid[np.ix_(y1, x0)] * (1 - fx) + grid[np.ix_(y1, x1)] * fx
    return top * (1 - fy) + bot * fy


def fbm(res, seed, octaves=3):
    out = np.zeros((res, res), dtype=np.float32)
    amp = 0.5
    low_res = 6
    for o in range(octaves):
        out += value_noise(res, low_res, seed + o * 101) * amp
        amp *= 0.5
        low_res *= 2
    return out


def laplacian(v):
    left = np.roll(v, 1, axis=1)
    right = np.roll(v, -1, axis=1)
    up = np.empty_like(v)
    down = np.empty_like(v)
    up[1:, :] = v[:-1, :]
    up[0, :] = v[0, :]
    down[:-1, :] = v[1:, :]
    down[-1, :] = v[-1, :]
    return left + right + up + down - 4 * v


def run_simulation(diffusion, reaction_strength, thermal_noise,
                    seconds=30.0, dt=1 / 60, substeps=16, seed=1):
    v = value_noise(RES, 6, seed) * 0.6
    n_frames = int(seconds / dt)
    forcing = fbm(RES, seed + 500, octaves=3)  # static spatial pattern
    snapshots = {}
    capture_times = {1.0, 5.0, 15.0, 30.0}
    t = 0.0
    for f in range(n_frames):
        sub_dt = dt / substeps
        for s in range(substeps):
            t += sub_dt
            lap = laplacian(v)
            reaction = v - v ** 3
            # slow phase drift on the static forcing pattern via a second,
            # independently-seeded low-res field mixed in over time
            thermal = forcing
            dv = diffusion * lap + reaction_strength * reaction + thermal_noise * thermal
            v = v + dv * sub_dt
            v = np.clip(v, -1.5, 1.5)
        for ct in list(capture_times):
            if abs(t - ct) < dt:
                snapshots[ct] = v.copy()
                capture_times.discard(ct)
    snapshots[seconds] = v.copy()
    return snapshots


def shade(field, meso_scale=14, meso_strength=9.0, micro_scale=55,
          roughness_base=0.5, roughness_var=0.35, spec_strength=0.35,
          base_low=0.04, base_high=0.68, seed=2):
    # albedo via soft threshold (matches smoothstep(-0.6,0.6,field))
    t = np.clip((field - (-0.6)) / (0.6 - (-0.6)), 0, 1)
    t = t * t * (3 - 2 * t)
    grain = value_noise(RES, 40, seed) 
    t = np.clip(t + grain * 0.06, 0, 1)
    albedo = base_low + (base_high - base_low) * t

    # macro normal from field gradient (finite differences)
    gx = (np.roll(field, -1, axis=1) - np.roll(field, 1, axis=1)) * 0.5
    gy = np.zeros_like(field)
    gy[1:-1, :] = (field[2:, :] - field[:-2, :]) * 0.5
    disp_scale = 0.16

    # meso bump: independent fixed relief
    meso = value_noise(RES, meso_scale, seed + 900)
    mgx = (np.roll(meso, -1, axis=1) - np.roll(meso, 1, axis=1)) * 0.5
    mgy = np.zeros_like(meso)
    mgy[1:-1, :] = (meso[2:, :] - meso[:-2, :]) * 0.5

    nx = -(gx * disp_scale * 4.0) - mgx * meso_strength * 0.02
    ny = -(gy * disp_scale * 4.0) - mgy * meso_strength * 0.02
    nz = np.ones_like(field)
    norm = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    nx, ny, nz = nx / norm, ny / norm, nz / norm

    # fixed key light direction (matches App.ts-ish framing)
    lx, ly, lz = 0.4, 0.6, 0.8
    lnorm = np.sqrt(lx**2 + ly**2 + lz**2)
    lx, ly, lz = lx/lnorm, ly/lnorm, lz/lnorm
    ndotl = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)

    # micro roughness -> crude specular proxy (view = +z, half-vector approx)
    micro = value_noise(RES, micro_scale, seed + 300)
    roughness = np.clip(roughness_base + micro * roughness_var, 0.05, 1.0)
    spec_exp = 8.0 + (180.0 - 8.0) * (1 - roughness)
    spec_int = 1.4 + (0.35 - 1.4) * (1 - roughness)
    hx, hy, hz = lx, ly, lz + 1.0
    hnorm = np.sqrt(hx**2 + hy**2 + hz**2)
    hx, hy, hz = hx/hnorm, hy/hnorm, hz/hnorm
    ndoth = np.clip(nx * hx + ny * hy + nz * hz, 0, 1)
    spec = (ndoth ** spec_exp) * spec_int * spec_strength

    fill = albedo * 0.12 * (1 - ndotl)
    diffuse = albedo * ndotl
    color = diffuse + fill + spec
    return np.clip(color, 0, 1)


if __name__ == "__main__":
    import sys
    from PIL import Image

    diffusion = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0
    reaction = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    thermal = float(sys.argv[3]) if len(sys.argv) > 3 else 0.03
    tag = sys.argv[4] if len(sys.argv) > 4 else "default"
    base_low = float(sys.argv[5]) if len(sys.argv) > 5 else 0.04
    base_high = float(sys.argv[6]) if len(sys.argv) > 6 else 0.68
    meso_strength = float(sys.argv[7]) if len(sys.argv) > 7 else 9.0
    roughness_var = float(sys.argv[8]) if len(sys.argv) > 8 else 0.35
    spec_strength = float(sys.argv[9]) if len(sys.argv) > 9 else 0.35

    snaps = run_simulation(diffusion, reaction, thermal, seconds=30.0)
    times = sorted(snaps.keys())
    imgs = []
    for tt in times:
        img = shade(snaps[tt], meso_strength=meso_strength, roughness_var=roughness_var,
                    spec_strength=spec_strength, base_low=base_low, base_high=base_high)
        imgs.append((tt, img))

    strip = np.concatenate([img for _, img in imgs], axis=1)
    strip_img = (np.clip(strip, 0, 1) * 255).astype(np.uint8)
    out_path = f"/home/claude/calib_{tag}.png"
    Image.fromarray(strip_img, mode="L").save(out_path)
    print("saved", out_path, "times:", times)
