"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlanner, validateLayout } = require("../scripts/place-vents.js");

function key(x, y) { return x + "," + y; }

function cells(x, y, size) {
    const out = [];
    const offset = Math.floor((size || 1) / 2);
    for (let cy = y - offset; cy < y - offset + size; cy++) {
        for (let cx = x - offset; cx < x - offset + size; cx++) out.push([cx, cy]);
    }
    return out;
}

function makeWorld(options = {}) {
    const occupied = new Map();
    const blocked = new Set();
    const undiscovered = new Set();
    const world = {
        width: options.width || 48,
        height: options.height || 32,
        playerX: options.playerX === undefined ? 8 : options.playerX,
        playerY: options.playerY === undefined ? 16 : options.playerY,
        range: options.range || 10,
        generatorSize: 3,
        vents: options.vents || [],
        reservations: options.reservations || [],
        buildingAt(x, y) { return occupied.get(key(x, y)) || null; },
        canPlace(kind, x, y) {
            return cells(x, y, kind === "generator" ? 3 : 1).every(([cx, cy]) =>
                cx >= 0 && cy >= 0 && cx < this.width && cy < this.height &&
                !occupied.has(key(cx, cy)) && !blocked.has(key(cx, cy)) &&
                !undiscovered.has(key(cx, cy)));
        },
        addBuilding(building) {
            const desc = Object.assign({
                id: "building-" + occupied.size,
                size: 1,
                kind: "other",
                powered: false,
                insulated: false
            }, building);
            cells(desc.x, desc.y, desc.size).forEach(([x, y]) => occupied.set(key(x, y), desc));
            return desc;
        },
        blockRectangle(x1, y1, x2, y2) {
            for (let y = y1; y <= y2; y++) {
                for (let x = x1; x <= x2; x++) blocked.add(key(x, y));
            }
        },
        blocked,
        undiscovered
    };
    (options.buildings || []).forEach(building => world.addBuilding(building));
    return world;
}

function solve(world, k, radius = 60) {
    const planner = createPlanner(world, k, radius);
    let steps = 0;
    while (!planner.done && steps++ < 100000) planner.step(256);
    assert.ok(planner.done, "incremental planner must terminate");
    assert.ok(planner.result, "completed planner exposes a result");
    assert.equal(planner.result.requested, k);
    assert.equal(planner.result.selected, planner.result.generators.length);
    return planner.result;
}

function coordinates(items) { return items.map(item => key(item.x, item.y)).sort(); }

function connected(world, result, count) {
    assert.equal(result.selected, count);
    const validation = validateLayout(world, result);
    assert.equal(validation.valid, true, validation.reason);
    assert.equal(new Set(coordinates(result.nodes)).size, result.nodes.length, "node plans are unique");
}

function basicNode(x, y) {
    return { x, y, size: 1, kind: "node", powered: true, beam: true, range: 10 };
}

function horizontalCorridor(world, y) {
    for (let cy = 0; cy < world.height; cy++) {
        for (let x = 0; x < world.width; x++) {
            const ventFloor = world.vents.some(vent => Math.abs(x - vent.x) <= 1 && Math.abs(cy - vent.y) <= 1);
            if (cy !== y && !ventFloor) world.blocked.add(key(x, cy));
        }
    }
}

test("chooses nearest eligible vents and honors an inclusive Euclidean radius", () => {
    const world = makeWorld({ playerX: 10, playerY: 10, vents: [
        { x: 16, y: 10 }, { x: 14, y: 13 }, { x: 12, y: 10 }, { x: 15, y: 10 }
    ] });
    const result = solve(world, 2, 5);
    connected(world, result, 2);
    assert.deepEqual(coordinates(result.generators), ["12,10", "14,13"]);
});

test("distance ties use deterministic tile position order", () => {
    const world = makeWorld({ playerX: 10, playerY: 10, vents: [
        { x: 10, y: 15 }, { x: 15, y: 10 }, { x: 5, y: 10 }, { x: 10, y: 5 }
    ] });
    assert.deepEqual(coordinates(solve(world, 1, 5).generators), ["5,10"]);
});

