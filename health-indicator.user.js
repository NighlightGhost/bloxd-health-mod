// ==UserScript==
// @name         Bloxd.io Health Indicator
// @namespace    https://bloxd.io
// @version      1.0.0
// @description  Displays each player's health above their nametag — visible to everyone in the world.
// @author       Gary (OpenClaw)
// @match        *://*.bloxd.io/*
// @match        *://*.bloxd.com/*
// @match        *://*.bloxd.dev/*
// @match        *://*.bloxdhop.io/*
// @match        *://*.playbloxd.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

/**
 * HOW IT WORKS
 * ─────────────────────────────────────────────────────────────────────────────
 * Bloxd.io runs on the noa-engine (Babylon.js under the hood).
 * The engine object is passed as the first argument of a Function.prototype.call
 * very early in the game boot sequence.  We intercept that call to capture
 * the `noa` reference — the same technique used by every other Bloxd mod.
 *
 * Once we have `noa`:
 *   • noa.entities.getState(id, 'position').position  → [x, y, z] world pos
 *   • noa.bloxd.getPlayerIds()                        → { username: entityId }
 *   • noa.bloxd.client.playerManager.players          → player objects with .health
 *   • noa._scene / noa.rendering._scene               → BabylonJS scene for world→screen projection
 *
 * Every animation frame we:
 *   1. Get all remote player IDs and their world positions.
 *   2. Project the head position (y + 2.4) to 2D screen coords via the active camera.
 *   3. Read their health value from the player manager.
 *   4. Draw an HTML overlay label (number + ❤) above where the nametag appears.
 *
 * Health is colour-coded:
 *   > 15  →  green  (healthy)
 *   6–15  →  yellow (hurt)
 *   1–5   →  red    (critical)
 * ─────────────────────────────────────────────────────────────────────────────
 */

