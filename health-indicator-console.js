// ═══════════════════════════════════════════════════════════════
//  BLOXD.IO HEALTH INDICATOR  —  paste into F12 console & press Enter
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const safe = (fn, fb = null) => { try { return fn(); } catch (_) { return fb; } };

  // ── Find the noa engine ────────────────────────────────────────
  // It may already be on window (if another mod ran first), or we
  // intercept the game's internal call to grab it fresh.
  function findEngine(onFound) {
    if (window.__bloxdNoa) { onFound(window.__bloxdNoa); return; }

    const _origCall     = Function.prototype.call;
    const _origToString = Function.prototype.toString;

    Function.prototype.toString = function () {
      if (this === Function.prototype.call)     return 'function call() { [native code] }';
      if (this === Function.prototype.toString) return 'function toString() { [native code] }';
      return _origToString.apply(this, arguments);
    };

    Function.prototype.call = function (thisArg, ...args) {
      const c = args[0];
      if (c && c.entities && c.bloxd) {
        Function.prototype.call     = _origCall;
        Function.prototype.toString = _origToString;
        window.__bloxdNoa = c;
        onFound(c);
      }
      return _origCall.apply(this, [thisArg, ...args]);
    };

    console.log('%c[HealthMod] Waiting for game to load…', 'color:#facc15;font-weight:bold');
  }

  // ── Canvas overlay ─────────────────────────────────────────────
  function createOverlay() {
    document.getElementById('hm-overlay')?.remove();
    const cv = document.createElement('canvas');
    cv.id = 'hm-overlay';
    cv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(cv);
    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    return cv;
  }

  // ── 3D → 2D screen projection ──────────────────────────────────
  function worldToScreen(noa, cv, wx, wy, wz) {
    const scene = safe(() => noa._scene ?? noa.rendering?._scene ?? noa.rendering?.getScene?.());
    if (!scene) return null;
    const cam = scene.activeCamera;
    if (!cam) return null;

    if (window.BABYLON?.Vector3?.Project) {
      const vp  = cam.viewport.toGlobal(cv.width, cv.height);
      const out = window.BABYLON.Vector3.Project(
        new window.BABYLON.Vector3(wx, wy, wz),
        window.BABYLON.Matrix.Identity(),
        scene.getTransformMatrix(),
        vp
      );
      if (out.z < 0 || out.z > 1) return null;
      return { x: out.x, y: out.y };
    }

    // Manual matrix fallback
    return safe(() => {
      const m = scene.getTransformMatrix().m;
      const cX = wx*m[0] + wy*m[4] + wz*m[8]  + m[12];
      const cY = wx*m[1] + wy*m[5] + wz*m[9]  + m[13];
      const cZ = wx*m[2] + wy*m[6] + wz*m[10] + m[14];
      const cW = wx*m[3] + wy*m[7] + wz*m[11] + m[15];
      if (cW <= 0 || cZ / cW > 1) return null;
      return {
        x:  (cX / cW *  0.5 + 0.5) * cv.width,
        y:  (cY / cW * -0.5 + 0.5) * cv.height
      };
    });
  }

  // ── Health lookup ──────────────────────────────────────────────
  function getHealth(noa, entityId, username) {
    const bp = safe(() => noa.entities.getState(entityId, 'bloxdPlayer'));
    if (bp?.health != null) return { hp: bp.health, max: bp.maxHealth ?? 20 };
    if (bp?.hp     != null) return { hp: bp.hp,     max: bp.maxHp    ?? 20 };

    const h = safe(() => noa.entities.getState(entityId, 'health'));
    if (h?.health != null)        return { hp: h.health, max: h.maxHealth ?? 20 };
    if (h?.hp     != null)        return { hp: h.hp,     max: 20 };
    if (typeof h  === 'number')   return { hp: h,        max: 20 };

    const pm = safe(() => noa.bloxd.client?.playerManager);
    if (pm) {
      const p = safe(() => pm.players?.[username] ?? pm.getPlayer?.(username));
      if (p?.health != null) return { hp: p.health, max: p.maxHealth ?? 20 };
    }

    const cp = safe(() => {
      const c = noa.bloxd.client;
      return c?.players ?? c?.world?.players ?? c?.game?.players;
    });
    if (cp) {
      const p = safe(() => Object.values(cp).find(p => p.entityId == entityId || p.id == entityId));
      if (p?.health != null) return { hp: p.health, max: p.maxHealth ?? 20 };
    }

    return null;
  }

  // ── Draw label ─────────────────────────────────────────────────
  function draw(ctx, x, y, hp, maxHp) {
    const ratio = hp / maxHp;
    const color = ratio > 0.75 ? '#4ade80' : ratio > 0.35 ? '#facc15' : '#f87171';
    const text  = `${Math.max(0, Math.round(hp))} ❤`;

    ctx.save();
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width;
    const pw = 8, ph = 4, fh = 14;
    const bw = tw + pw * 2, bh = fh + ph * 2;
    const bx = x - bw / 2, by = y - bh;

    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();

    ctx.shadowBlur      = 3;
    ctx.fillStyle       = color;
    ctx.textAlign       = 'center';
    ctx.textBaseline    = 'middle';
    ctx.fillText(text, x, by + bh / 2);
    ctx.restore();
  }

  // ── Main loop ──────────────────────────────────────────────────
  function startLoop(noa, cv) {
    const ctx = cv.getContext('2d');
    console.log('%c[HealthMod] ✅ Health indicator running!', 'color:#4ade80;font-weight:bold');

    (function loop() {
      requestAnimationFrame(loop);
      ctx.clearRect(0, 0, cv.width, cv.height);

      if (!safe(() => noa.bloxd?.client?.msgHandler)) return;

      const ids = safe(() => noa.bloxd.getPlayerIds?.() ?? {}, {});
      for (const [username, entityId] of Object.entries(ids)) {
        if (entityId == 1) continue;

        const pos = safe(() => noa.entities.getState(entityId, 'position')?.position);
        if (!pos) continue;

        const pt = worldToScreen(noa, cv, pos[0], pos[1] + 2.55, pos[2]);
        if (!pt) continue;
        if (pt.x < -100 || pt.x > cv.width + 100 || pt.y < -100 || pt.y > cv.height + 100) continue;

        const health = getHealth(noa, entityId, username);
        if (!health) continue;

        draw(ctx, pt.x, pt.y, health.hp, health.max);
      }
    })();
  }

  // ── Boot ───────────────────────────────────────────────────────
  const cv = createOverlay();
  findEngine(noa => startLoop(noa, cv));

  console.log('%c[HealthMod] Paste successful. Join a world to activate.', 'color:#a78bfa;font-weight:bold');
})();
