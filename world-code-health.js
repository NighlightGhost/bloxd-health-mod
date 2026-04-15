// ═══════════════════════════════════════════════════════════════
//  BLOXD.IO — HEALTH IN NAMETAG  (World Code — paste into editor)
//  Shows every player's health directly in their nametag:
//  e.g.  NighlightGhost  ❤ 85/100
//  Updates live on damage, healing, join and every tick.
// ═══════════════════════════════════════════════════════════════

// Track each player's health so we can update nametags efficiently
var playerHealth = {};
var playerMaxHealth = {};

// ── Helper: build the nametag string ──────────────────────────
function buildNametag(playerId) {
  var hp    = playerHealth[playerId]    ?? 100;
  var maxHp = playerMaxHealth[playerId] ?? 100;
  hp    = Math.max(0, Math.round(hp));
  maxHp = Math.max(1, Math.round(maxHp));

  var name = api.getPlayerName(playerId) ?? playerId;

  // Health bar  (10 segments)
  var filled  = Math.round((hp / maxHp) * 10);
  var empty   = 10 - filled;
  var bar     = "█".repeat(filled) + "░".repeat(empty);

  return name + "\n❤ " + hp + "/" + maxHp + "  [" + bar + "]";
}

// ── Helper: push updated nametag to everyone ──────────────────
function refreshNametag(playerId) {
  try {
    var tag = buildNametag(playerId);
    api.setPlayerNametag(playerId, tag);
  } catch (e) {}
}

// ── On join: cache health and set nametag ─────────────────────
onPlayerJoin = function (playerId, fromGameReset) {
  if (!api.checkValid(playerId)) return;

  try {
    var hp    = api.getPlayerHealth(playerId)    ?? 100;
    var maxHp = api.getPlayerMaxHealth(playerId) ?? 100;
    playerHealth[playerId]    = hp;
    playerMaxHealth[playerId] = maxHp;
    refreshNametag(playerId);
  } catch (e) {}
};

// ── On leave: clean up ────────────────────────────────────────
onPlayerLeave = function (playerId) {
  delete playerHealth[playerId];
  delete playerMaxHealth[playerId];
};

// ── On damage (player hits player): update nametag ────────────
onPlayerDamagingOtherPlayer = function (attackerId, defenderId, damage, itemName) {
  try {
    // Let the damage happen first, then re-read health next tick
    // We schedule via a flag so tick() picks it up
    if (!globalThis._pendingRefresh) globalThis._pendingRefresh = {};
    _pendingRefresh[defenderId] = true;
  } catch (e) {}
};

// ── Mob hits player ───────────────────────────────────────────
onMobDamagingPlayer = function (mobId, playerId, damage) {
  try {
    if (!globalThis._pendingRefresh) globalThis._pendingRefresh = {};
    _pendingRefresh[playerId] = true;
  } catch (e) {}
};

// ── Healing / potion effects ──────────────────────────────────
onPlayerPotionEffect = function (playerId, effectName, duration, amplifier) {
  try {
    if (!globalThis._pendingRefresh) globalThis._pendingRefresh = {};
    _pendingRefresh[playerId] = true;
  } catch (e) {}
};

// ── Tick: flush pending refreshes + keep nametags in sync ─────
var _tickCount = 0;
globalThis._pendingRefresh = {};

tick = function () {
  _tickCount++;

  // Process any players whose health changed this tick
  var pending = Object.keys(_pendingRefresh);
  for (var i = 0; i < pending.length; i++) {
    var pid = pending[i];
    try {
      var hp    = api.getPlayerHealth(pid);
      var maxHp = api.getPlayerMaxHealth(pid);
      if (hp    != null) playerHealth[pid]    = hp;
      if (maxHp != null) playerMaxHealth[pid] = maxHp;
      refreshNametag(pid);
    } catch (e) {}
  }
  globalThis._pendingRefresh = {};

  // Every 20 ticks (~1 sec) do a full sync of all online players
  // so nametags never drift out of date
  if (_tickCount % 20 === 0) {
    try {
      var allPlayers = api.getAllPlayerIds();
      if (!allPlayers) return;
      for (var j = 0; j < allPlayers.length; j++) {
        var pid2 = allPlayers[j];
        try {
          var hp2    = api.getPlayerHealth(pid2);
          var maxHp2 = api.getPlayerMaxHealth(pid2);
          if (hp2 != null) {
            var changed = (playerHealth[pid2] !== hp2 || playerMaxHealth[pid2] !== maxHp2);
            playerHealth[pid2]    = hp2;
            playerMaxHealth[pid2] = maxHp2;
            if (changed) refreshNametag(pid2);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
};
