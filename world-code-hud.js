onInventoryUpdated = e => {
  let helmet     = api.getItemSlot(e, 46)?.name;
  let chestplate = api.getItemSlot(e, 47)?.name;
  let gauntlets  = api.getItemSlot(e, 48)?.name;
  let leggings   = api.getItemSlot(e, 49)?.name;
  let boots      = api.getItemSlot(e, 50)?.name;

  let selectedSlot = api.getSelectedInventorySlotI(e);
  let heldItem     = api.getItemSlot(e, selectedSlot);

  [
    "HUD_Boots",
    "HUD_Legs",
    "HUD_Gauntlets",
    "HUD_Chest",
    "HUD_Helmet",
    "HUD_Weapon",
    "HUD_Axe",
  ].forEach(x => api.removeEffect(e, x));

  boots      && api.applyEffect(e, "HUD_Boots",     null, { icon: boots,      displayName: " " });
  leggings   && api.applyEffect(e, "HUD_Legs",      null, { icon: leggings,   displayName: " " });
  gauntlets  && api.applyEffect(e, "HUD_Gauntlets", null, { icon: gauntlets,  displayName: " " });
  chestplate && api.applyEffect(e, "HUD_Chest",     null, { icon: chestplate, displayName: " " });
  helmet     && api.applyEffect(e, "HUD_Helmet",    null, { icon: helmet,     displayName: " " });

  if (heldItem) {
    let name = heldItem.name;
    if (
      name.includes("Sword")    ||
      name.includes("Axe")      ||
      name.includes("Bow")      ||
      name.includes("Pickaxe")  ||
      name.includes("Stick")    ||
      name.includes("Spikes")   ||
      name.includes("Net")      ||
      name.includes("Cobweb")   ||
      name.includes("Block")    ||
      name.includes("Potion")   ||  // ← was "nami" (typo fixed)
      name.includes("Crossbow")
    ) {
      api.applyEffect(e, "HUD_Weapon", null, { icon: name, displayName: " " });
    }
  }  // ← this closing brace was missing
};
