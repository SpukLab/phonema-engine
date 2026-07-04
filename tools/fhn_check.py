"""
Verificación puramente estadística/temporal — NO es evaluación visual.

Objetivo: confirmar, con números reales (no álgebra en el aire), si acoplar
un segundo canal W (recuperación lenta, tipo FitzHugh-Nagumo) al campo V
existente produce alternancia genuina entre quietud / tensión / liberación,
en vez de una decadencia monótona hacia una meseta (que es lo que el campo
biestable puro hace por diseño).

Se mide mean(|V|) y mean(W) global a lo largo de 180s simulados. Un
comportamiento "vivo" en el sentido pedido debería mostrar mean(|V|)
subiendo y bajando varias veces, no una curva monótona que se aplana.
"""
import numpy as np

def value_noise(res, low_res, seed):
    r = np.random.default_rng(seed)
    grid = r.uniform(-1, 1, size=(low_res, low_res)).astype(np.float32)
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

def laplacian(v):
    left = np.roll(v, 1, axis=1); right = np.roll(v, -1, axis=1)
    up = np.empty_like(v); down = np.empty_like(v)
    up[1:, :] = v[:-1, :]; up[0, :] = v[0, :]
    down[:-1, :] = v[1:, :]; down[-1, :] = v[-1, :]
    return left + right + up + down - 4 * v

def run(diffusion, reaction, thermal, eps, gamma, wcoupling,
        seconds=180.0, res=128, dt=1/60, substeps=16, seed=1):
    v = value_noise(res, 6, seed) * 0.6
    w = np.zeros((res, res), dtype=np.float32)
    forcing = value_noise(res, 24, seed + 500)
    n_frames = int(seconds / dt)
    log_times = []
    log_meanV = []
    log_meanW = []
    t = 0.0
    sample_every = 2.0  # seconds
    next_sample = 0.0
    for f in range(n_frames):
        sub_dt = dt / substeps
        for s in range(substeps):
            t += sub_dt
            lap = laplacian(v)
            reaction_term = v - v ** 3 - wcoupling * w
            dv = diffusion * lap + reaction * reaction_term + thermal * forcing
            v_next = np.clip(v + dv * sub_dt, -1.5, 1.5)
            dw = eps * (v - gamma * w)
            w_next = np.clip(w + dw * sub_dt, -2.0, 2.0)
            v, w = v_next, w_next
        if t >= next_sample:
            log_times.append(round(t, 1))
            log_meanV.append(float(np.mean(np.abs(v))))
            log_meanW.append(float(np.mean(np.abs(w))))
            next_sample += sample_every
    return log_times, log_meanV, log_meanW


if __name__ == "__main__":
    configs = [
        ("A: eps=0.02 gamma=0.6 wc=1.0", dict(diffusion=40, reaction=0.35, thermal=0.05, eps=0.02, gamma=0.6, wcoupling=1.0)),
        ("B: eps=0.05 gamma=0.8 wc=1.5", dict(diffusion=40, reaction=0.35, thermal=0.05, eps=0.05, gamma=0.8, wcoupling=1.5)),
        ("C: eps=0.01 gamma=0.5 wc=0.8", dict(diffusion=40, reaction=0.35, thermal=0.05, eps=0.01, gamma=0.5, wcoupling=0.8)),
    ]
    for name, cfg in configs:
        times, meanV, meanW = run(**cfg, seconds=180.0)
        print(f"--- {name} ---")
        for t, mv, mw in zip(times, meanV, meanW):
            print(f"t={t:6.1f}s  mean|V|={mv:.4f}  mean|W|={mw:.4f}")
        print()
