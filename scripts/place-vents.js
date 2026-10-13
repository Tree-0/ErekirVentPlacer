// Incremental, dependency-free tile planner. Game integration is below.
var directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function key(x, y) { return x + "," + y; }
function dictionary() { return Object.create(null); }
function footprint(block, visit) {
    var offset = -Math.floor((block.size - 1) / 2);
    for (var dx = 0; dx < block.size; dx++) {
        for (var dy = 0; dy < block.size; dy++) visit(block.x + offset + dx, block.y + offset + dy);
    }
}
function overlaps(a, b) {
    var ax = a.x - Math.floor((a.size - 1) / 2), ay = a.y - Math.floor((a.size - 1) / 2);
    var bx = b.x - Math.floor((b.size - 1) / 2), by = b.y - Math.floor((b.size - 1) / 2);
    return ax < bx + b.size && bx < ax + a.size && ay < by + b.size && by < ay + a.size;
}
function adjacent(a, b) {
    var ax = a.x - Math.floor((a.size - 1) / 2), ay = a.y - Math.floor((a.size - 1) / 2);
    var bx = b.x - Math.floor((b.size - 1) / 2), by = b.y - Math.floor((b.size - 1) / 2);
    return ((ax + a.size === bx || bx + b.size === ax) && ay < by + b.size && by < ay + a.size) ||
        ((ay + a.size === by || by + b.size === ay) && ax < bx + b.size && bx < ax + a.size);
}
function descriptor(kind, x, y, size, range) {
    return {x: x, y: y, size: size, kind: kind, powered: true, beam: kind === "node", range: range};
}
function context(world) {
    var queued = dictionary(), reservations = world.reservations || [];
    reservations.forEach(function(plan) {
        if (!plan.breaking && (plan.planned || plan.reusable)) {
            var block = descriptor(plan.kind || "other", plan.x, plan.y, plan.size, plan.range || world.range);
            block.powered = plan.powered !== undefined ? plan.powered : plan.kind === "node" || plan.kind === "generator";
            block.insulated = !!plan.insulated;
            block.beam = !!plan.beam || plan.kind === "node";
            footprint(block, function(x, y) { queued[key(x, y)] = block; });
        }
    });
    return {
        world: world, reservations: reservations, queued: queued, staged: dictionary(),
        at: function(x, y) { return this.staged[key(x, y)] || queued[key(x, y)] || world.buildingAt(x, y); },
        reserved: function(block, reuse) {
            return reservations.some(function(plan) {
                if (reuse && plan.reusable && !plan.breaking && plan.kind === "node" &&
                    plan.x === block.x && plan.y === block.y && plan.size === 1) return false;
                return overlaps(block, plan);
            });
        }
    };
}
function stage(ctx, layout, extra) {
    ctx.staged = dictionary();
    layout.generators.concat(layout.nodes, extra ? [extra] : []).forEach(function(block) {
        footprint(block, function(x, y) { ctx.staged[key(x, y)] = block; });
    });
}
function basicNode(block, world) {
    return block && block.kind === "node" && block.size === 1 && block.powered && block.beam && block.range === world.range;
}
function ray(ctx, node, direction, visit) {
    var offset = Math.floor(node.size / 2), range = node.range || ctx.world.range;
    for (var distance = offset + 1; distance <= range + offset; distance++) {
        var x = node.x + direction[0] * distance, y = node.y + direction[1] * distance;
        if (x < 0 || y < 0 || x >= ctx.world.width || y >= ctx.world.height) break;
        var block = ctx.at(x, y);
        if (block && block.insulated) break;
        if (visit(x, y, block) === false) break;
        if (block && block.powered) break;
    }
}
function protectBeam(ctx, beam, mask) {
    if (!beam.beam || beam.range <= ctx.world.range) return;
    directions.forEach(function(direction) {
        var cells = [], linked = false;
        ray(ctx, beam, direction, function(x, y, block) {
            cells.push(key(x, y));
            if (block && block.powered) linked = true;
        });
        if (linked) cells.forEach(function(cell) { mask[cell] = true; });
    });
}
function blockedFootprint(block, mask) {
    var blocked = false;
    footprint(block, function(x, y) { if (mask[key(x, y)]) blocked = true; });
    return blocked;
}
function emptyFootprint(ctx, block) {
    var empty = true;
    footprint(block, function(x, y) { if (ctx.at(x, y)) empty = false; });
    return empty;
}
function beamsInWorld(ctx) {
    if (ctx.world.beams) return ctx.world.beams;
    var beams = [], seen = dictionary();
    for (var y = 0; y < ctx.world.height; y++) {
        for (var x = 0; x < ctx.world.width; x++) {
            var block = ctx.at(x, y);
            if (block && block.beam && !seen[key(block.x, block.y)]) {
                seen[key(block.x, block.y)] = true; beams.push(block);
            }
        }
    }
    return beams;
}
function validateWithContext(ctx, layout, protectedCells) {
    ctx.staged = dictionary();
    var proposed = layout.generators.concat(layout.nodes), seen = dictionary();
    for (var i = 0; i < proposed.length; i++) {
        var block = proposed[i];
        if (!ctx.world.canPlace(block.kind, block.x, block.y) || ctx.reserved(block, false) ||
            !emptyFootprint(ctx, block) || blockedFootprint(block, protectedCells)) {
            return {valid: false, reason: "A proposed footprint is no longer available."};
        }
        var duplicate = false;
        footprint(block, function(x, y) { if (seen[key(x, y)]) duplicate = true; seen[key(x, y)] = true; });
        if (duplicate) return {valid: false, reason: "Proposed footprints overlap."};
    }
    var reused = layout.reusedNodes || [];
    for (var r = 0; r < reused.length; r++) {
        var existing = ctx.at(reused[r].x, reused[r].y);
        var actual = ctx.world.buildingAt(reused[r].x, reused[r].y);
        // A queued node is usable only if it can still be constructed. The
        // future overlay must not hide a new obstruction at its anchor.
        if (!basicNode(existing, ctx.world) || ctx.reserved(existing, true) ||
            (!basicNode(actual, ctx.world) && !ctx.world.canPlace("node", reused[r].x, reused[r].y))) {
            return {valid: false, reason: "A reused beam node is no longer available."};
        }
    }
    stage(ctx, layout);
    var parent = dictionary();
    function find(id) {
        if (!parent[id]) parent[id] = id;
        while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; }
        return id;
    }
    function join(a, b) { parent[find(key(a.x, a.y))] = find(key(b.x, b.y)); }
    var conductors = proposed.concat(reused.map(function(point) { return ctx.at(point.x, point.y); }));
    conductors.forEach(function(block) {
        find(key(block.x, block.y));
        if (block.beam) directions.forEach(function(direction) {
            ray(ctx, block, direction, function(x, y, other) { if (other && other.powered) join(block, other); });
        });
    });
    // These two vanilla blocks conduct through side adjacency.
    for (var a = 0; a < conductors.length; a++) {
        for (var b = a + 1; b < conductors.length; b++) {
            if (adjacent(conductors[a], conductors[b])) join(conductors[a], conductors[b]);
        }
    }
    var generators = layout.generators;
    if (generators.length && generators.some(function(generator) {
        return find(key(generator.x, generator.y)) !== find(key(generators[0].x, generators[0].y));
    })) return {valid: false, reason: "The generators no longer share a connected beam network."};
    return {valid: true};
}
function validateLayout(world, layout) {
    var ctx = context(world), protectedCells = dictionary();
    beamsInWorld(ctx).forEach(function(beam) { protectBeam(ctx, beam, protectedCells); });
    return validateWithContext(ctx, layout, protectedCells);
}

