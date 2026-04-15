// ═══════════════════════════════════════════════════════════════
//  BLOXD.IO HEALTH BAR  —  paste into F12 console & press Enter
//  Shows a ❤ HP/MaxHP bar above every player's nametag
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const safe = (fn, fb = null) => { try { return fn(); } catch (_) { return fb; } };

  // ── Grab the noa engine ────────────────────────────────────────
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

    console.log('%c[HealthBar] Waiting for game…', 'color:#facc15;font-weight:bold');
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

  // ── 3D → 2D projection ────────────────────────────────────────
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

    return safe(() => {
      const m  = scene.getTransformMatrix().m;
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
    if (bp?.health != null) return { hp: bp.health, max: bp.maxHealth ?? 100 };
    if (bp?.hp     != null) return { hp: bp.hp,     max: bp.maxHp    ?? 100 };

    const h = safe(() => noa.entities.getState(entityId, 'health'));
    if (h?.health != null)       return { hp: h.health, max: h.maxHealth ?? 100 };
    if (h?.hp     != null)       return { hp: h.hp,     max: 100 };
    if (typeof h === 'number')   return { hp: h,         max: 100 };

    const pm = safe(() => noa.bloxd.client?.playerManager);
    if (pm) {
      const p = safe(() => pm.players?.[username] ?? pm.getPlayer?.(username));
      if (p?.health != null) return { hp: p.health, max: p.maxHealth ?? 100 };
    }

    const cp = safe(() => {
      const c = noa.bloxd.client;
      return c?.players ?? c?.world?.players ?? c?.game?.players;
    });
    if (cp) {
      const p = safe(() => Object.values(cp).find(p => p.entityId == entityId || p.id == entityId));
      if (p?.health != null) return { hp: p.health, max: p.maxHealth ?? 100 };
    }

    return null;
  }

  // ── Draw the health bar ────────────────────────────────────────
  // Styled to match the game's own ❤ HP/MaxHP pill at the bottom of screen
  function drawHealthBar(ctx, cx, cy, hp, maxHp) {
    hp    = Math.max(0, Math.round(hp));
    maxHp = Math.max(1, Math.round(maxHp));
    const ratio = hp / maxHp;

    // ── Pill dimensions ──
    const FONT     = 'bold 13px "Segoe UI", Arial, sans-serif';
    const TEXT     = `❤  ${hp}/${maxHp}`;
    const PAD_X    = 12;
    const PAD_Y    = 5;
    const RADIUS   = 6;
    const BAR_H    = 5;   // thin fill bar inside the pill
    const BAR_GAP  = 3;   // gap between text row and fill bar

    ctx.save();
    ctx.font = FONT;
    const tw  = ctx.measureText(TEXT).width;
    const pw  = tw + PAD_X * 2;
    const ph  = 13 + PAD_Y * 2 + BAR_GAP + BAR_H + 4;
    const px  = cx - pw / 2;
    const py  = cy - ph;

    // ── Drop shadow ──
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur  = 6;

    // ── Background pill (dark, like game UI) ──
    ctx.fillStyle = 'rgba(20, 20, 30, 0.82)';
    roundRect(ctx, px, py, pw, ph, RADIUS);
    ctx.fill();

    // ── Red border (matching game style) ──
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(200, 40, 40, 0.85)';
    ctx.lineWidth   = 1.5;
    roundRect(ctx, px, py, pw, ph, RADIUS);
    ctx.stroke();

    // ── Heart + HP text ──
    ctx.shadowColor    = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur     = 4;
    ctx.fillStyle      = '#ffffff';
    ctx.textAlign      = 'center';
    ctx.textBaseline   = 'top';
    ctx.fillText(TEXT, cx, py + PAD_Y);

    // ── Fill bar background (dark red track) ──
    const barY  = py + PAD_Y + 13 + BAR_GAP;
    const barX  = px + PAD_X;
    const barW  = pw - PAD_X * 2;

    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(100, 20, 20, 0.7)';
    roundRect(ctx, barX, barY, barW, BAR_H, 3);
    ctx.fill();

    // ── Fill bar foreground (colour by health) ──
    const fillColor = ratio > 0.6 ? '#e74c3c'   // red  (game matches this)
                    : ratio > 0.3 ? '#e67e22'   // orange
                    :               '#c0392b';   // dark red (critical)

    ctx.fillStyle = fillColor;
    if (ratio > 0) {
      roundRect(ctx, barX, barY, barW * ratio, BAR_H, 3);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Rounded rect helper (polyfill for older browsers) ─────────
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }

  // ── Render loop ────────────────────────────────────────────────
  function startLoop(noa, cv) {
    const ctx = cv.getContext('2d');
    console.log('%c[HealthBar] ✅ Running — health bars visible above nametags!', 'color:#4ade80;font-weight:bold');

    // The nametag is rendered at roughly head + 0.35 units above head.
    // We place the health bar just above that (+2.85 from feet, ~+0.3 above nametag).
    const HEAD_Y = 2.85;

    (function loop() {
      requestAnimationFrame(loop);
      ctx.clearRect(0, 0, cv.width, cv.height);

      if (!safe(() => noa.bloxd?.client?.msgHandler)) return;

      const ids = safe(() => noa.bloxd.getPlayerIds?.() ?? {}, {});

      for (const [username, entityId] of Object.entries(ids)) {
        if (entityId == 1) continue;   // skip self

        const pos = safe(() => noa.entities.getState(entityId, 'position')?.position);
        if (!pos) continue;

        // Project the point just above the nametag
        const pt = worldToScreen(noa, cv, pos[0], pos[1] + HEAD_Y, pos[2]);
        if (!pt) continue;
        if (pt.x < -200 || pt.x > cv.width + 200) continue;
        if (pt.y < -200 || pt.y > cv.height + 200) continue;

        const health = getHealth(noa, entityId, username);
        if (!health) continue;

        drawHealthBar(ctx, pt.x, pt.y, health.hp, health.max);
      }
    })();
  }

  // ── Boot ───────────────────────────────────────────────────────
  const cv = createOverlay();
  findEngine(noa => startLoop(noa, cv));

  console.log('%c[HealthBar] Paste successful. Join/be in a world to activate.', 'color:#a78bfa;font-weight:bold');
})();