test("checks every generator footprint tile for buildings, fog, terrain and map bounds", () => {
    const world = makeWorld({ playerX: 5, playerY: 5, vents: [
        { x: 5, y: 5 }, { x: 9, y: 5 }, { x: 13, y: 5 }, { x: 17, y: 5 }, { x: 0, y: 5 }
    ] });
    world.addBuilding({ x: 4, y: 4 });
    world.undiscovered.add(key(8, 4));
    world.blocked.add(key(12, 4));
    assert.deepEqual(coordinates(solve(world, 4).generators), ["17,5"]);
});

test("queued construction reserves its entire footprint", () => {
    const world = makeWorld({ playerX: 5, playerY: 5, vents: [{ x: 5, y: 5 }, { x: 10, y: 5 }],
        reservations: [{ x: 3, y: 3, size: 3, kind: "other" }] });
    assert.deepEqual(coordinates(solve(world, 2).generators), ["10,5"]);
});

test("a pending demolition also reserves its footprint and cannot be reused", () => {
    const world = makeWorld({ playerX: 5, playerY: 5, vents: [{ x: 5, y: 5 }, { x: 10, y: 5 }],
        reservations: [{ x: 4, y: 4, size: 1, kind: "node", reusable: true, breaking: true }] });
    const result = solve(world, 2);
    connected(world, result, 1);
    assert.deepEqual(coordinates(result.generators), ["10,5"]);
});

test("deduplicates indexed vents and does not overlap selected generator footprints", () => {
    const world = makeWorld({ playerX: 5, playerY: 5, vents: [
        { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 7, y: 5 }, { x: 11, y: 5 }
    ] });
    const result = solve(world, 3);
    assert.equal(result.selected, 2);
    assert.equal(new Set(coordinates(result.generators)).size, 2);
    connected(world, result, 2);
});

test("a single beam node reaches generator footprint edges exactly ten tiles away", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 10 }, { x: 27, y: 10 }] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].x, 16);
    assert.ok(Math.abs(result.nodes[0].y - 10) <= 1);
});

test("a gap one tile beyond the two-sided node range requires another node", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 10 }, { x: 28, y: 10 }] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.ok(result.nodes.length >= 2);
});

test("uses the runtime node range", () => {
    const world = makeWorld({ range: 4, vents: [{ x: 5, y: 10 }, { x: 15, y: 10 }] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].x, 10);
    assert.ok(Math.abs(result.nodes[0].y - 10) <= 1);
});

test("beam endpoints include all three rows of a generator footprint", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 5 }, { x: 17, y: 7 }] });
    horizontalCorridor(world, 6);
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].y, 6);
});

test("directly adjacent generators need no beam nodes", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 5 }, { x: 8, y: 5 }] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.equal(result.nodes.length, 0);
});

test("routes a cardinal turn between diagonally separated generators", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 5 }, { x: 25, y: 25 }] });
    connected(world, solve(world, 2), 2);
});

test("beams cross terrain that cannot host a node when the gap is within range", () => {
    const world = makeWorld({ width: 36, height: 23, vents: [{ x: 5, y: 10 }, { x: 29, y: 10 }] });
    world.blockRectangle(12, 0, 18, 22);
    connected(world, solve(world, 2), 2);
});

test("does not cross an unplaceable terrain gap wider than node range", () => {
    const world = makeWorld({ width: 36, height: 23, vents: [{ x: 5, y: 10 }, { x: 29, y: 10 }] });
    world.blockRectangle(12, 0, 24, 22);
    const result = solve(world, 2);
    connected(world, result, 1);
});

test("goes around a wide terrain barrier when the routing area permits it", () => {
    const world = makeWorld({ vents: [{ x: 8, y: 16 }, { x: 40, y: 16 }] });
    world.blockRectangle(18, 6, 31, 25);
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.ok(result.nodes.some(node => node.y < 6 || node.y > 25));
});

test("keeps detours within the radius square expanded by one node range", () => {
    const world = makeWorld({ width: 60, height: 60, playerX: 20, playerY: 30,
        vents: [{ x: 8, y: 30 }, { x: 32, y: 30 }] });
    world.blockRectangle(18, 0, 28, 54);
    connected(world, solve(world, 2, 12), 1);
    connected(world, solve(world, 2, 30), 2);
});

test("ordinary unpowered buildings do not block a beam", () => {
    const world = makeWorld({ width: 36, height: 23, vents: [{ x: 5, y: 10 }, { x: 29, y: 10 }] });
    for (let y = 0; y < world.height; y++) world.addBuilding({ x: 16, y });
    connected(world, solve(world, 2), 2);
});