function createPlanner(world, requested, radius) {
    var ctx = context(world), protectedCells = dictionary(), ventCells = dictionary(), candidates = [];
    var bounds = {minX: Math.max(0, Math.floor(world.playerX - radius - world.range)),
        maxX: Math.min(world.width - 1, Math.ceil(world.playerX + radius + world.range)),
        minY: Math.max(0, Math.floor(world.playerY - radius - world.range)),
        maxY: Math.min(world.height - 1, Math.ceil(world.playerY + radius + world.range))};
    var beams = world.beams ? world.beams.slice() : [], beamSeen = dictionary(), cursor = 0, ventIndex = 0;
    var phase = world.beams ? "protect" : "scan", seed = 0, candidateIndex = 0, trial = null, best = null, search = null;
    var nodeCache = dictionary();
    var job = {done: false, result: null, step: step};
    function inBounds(x, y) { return x >= bounds.minX && y >= bounds.minY && x <= bounds.maxX && y <= bounds.maxY; }
    function option(x, y) {
        var id = key(x, y), current = ctx.staged[id];
        if (!inBounds(x, y)) return null;
        if (current) return current.kind === "node" ? {block: current, reused: false} : null;
        if (Object.prototype.hasOwnProperty.call(nodeCache, id)) return nodeCache[id];
        var block = ctx.at(x, y), result = null;
        if (basicNode(block, world) && !ctx.reserved(block, true) &&
            (!ctx.queued[id] || basicNode(world.buildingAt(x, y), world) || world.canPlace("node", x, y))) {
            result = {block: block, reused: true};
        }
        else if (!block && !ventCells[id] && !protectedCells[id]) {
            var node = descriptor("node", x, y, 1, world.range);
            if (!ctx.reserved(node, false) && world.canPlace("node", x, y)) result = {block: node, reused: false};
        }
        nodeCache[id] = result;
        return result;
    }
    function network() {
        var ids = dictionary();
        trial.generators.concat(trial.nodes, trial.reusedNodes).forEach(function(block) { ids[key(block.x, block.y)] = true; });
        return ids;
    }
    function startSearch(generator) {
        stage(ctx, trial, generator);
        // Zero-cost reuse, unit-cost new nodes: breadth-first cost buckets.
        var state = {generator: generator, queues: [[]], cost: 0, head: 0, visited: dictionary(), network: network()};
        function enqueue(x, y, parent) {
            var id = key(x, y), node = option(x, y);
            if (!node) return;
            var cost = (parent ? parent.cost : 0) + (node.reused || state.network[id] ? 0 : 1);
            if (Object.prototype.hasOwnProperty.call(state.visited, id) && state.visited[id] <= cost) return;
            state.visited[id] = cost;
            if (!state.queues[cost]) state.queues[cost] = [];
            state.queues[cost].push({node: node, parent: parent, cost: cost});
        }
        state.enqueue = enqueue;
        var offset = Math.floor(generator.size / 2);
        directions.forEach(function(direction) {
            for (var port = 0; port <= 2 * offset; port++) {
                var lane = port === 0 ? 0 : (port % 2 ? -Math.ceil(port / 2) : port / 2);
                for (var distance = 1; distance <= world.range; distance++) {
                    var x = generator.x + direction[0] * (offset + distance) + direction[1] * lane;
                    var y = generator.y + direction[1] * (offset + distance) + direction[0] * lane;
                    var node = option(x, y), hit = false;
                    if (!node) continue;
                    ray(ctx, node.block, [-direction[0], -direction[1]], function(rx, ry, other) {
                        if (other && other.powered && key(other.x, other.y) === key(generator.x, generator.y)) hit = true;
                    });
                    if (hit) enqueue(x, y, null);
                }
            }
        });
        return state;
    }
    function accept(generator, path) {
        var oldNodes = trial.nodes.length, oldReused = trial.reusedNodes.length;
        var ids = network();
        trial.generators.push(generator);
        path.forEach(function(entry) {
            var id = key(entry.node.block.x, entry.node.block.y);
            if (!ids[id]) {
                (entry.node.reused ? trial.reusedNodes : trial.nodes).push(entry.node.block);
                ids[id] = true;
            }
        });
        var validation = validateWithContext(ctx, trial, protectedCells);
        if (!validation.valid) {
            trial.generators.pop(); trial.nodes.length = oldNodes; trial.reusedNodes.length = oldReused;
        }
        stage(ctx, trial);
    }
    function expandSearch() {
        while (search.cost < search.queues.length && (!search.queues[search.cost] || search.head >= search.queues[search.cost].length)) {
            search.cost++; search.head = 0;
        }
        if (search.cost >= search.queues.length) { search = null; phase = "trial"; return; }
        var entry = search.queues[search.cost][search.head++], block = entry.node.block;
        if (search.visited[key(block.x, block.y)] < entry.cost) return;
        var found = !!search.network[key(block.x, block.y)];
        directions.forEach(function(direction) {
            if (found) return;
            ray(ctx, block, direction, function(x, y, other) {
                if (found) return false;
                if (other && other.powered) {
                    if (search.network[key(other.x, other.y)]) found = true;
                    else if (basicNode(other, world)) search.enqueue(other.x, other.y, entry);
                } else search.enqueue(x, y, entry);
            });
        });
        if (found) {
            var path = [], parent = entry;
            while (parent) { path.push(parent); parent = parent.parent; }
            accept(search.generator, path.reverse()); search = null; phase = "trial";
        }
    }
    function preferable(layout, previous) {
        if (!previous || layout.generators.length !== previous.generators.length) return !previous || layout.generators.length > previous.generators.length;
        var ranks = layout.generators.map(function(g) { return g.rank; }).sort(function(a, b) { return a - b; });
        var oldRanks = previous.generators.map(function(g) { return g.rank; }).sort(function(a, b) { return a - b; });
        for (var i = 0; i < ranks.length; i++) if (ranks[i] !== oldRanks[i]) return ranks[i] < oldRanks[i];
        return false;
    }
    function finish() {
        job.done = true;
        job.result = best || {generators: [], nodes: [], reusedNodes: []};
        job.result.selected = job.result.generators.length;
        job.result.requested = requested;
        job.result.eligible = candidates.length;
        job.result.bounds = bounds;
    }
    function advanceTrial() {
        if (!trial) {
            if (seed >= candidates.length) { finish(); return; }
            trial = {generators: [candidates[seed]], nodes: [], reusedNodes: []};
            candidateIndex = 0; stage(ctx, trial);
        }
        if (trial.generators.length >= requested || candidateIndex >= candidates.length) {
            if (preferable(trial, best)) best = trial;
            if (trial.generators.length >= requested) { finish(); return; }
            trial = null; seed++; return;
        }
        var generator = candidates[candidateIndex++];
        if (generator === candidates[seed]) return;
        var connected = trial.generators.concat(trial.nodes, trial.reusedNodes).some(function(block) { return adjacent(generator, block); });
        if (connected) accept(generator, []);
        else { search = startSearch(generator); phase = "search"; }
    }
    function step(maxStates, deadline) {
        var count = 0;
        while (!job.done && count++ < (maxStates || 256) && (!deadline || Date.now() < deadline)) {
            if (phase === "scan") {
                if (cursor >= world.width * world.height) { cursor = 0; phase = "protect"; continue; }
                var block = ctx.at(cursor % world.width, Math.floor(cursor / world.width)); cursor++;
                if (block && block.beam && !beamSeen[key(block.x, block.y)]) {
                    beams.push(block); beamSeen[key(block.x, block.y)] = true;
                }
            } else if (phase === "protect") {
                if (cursor < beams.length) protectBeam(ctx, beams[cursor++], protectedCells);
                else phase = "vents";
            } else if (phase === "vents") {
                if (ventIndex < world.vents.length) {
                    var vent = world.vents[ventIndex++], generator = descriptor("generator", vent.x, vent.y, world.generatorSize || 3);
                    footprint(generator, function(x, y) { ventCells[key(x, y)] = true; });
                    var dx = vent.x - world.playerX, dy = vent.y - world.playerY;
                    if (dx * dx + dy * dy <= radius * radius && world.canPlace("generator", vent.x, vent.y) &&
                        !ctx.reserved(generator, false) && emptyFootprint(ctx, generator) && !blockedFootprint(generator, protectedCells)) {
                        generator.distance = dx * dx + dy * dy; candidates.push(generator);
                    }
                } else {
                    candidates.sort(function(a, b) { return a.distance - b.distance || a.x - b.x || a.y - b.y; });
                    // Custom maps may index overlapping 3x3 vent-center entries.
                    var nonoverlapping = [];
                    candidates.forEach(function(g) {
                        if (!nonoverlapping.some(function(other) { return overlaps(g, other); })) nonoverlapping.push(g);
                    });
                    candidates = nonoverlapping;
                    candidates.forEach(function(g, index) { g.rank = index; }); phase = "trial";
                }
            } else if (phase === "trial") advanceTrial();
            else expandSearch();
        }
        return job.done;
    }
    return job;
}

