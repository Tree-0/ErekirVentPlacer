let placeVent = require("erekir-vent-placer/place-vent");
Vars.ui.hudfrag.showToast("Erekir Vent Placer installed...");

let px; let py; let mx; let my;
let maxVentsToFind;
let maxDistanceFromPlayer;

Events.on(ClientLoadEvent, () => {
  Vars.ui.hudfrag.showToast("Vent UI loading...");

  const root = new Table();
  root.setFillParent(true);
  Vars.ui.hudGroup.addChild(root);

  // Left spacer eats horizontal space
  root.add().grow();

  // Right column that will vertically center the button using spacers
  const btnTable = new Table();
  root.add(btnTable).width(100).padRight(8);

  // Top spacer
  btnTable.add().grow();
  btnTable.row();

  // Build the button (icon if found, otherwise text)
  const region = Core.atlas.find("erekir-vent-placer-turbine-condenser-overlay");
  let ventBtn;
  if (region && region.found && region.found()) {
    const icon = new TextureRegionDrawable(region);
    ventBtn = new ImageButton(icon, Styles.black3);
  } else {
    Vars.ui.hudfrag.showToast("Vent icon not found...");
    ventBtn = new TextButton("PlaceVents", Styles.black3);
  }

  // vent placer
  ventBtn.clicked(() => {
    Vars.ui.hudfrag.showToast(`Clicked`);
    maxVentsToFind = 4;
    maxDistanceFromPlayer = 50;
    //placeVent.placeAndWireVents(maxVentsToFind, maxDistanceFromPlayer);
  });

  btnTable.add(ventBtn).size(64).padRight(8);
  btnTable.row();

  // Bottom spacer
  btnTable.add().grow();
});

// Events.on(TapEvent, (player, tile) => {
//   pu = player?.unit()
//   px = pu ? player.x : -1.0;
//   py = pu ? player.y : -1.0;
//   mx = Core.input.mouseWorldX();
//   my = Core.input.mouseWorldY();
  
//   if (px != -1 && py != -1) {
//     Vars.ui.hudfrag.showToast(`Player is at (${px},${py})\nMouse is at (${mx},${my})`);
//   }
// });