//require("ErekirVentPlacer/scripts/place-vents")

Events.on(ClientLoadEvent, () => {
    const table = new Table();
    table.setFillParent(true);
    table.right().center();

    const btn = table.button("Run", Styles.cleart, () => {
        // Script calls here
        Vars.ui.hudfrag.showToast("clicked");
    }).size(48).get();

    Vars.ui.hudGroup.addChild(table);
})