// Mindustry v160.7 adapter. Node tests can load the module without game globals.
var activeJob = null, generation = 0;
function availability() {
    if (typeof Vars === "undefined" || !Vars.state.isGame() || !Vars.state.getPlanet() ||
        !Vars.state.getPlanet().equals(Planets.erekir)) return "Vent placement is available only on Erekir.";
    if (!Vars.player || Vars.player.dead() || !Vars.player.isBuilder()) return "A living builder unit is required.";
    var blocks = [Blocks.turbineCondenser, Blocks.beamNode];
    for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        if (!block.unlockedNowHost() || !block.placeablePlayer || !block.environmentBuildable() ||
            !block.supportsEnv(Vars.state.rules.env) || !block.isPlaceable()) return "Turbine condensers and beam nodes must be available to build.";
    }
    return null;
}
function eachSequence(sequence, visit) {
    if (sequence) for (var i = 0; i < sequence.size; i++) visit(sequence.get(i));
}
function snapshot() {
    var player = Vars.player, team = player.team(), unit = player.unit(), reservations = [], queuedBeams = [];
    function blockDescriptor(block, x, y, friendly, insulated) {
        var beam = block instanceof BeamNode;
        return {x: x, y: y, size: block.size, kind: block === Blocks.beamNode ? "node" : block === Blocks.turbineCondenser ? "generator" : "other",
            powered: friendly && block.hasPower && block.connectedPower && !(block instanceof PowerNode),
            insulated: insulated, beam: beam && friendly, range: beam ? block.range : 0};
    }
    function reserve(plan, committed) {
        var tile = Vars.world.tile(plan.x, plan.y), block = plan.block;
        if (plan.breaking && tile) block = tile.block();
        if (!block) return;
        var entry = blockDescriptor(block, plan.x, plan.y, true, block.insulated);
        if (plan.breaking && tile && tile.build) { entry.x = tile.build.tileX(); entry.y = tile.build.tileY(); }
        entry.breaking = plan.breaking; entry.planned = committed && !plan.breaking;
        entry.reusable = entry.planned && block === Blocks.beamNode;
        reservations.push(entry);
        if (entry.planned && entry.beam) queuedBeams.push(entry);
    }
    eachSequence(unit.plans, function(plan) { reserve(plan, true); });
    eachSequence(Vars.control.input.selectPlans, function(plan) { reserve(plan, false); });
    eachSequence(Vars.control.input.linePlans, function(plan) { reserve(plan, false); });
    var vents = [], beams = queuedBeams, cache = dictionary(), buildingCache = dictionary();
    eachSequence(Vars.indexer.getFlaggedFloors(BlockFlag.steamVent), function(tile) { vents.push({x: tile.x, y: tile.y}); });
    // Towers outside the route rectangle can emit long beams into it.
    Groups.build.each(cons(function(building) {
        if (building.team === team && building.block instanceof BeamNode) {
            beams.push(blockDescriptor(building.block, building.tileX(), building.tileY(), true, building.isInsulated()));
        }
    }));
    return {
        width: Vars.world.width(), height: Vars.world.height(), playerX: player.x / Vars.tilesize, playerY: player.y / Vars.tilesize,
        range: Blocks.beamNode.range, generatorSize: Blocks.turbineCondenser.size, vents: vents, reservations: reservations, beams: beams,
        buildingAt: function(x, y) {
            var id = key(x, y);
            if (Object.prototype.hasOwnProperty.call(cache, id)) return cache[id];
            var tile = Vars.world.tile(x, y), building = tile ? tile.build : null, result = null;
            if (building) {
                var center = key(building.tileX(), building.tileY());
                result = buildingCache[center];
                if (!result) {
                    result = blockDescriptor(building.block, building.tileX(), building.tileY(), building.team === team, building.isInsulated());
                    buildingCache[center] = result;
                }
            }
            cache[id] = result; return result;
        },
        canPlace: function(kind, x, y) {
            var block = kind === "generator" ? Blocks.turbineCondenser : Blocks.beamNode;
            return Build.validPlaceIgnoreUnits(block, team, x, y, 0, true, true);
        }
    };
}
function complete(result) {
    var callback = activeJob.callback; activeJob = null;
    callback(result);
}
function updateJob() {
    if (!activeJob) return;
    try {
        if (activeJob.generation !== generation || availability() || Vars.player.unit().id !== activeJob.unitId ||
            Vars.player.team().id !== activeJob.teamId) {
            complete({ok: false, cancelled: true, message: "Vent planning cancelled because the world, unit, or team changed."}); return;
        }
        if (!activeJob.planner.step(256, Date.now() + 3)) return;
        var result = activeJob.planner.result;
        if (!result.selected) { complete({ok: false, message: "No available steam vents within the search radius."}); return; }
        var fresh = snapshot(), validation = validateLayout(fresh, result);
        if (!validation.valid) { complete({ok: false, message: "The world or build plans changed; nothing was queued. " + validation.reason}); return; }
        var plans = result.generators.concat(result.nodes).map(function(point) {
            var block = point.kind === "generator" ? Blocks.turbineCondenser : Blocks.beamNode;
            var plan = new BuildPlan(point.x, point.y, 0, block); block.onNewPlan(plan); return plan;
        });
        var unit = Vars.player.unit();
        plans.forEach(function(plan) { unit.addBuild(plan, true); });
        var message = "Queued " + result.selected + "/" + result.requested + " vents and " + result.nodes.length + " beam nodes.";
        if (result.selected < result.requested) message += " Shortfall: fewer eligible vents or no route found within the routing area.";
        complete({ok: true, message: message, selected: result.selected, requested: result.requested,
            queuedGenerators: result.generators.length, queuedNodes: result.nodes.length});
    } catch (error) {
        Log.err("Erekir Vent Placer: @", String(error));
        if (activeJob) complete({ok: false, message: "Vent planning failed: " + String(error)});
    }
}
function placeAndWireVents(k, radiusTiles, onComplete) {
    var callback = onComplete || function(result) { Vars.ui.hudfrag.showToast(result.message); };
    var error = availability();
    if (activeJob) error = "Vent planning is already in progress.";
    if (!isFinite(k) || Math.floor(k) !== k || k <= 0 || !isFinite(radiusTiles) ||
        Math.floor(radiusTiles) !== radiusTiles || radiusTiles <= 0) error = "Vent count and radius must be positive integers.";
    if (error) { callback({ok: false, message: error}); return false; }
    try {
        activeJob = {planner: createPlanner(snapshot(), k, radiusTiles), callback: callback,
            generation: generation, unitId: Vars.player.unit().id, teamId: Vars.player.team().id};
        return true;
    } catch (failure) {
        activeJob = null; callback({ok: false, message: "Cannot start vent planning: " + String(failure)}); return false;
    }
}
if (typeof Vars !== "undefined") {
    Events.run(Trigger.update, run(updateJob));
    Events.on(WorldLoadBeginEvent, cons(function() { generation++; }));
    Events.on(ResetEvent, cons(function() { generation++; }));
}
module.exports = {createPlanner: createPlanner, validateLayout: validateLayout, placeAndWireVents: placeAndWireVents,
    availability: availability, isBusy: function() { return activeJob !== null; }};
