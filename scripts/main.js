// Load the planner before ClientLoadEvent so its update listener is registered.
var vents = require("place-vents");
var ventCount = 4;
var searchRadius = 50;

function erekirGame(){
    var planet = Vars.state.getPlanet();
    return Vars.state.isGame() && planet !== null && planet.equals(Planets.erekir);
}

function positiveInteger(text){
    var value = Number(String(text));
    return /^\d+$/.test(String(text)) && value > 0 && value <= 2147483647;
}

function queueVents(){
    vents.placeAndWireVents(ventCount, searchRadius, function(result){
        Vars.ui.hudfrag.showToast(result.message);
    });
}

function showVentDialog(){
    if(!erekirGame()) return;

    var dialog = new BaseDialog("Vent settings");
    var countField = new TextField(String(ventCount));
    var radiusField = new TextField(String(searchRadius));
    var status = new Label("");

    countField.setMaxLength(10);
    radiusField.setMaxLength(10);
    dialog.cont.defaults().pad(8);
    dialog.cont.add("Steam vents (k)").left();
    dialog.cont.add(countField).width(160);
    dialog.cont.row();
    dialog.cont.add("Search radius (tiles)").left();
    dialog.cont.add(radiusField).width(160);
    dialog.cont.row();
    dialog.cont.add("The vent button queues condensers and beam nodes using these settings.")
        .colspan(2).width(360).wrap().left();
    dialog.cont.row();
    dialog.cont.add(status).colspan(2).width(360).wrap().left().minHeight(48);

    dialog.buttons.defaults().size(160, 64).pad(4);
    dialog.buttons.button("Cancel", run(function(){ dialog.hide(); }));
    var saveButton = dialog.buttons.button("Save", run(function(){
        if(!erekirGame() || !positiveInteger(countField.getText()) ||
            !positiveInteger(radiusField.getText())) return;

        ventCount = Number(String(countField.getText()));
        searchRadius = Number(String(radiusField.getText()));
        dialog.hide();
    })).get();

    saveButton.update(run(function(){
        var valid = positiveInteger(countField.getText()) && positiveInteger(radiusField.getText());
        saveButton.setDisabled(!erekirGame() || !valid);
        status.setText(valid ? "Search is centered on your player when you queue." :
            "Enter positive whole numbers (up to 2147483647).");
    }));
    dialog.addCloseListener();
    dialog.show();
}

Events.on(ClientLoadEvent, cons(function(){
    var root = new Table();
    root.setFillParent(true);
    root.touchable = Touchable.childrenOnly;
    root.right();

    var region = Core.atlas.find("erekir-vent-placer-turbine-condenser-overlay");
    if(!region.found()) region = Blocks.turbineCondenser.uiIcon;
    var ventIcon = new TextureRegionDrawable(region);
    var settingsButton = new ImageButton(ventIcon, Styles.cleari);
    var queueButton = new ImageButton(ventIcon, Styles.cleari);
    settingsButton.getImageCell().size(32);
    queueButton.getImageCell().size(32);
    settingsButton.clicked(run(showVentDialog));
    queueButton.clicked(run(queueVents));

    // The decorative gear does not intercept clicks on the settings button.
    var gear = new Table();
    gear.top().right();
    gear.touchable = Touchable.disabled;
    gear.add(new Image(Icon.settings)).size(14).padTop(2).padRight(2);
    var settingsIcon = new Stack();
    settingsIcon.add(settingsButton);
    settingsIcon.add(gear);

    function tooltip(button, text){
        button.addListener(new Tooltip(cons(function(table){
            table.background(Styles.black6).add(text).pad(6);
        })));
    }
    tooltip(settingsButton, "Vent settings");
    tooltip(queueButton, "Queue vents");
    var buttons = new Table();
    buttons.add(settingsIcon).size(48).padBottom(4);
    buttons.row();
    buttons.add(queueButton).size(48);
    root.add(buttons).padRight(8);
    root.update(run(function(){
        root.visible = erekirGame();
        queueButton.setDisabled(vents.isBusy() || vents.availability() !== null);
    }));
    Vars.ui.hudGroup.addChild(root);
}));
