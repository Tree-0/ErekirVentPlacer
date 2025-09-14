function placeAndWireVents(maxToFind, maxDistanceFromPlayer) {

    // get coordinates of player
    let px = Vars.player.x;
    let py = Vars.player.y;

    const tiles = findClosestVents(maxToFind, maxDistanceFromPlayer);
    placeVents(tiles);
    pathfindWireVents(tiles);
}

// maxToFind:int, maxDistanceFromPlayer:int -> list<tiles>
function findClosestVents(startx, starty, maxToFind, maxDistanceFromPlayer) {
    // only add vents that are unobstructed and
    // within the specified radius of the player

    let openVents = [];
    let tiles = [Vars.world.tiles.get(startx, starty)];
    let found = [];

    // // search tiles that are manhattan distance < 50 away
    // while (tiles) {
    //     tile = tile.pop();
        
    // }
}

// checks if this is the center of a 3x3 vent tile
function isValidVent(x,y) {

}

// tiles: list<tiles> -> void
function placeVents(tiles) {
    
}

// tiles: list<tiles> -> void
function pathfindWireVents(tiles) {

}

// x1: int, x2: int, y1: int, y2: int -> void
function connect_points(x1,x2,y1,y2) {
    // an erekir small node can connect to another small node 10 blocks away
    const max_node_range = 10
}