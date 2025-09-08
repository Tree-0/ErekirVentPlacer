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
  let btn;
  if (region && region.found && region.found()) {
    const icon = new TextureRegionDrawable(region);
    btn = new ImageButton(icon, Styles.black3);
  } else {
    btn = new TextButton("Run", Styles.cleart);
  }

  // Click handler (sugar over ChangeListener)
  btn.clicked(() => {
    Vars.ui.hudfrag.showToast("Clicked!");
    // TODO: your action
  });

  btnTable.add(btn).size(64).padRight(8);
  btnTable.row();

  // Bottom spacer
  btnTable.add().grow();
});