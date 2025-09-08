//require("ErekirVentPlacer/scripts/place-vents")

Events.on(ClientLoadEvent, () => {
    
    const root = new Table();
    root.setDebug(true);
    root.setFillParent(true);
    Vars.ui.hudGroup.addChild(root);

    root.add().grow();

    btnTable = new Table(t => {
        // top spacer
        t.add().grow();
        
        // icon for button
        const region = Core.atlas.find("turbine-condenser-overlay");
        const icon_erekir_turbine = new TextureRegionDrawable(region);
        const ventBtn = new ImageButton(icon_erekir_turbine, Styles.black3);

        // PREFERRED: listen for ChangeEvent (fires when pressed)
        ventBtn.addListener(new ChangeListener({
        changed: (e, a) => {
            Vars.ui.hudfrag.showToast("Clicked!");
            // TODO: do your action
        }
        }));

        t.add(ventBtn).size(64).padRight(8);
        t.row();
        // bottom spacer
        t.add().grow();

    });

    root.add(btnTable).width(100).padRight(8);
});