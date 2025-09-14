let placeVent = require("erekir-vent-placer/place-vent");

let maxVentsToFind;
let maxDistanceFromPlayer;

Events.on(TapEvent, (player, tile) => {
  let px = player ? player.x : -1.0;
  let py = player ? player.y : -1.0;
  let mx = Core.input.mouseWorldX();
  let my = Core.input.mouseWorldY();
  
  if (px != -1 && py != -1) {
    Vars.ui.hudfrag.showToast(`Player is at (${px},${py})\nMouse is at (${mx},${my})`);
  }
});

Events.on(ClientLoadEvent, () => {
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