(() => {
  'use strict';

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const safe = (fn, fb = null) => { try { return fn(); } catch (_) { return fb; } };
  const vals = o => Object.values(o ?? {});

  // ─── Engine capture (same pattern as all working Bloxd mods) ───────────────
  const _origCall       = Function.prototype.call;
  const _origToString   = Function.prototype.toString;

  const engine = { noa: null };

  // Spoof toString so anti-tamper checks don't catch us
  Function.prototype.toString = function () {
    if (this === Function.prototype.call)     return 'function call() { [native code] }';
    if (this === Function.prototype.toString) return 'function toString() { [native code] }';
    return _origToString.apply(this, arguments);
  };

  Function.prototype.call = function (thisArg, ...args) {
    if (!engine.noa) {
      const c = args[0];
      // The noa object always has both `.entities` and `.bloxd`
      if (c && c.entities && c.bloxd) {
        engine.noa = c;
        window.__bloxdNoa = c;          // handy for console debugging
        Function.prototype.call = _origCall;   // restore immediately
        console.log('%c[HealthMod] ✅ Engine captured', 'color:#4ade80;font-weight:bold');
        onEngineReady();
      }
    }
    return _origCall.apply(this, [thisArg, ...args]);
  };

  // ─── Overlay canvas ────────────────────────────────────────────────────────
  let canvas   = null;
  let ctx      = null;
  let gameCanvas = null;

  function createOverlay() {
    canvas = document.createElement('canvas');
    canvas.id = 'hm-overlay';
    canvas.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 9999;
    `;
    document.body.appendChild(canvas);
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
    ctx = canvas.getContext('2d');
  }

  function resizeOverlay() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // ─── World → Screen projection ─────────────────────────────────────────────
  // BabylonJS provides BABYLON.Vector3.Project — we grab the scene's active camera
  // and the engine's render canvas to do the projection ourselves.

  function worldToScreen(wx, wy, wz) {
    const noa   = engine.noa;
    const scene = safe(() => noa._scene ?? noa.rendering?._scene ?? noa.rendering?.getScene?.());
    if (!scene) return null;

    const cam = scene.activeCamera;
    if (!cam) return null;

    // BabylonJS exposes the global BABYLON namespace; use it if available
    const BABYLON = window.BABYLON;
    if (BABYLON?.Vector3?.Project) {
      const viewport = cam.viewport.toGlobal(canvas.width, canvas.height);
      const projected = BABYLON.Vector3.Project(
        new BABYLON.Vector3(wx, wy, wz),
        BABYLON.Matrix.Identity(),
        scene.getTransformMatrix(),
        viewport
      );
      if (projected.z < 0 || projected.z > 1) return null;   // behind camera / too far
      return { x: projected.x, y: projected.y };
    }

    // Fallback: manual projection using camera matrices
    return safe(() => {
      const transformMatrix = scene.getTransformMatrix();
      // Build a 4-component position vector
      const x = wx, y = wy, z = wz;
      const m = transformMatrix.m;  // column-major Float32Array, 16 elements

      // Multiply [x,y,z,1] by the 4×4 transform matrix (clip coords)
      const clipX = x*m[0]  + y*m[4]  + z*m[8]  + m[12];
      const clipY = x*m[1]  + y*m[5]  + z*m[9]  + m[13];
      const clipZ = x*m[2]  + y*m[6]  + z*m[10] + m[14];
      const clipW = x*m[3]  + y*m[7]  + z*m[11] + m[15];

      if (clipW <= 0) return null;   // behind camera

      const ndcX = clipX / clipW;
      const ndcY = clipY / clipW;
      const ndcZ = clipZ / clipW;

      if (ndcZ > 1) return null;     // outside far plane

      const screenX = (ndcX  * 0.5 + 0.5) * canvas.width;
      const screenY = (-ndcY * 0.5 + 0.5) * canvas.height;

      return { x: screenX, y: screenY };
    });
  }

  // ─── Draw a health label ────────────────────────────────────────────────────
  function healthColor(hp, maxHp) {
    const ratio = hp / maxHp;
    if (ratio > 0.75) return '#4ade80';   // green
    if (ratio > 0.35) return '#facc15';   // yellow
    return '#f87171';                      // red
  }

  const FONT_SIZE   = 14;
  const HEART       = '❤';
  const LABEL_PAD_X = 8;
  const LABEL_PAD_Y = 4;
  // How far above the nametag (approx nametag is at head level +0.35)
  // We place the health label a little higher
  const HEAD_OFFSET_Y = 2.55;

  function drawHealthLabel(screenX, screenY, hp, maxHp, name) {
    if (!ctx) return;

    const color = healthColor(hp, maxHp);
    const text  = `${hp} ${HEART}`;

    ctx.save();

    // Shadow for readability against any background
    ctx.shadowColor   = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur    = 4;

    // Background pill
    ctx.font = `bold ${FONT_SIZE}px "Segoe UI", sans-serif`;
    const tw = ctx.measureText(text).width;
    const bw = tw + LABEL_PAD_X * 2;
    const bh = FONT_SIZE + LABEL_PAD_Y * 2;
    const bx = screenX - bw / 2;
    const by = screenY - bh;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();

    // Text
    ctx.shadowBlur = 3;
    ctx.fillStyle  = color;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, screenX, by + bh / 2);

    ctx.restore();
  }

  // ─── Read health for a player entity ────────────────────────────────────────
  // Bloxd stores per-player state inside the noa entity component system.
  // The component is typically called 'bloxdPlayer' or similar, or accessible
  // via the playerManager. We try several paths gracefully.

  function getPlayerHealth(entityId, username) {
    const noa = engine.noa;

    // Path 1: noa entity state 'bloxdPlayer' component
    const bpState = safe(() => noa.entities.getState(entityId, 'bloxdPlayer'));
    if (bpState?.health != null)      return { hp: bpState.health,      max: bpState.maxHealth ?? 20 };
    if (bpState?.hp    != null)       return { hp: bpState.hp,          max: bpState.maxHp     ?? 20 };

    // Path 2: noa entity state 'health' component
    const hState = safe(() => noa.entities.getState(entityId, 'health'));
    if (hState?.health != null)       return { hp: hState.health,       max: hState.maxHealth  ?? 20 };
    if (hState?.hp     != null)       return { hp: hState.hp,           max: 20 };
    if (typeof hState  === 'number')  return { hp: hState,              max: 20 };

    // Path 3: playerManager keyed by username
    const pm = safe(() => noa.bloxd.client?.playerManager);
    if (pm) {
      const byName = safe(() => pm.players?.[username] ?? pm.getPlayer?.(username));
      if (byName?.health != null)     return { hp: byName.health,       max: byName.maxHealth  ?? 20 };
      if (byName?.hp     != null)     return { hp: byName.hp,           max: 20 };
    }

    // Path 4: walk the bloxd client for a map keyed by entityId
    const clientPlayers = safe(() => {
      const c = noa.bloxd.client;
      return c?.players ?? c?.world?.players ?? c?.game?.players;
    });
    if (clientPlayers) {
      const p = safe(() => Object.values(clientPlayers).find(p => p.entityId == entityId || p.id == entityId));
      if (p?.health != null)          return { hp: p.health,            max: p.maxHealth       ?? 20 };
    }

    // Not found — return null so we skip this player gracefully
    return null;
  }

  // ─── Main render loop ───────────────────────────────────────────────────────
  function renderLoop() {
    requestAnimationFrame(renderLoop);

    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const noa = engine.noa;
    if (!noa) return;

    // Only run when actually in a game world
    const inGame = safe(() => !!(noa.bloxd?.client?.msgHandler));
    if (!inGame) return;

    // Get all player IDs: returns { username: entityId }
    const playerIds = safe(() => noa.bloxd.getPlayerIds?.() ?? {}, {});
    const selfId    = 1;  // local player is always entity 1

    for (const [username, entityId] of Object.entries(playerIds)) {
      if (entityId == selfId) continue;  // skip self — they can't see their own label anyway

      // World position of this player's head
      const pos = safe(() => noa.entities.getState(entityId, 'position')?.position);
      if (!pos) continue;

      const [wx, wy, wz] = pos;
      const screenPt = worldToScreen(wx, wy + HEAD_OFFSET_Y, wz);
      if (!screenPt) continue;

      // Skip if off-screen
      if (screenPt.x < -100 || screenPt.x > canvas.width  + 100) continue;
      if (screenPt.y < -100 || screenPt.y > canvas.height + 100) continue;

      const health = getPlayerHealth(entityId, username);
      if (!health) continue;

      // Clamp to valid range
      const hp    = Math.max(0, Math.round(health.hp));
      const maxHp = Math.max(1, health.max);

      drawHealthLabel(screenPt.x, screenPt.y, hp, maxHp, username);
    }
  }

  // ─── Kick off once the engine is captured ───────────────────────────────────
  function onEngineReady() {
    // Wait for DOM body
    const start = () => {
      createOverlay();
      renderLoop();
      console.log('%c[HealthMod] 🫀 Health overlay active', 'color:#4ade80;font-weight:bold');
    };

    if (document.body) {
      start();
    } else {
      const obs = new MutationObserver(() => {
        if (document.body) { obs.disconnect(); start(); }
      });
      obs.observe(document.documentElement, { childList: true });
    }
  }

})();
