# 🫀 Bloxd.io Health Indicator Mod

Shows every player's health **above their nametag** in real time — just like the image you shared (number + ❤ heart).

## What it looks like

```
   oFeepo
  [ 20 ❤ ]   ← green when healthy
  [ 12 ❤ ]   ← yellow when hurt  
  [  3 ❤ ]   ← red when critical
```

Colours:
- 🟢 **Green** — above 75% health  
- 🟡 **Yellow** — 35–75% health  
- 🔴 **Red** — below 35% health

---

## Install (2 minutes)

### Step 1 — Install Tampermonkey
- Chrome: https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/

> ⚠️ Use **Tampermonkey Legacy** if the normal version doesn't work

### Step 2 — Install the mod script
1. Click the Tampermonkey icon in your browser toolbar
2. Click **"Create a new script"**
3. Delete all the default code
4. Copy and paste the entire contents of `health-indicator.user.js`
5. Press **Ctrl+S** (or Cmd+S on Mac) to save
6. Done!

### Step 3 — Play
1. Open https://bloxd.io
2. Join any world with other players
3. You'll see health labels appear above every other player's nametag automatically

---

## How it works (technical)

Bloxd.io runs on the **noa-engine** (BabylonJS under the hood). The mod:

1. **Captures the engine** by intercepting `Function.prototype.call` at startup — the same proven method used by all working Bloxd mods. It restores the original immediately after capture so nothing is broken.

2. **Reads player data** each frame:
   - `noa.bloxd.getPlayerIds()` → list of all players in the world
   - `noa.entities.getState(id, 'position')` → their world coordinates
   - `noa.bloxd.client.playerManager` / entity health component → their HP

3. **Projects 3D → 2D** using BabylonJS's `Vector3.Project` (or manual matrix math as fallback) to find where each player's head appears on screen.

4. **Draws an HTML canvas overlay** (`z-index: 9999`, `pointer-events: none`) on top of the game with the health pill rendered above each player.

---

## Notes

- This is a **visual-only** mod — it just reads and displays data, doesn't change any game state
- Works in all Bloxd.io game modes (UHC, SMP, PVP, etc.)
- The label updates every frame so it's always live
- If health data isn't available for a specific player (e.g. in modes without health), their label simply won't appear — no errors