test("insulation stops beam links even where intervening terrain is bridgeable", () => {
    const world = makeWorld({ width: 36, height: 23, vents: [{ x: 5, y: 10 }, { x: 29, y: 10 }] });
    for (let y = 0; y < world.height; y++) world.addBuilding({ x: 16, y, insulated: true });
    connected(world, solve(world, 2), 1);
});

test("does not use unrelated powered machinery as a path through a confined corridor", () => {
    const world = makeWorld({ width: 36, height: 23, vents: [{ x: 5, y: 10 }, { x: 29, y: 10 }] });
    horizontalCorridor(world, 10);
    world.addBuilding({ x: 16, y: 10, powered: true });
    connected(world, solve(world, 2), 1);
});

test("detours around a friendly powered building in an open area", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 10 }, { x: 29, y: 10 }] });
    world.addBuilding({ x: 16, y: 10, size: 3, powered: true });
    connected(world, solve(world, 2), 2);
});

test("reuses basic nodes whose centers are exactly one runtime range apart", () => {
    const world = makeWorld({ vents: [{ x: 3, y: 10 }, { x: 17, y: 10 }],
        buildings: [basicNode(5, 10), basicNode(15, 10)] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.equal(world.canPlace("node", 5, 10), false, "a built node occupies its own site");
    assert.equal(result.nodes.length, 0);
});

test("adds a node when existing basic nodes are more than one range apart", () => {
    const world = makeWorld({ vents: [{ x: 3, y: 10 }, { x: 18, y: 10 }],
        buildings: [basicNode(5, 10), basicNode(16, 10)] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.ok(result.nodes.length >= 1);
});

test("reuses compatible queued basic nodes without duplicating them", () => {
    const world = makeWorld({ vents: [{ x: 3, y: 10 }, { x: 17, y: 10 }],
        reservations: [
            { x: 5, y: 10, size: 1, kind: "node", reusable: true },
            { x: 15, y: 10, size: 1, kind: "node", reusable: true }
        ] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.equal(result.nodes.length, 0);
});

test("validation rejects a reused queued node whose site was occupied by an unrelated building", () => {
    const world = makeWorld({ vents: [{ x: 3, y: 10 }, { x: 17, y: 10 }],
        reservations: [
            { x: 5, y: 10, size: 1, kind: "node", reusable: true },
            { x: 15, y: 10, size: 1, kind: "node", reusable: true }
        ] });
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.equal(result.nodes.length, 0);
    world.addBuilding({ x: 15, y: 10 });
    assert.equal(validateLayout(world, result).valid, false);
});

test("validation rejects a reused queued node whose site is no longer buildable", () => {
    const world = makeWorld({ vents: [{ x: 3, y: 10 }, { x: 17, y: 10 }],
        reservations: [
            { x: 5, y: 10, size: 1, kind: "node", reusable: true },
            { x: 15, y: 10, size: 1, kind: "node", reusable: true }
        ] });
    const result = solve(world, 2);
    connected(world, result, 2);
    world.blocked.add(key(15, 10));
    assert.equal(validateLayout(world, result).valid, false);
});

test("validation accepts a reused queued node completed into a compatible built node", () => {
    const world = makeWorld({ vents: [{ x: 3, y: 10 }, { x: 17, y: 10 }],
        reservations: [
            { x: 5, y: 10, size: 1, kind: "node", reusable: true },
            { x: 15, y: 10, size: 1, kind: "node", reusable: true }
        ] });
    const result = solve(world, 2);
    world.addBuilding(basicNode(15, 10));
    assert.equal(world.canPlace("node", 15, 10), false);
    assert.equal(validateLayout(world, result).valid, true);
});

test("protects the full ray of an existing longer-range tower", () => {
    const world = makeWorld({ playerX: 22, playerY: 12, vents: [{ x: 22, y: 12 }, { x: 22, y: 22 }],
        buildings: [
            { x: 12, y: 12, size: 3, kind: "other", beam: true, powered: true, range: 25 },
            basicNode(35, 12)
        ] });
    const result = solve(world, 1);
    connected(world, result, 1);
    assert.deepEqual(coordinates(result.generators), ["22,22"]);
});

test("protects the future ray of a queued longer-range tower", () => {
    const world = makeWorld({ playerX: 22, playerY: 12, vents: [{ x: 22, y: 12 }, { x: 22, y: 22 }],
        reservations: [{ x: 12, y: 12, size: 3, kind: "other", beam: true, powered: true,
            range: 25, planned: true }], buildings: [basicNode(35, 12)] });
    const result = solve(world, 1);
    connected(world, result, 1);
    assert.deepEqual(coordinates(result.generators), ["22,22"]);
});

test("retries seeds when the nearest vent is isolated from a farther connected group", () => {
    const world = makeWorld({ playerX: 8, playerY: 12, vents: [
        { x: 8, y: 12 }, { x: 28, y: 12 }, { x: 33, y: 12 }
    ] });
    for (let y = 10; y <= 14; y++) {
        for (let x = 6; x <= 10; x++) {
            if (x === 6 || x === 10 || y === 10 || y === 14) world.addBuilding({ x, y, insulated: true });
        }
    }
    const result = solve(world, 2);
    connected(world, result, 2);
    assert.deepEqual(coordinates(result.generators), ["28,12", "33,12"]);
});

test("keeps the largest connected trial when fewer than k vents can connect", () => {
    const world = makeWorld({ width: 46, height: 23, playerX: 5, playerY: 10, vents: [
        { x: 5, y: 10 }, { x: 27, y: 10 }, { x: 32, y: 10 }, { x: 39, y: 10 }
    ] });
    world.blockRectangle(12, 0, 24, 22);
    const result = solve(world, 4);
    connected(world, result, 3);
    assert.deepEqual(coordinates(result.generators), ["27,10", "32,10", "39,10"]);
});

test("a repeated activation excludes generators already in the build queue", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 10 }, { x: 27, y: 10 }] });
    const first = solve(world, 2);
    world.reservations = first.generators.map(item => Object.assign({ kind: "generator" }, item))
        .concat(first.nodes.map(item => Object.assign({ kind: "node", reusable: true }, item)));
    const second = solve(world, 2);
    assert.equal(second.selected, 0);
    assert.equal(second.nodes.length, 0);
});

test("validation rejects a newly occupied generator footprint", () => {
    const world = makeWorld({ vents: [{ x: 10, y: 10 }] });
    const result = solve(world, 1);
    assert.equal(validateLayout(world, result).valid, true);
    world.addBuilding({ x: 9, y: 9 });
    assert.equal(validateLayout(world, result).valid, false);
});

test("validation rejects a newly queued footprint conflict", () => {
    const world = makeWorld({ vents: [{ x: 10, y: 10 }] });
    const result = solve(world, 1);
    world.reservations.push({ x: 9, y: 9, size: 1, kind: "other" });
    assert.equal(validateLayout(world, result).valid, false);
});

test("validation simulates current beam connectivity and rejects a new insulated blocker", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 10 }, { x: 27, y: 10 }] });
    const result = solve(world, 2);
    connected(world, result, 2);
    world.addBuilding({ x: 10, y: result.nodes[0].y, insulated: true });
    assert.equal(validateLayout(world, result).valid, false);
});

test("validation rejects malformed layouts outside the map or with overlapping footprints", () => {
    const world = makeWorld({ vents: [{ x: 10, y: 10 }] });
    const result = solve(world, 1);
    const outside = Object.assign({}, result, { nodes: [basicNode(-1, 10)] });
    const overlappingNode = Object.assign({}, result, { nodes: [basicNode(9, 9)] });
    const overlappingGenerator = Object.assign({}, result, {
        generators: result.generators.concat(Object.assign({}, result.generators[0], { x: 11 }))
    });
    assert.equal(validateLayout(world, outside).valid, false);
    assert.equal(validateLayout(world, overlappingNode).valid, false);
    assert.equal(validateLayout(world, overlappingGenerator).valid, false);
});

test("planning is incremental and eventually returns a validated result", () => {
    const world = makeWorld({ vents: [{ x: 5, y: 5 }, { x: 35, y: 25 }] });
    const planner = createPlanner(world, 2, 60);
    planner.step(1);
    assert.equal(planner.done, false);
    let steps = 0;
    while (!planner.done && steps++ < 100000) planner.step(64);
    assert.ok(planner.done);
    connected(world, planner.result, 2);
});
