struct SimulationParams {
    grid_size: vec2u,
    birth_rule: u32,
    survive_rule: u32,
    alive_color: vec4f,
    dead_color: vec4f,
    view_offset: vec2f,
    view_zoom: f32,
    _pad: u32,
}

@group(0) @binding(0) var<storage, read> input_cells: array<u32>;
@group(0) @binding(1) var<storage, read_write> output_cells: array<u32>;
@group(0) @binding(2) var<uniform> params: SimulationParams;

@compute @workgroup_size(16, 16)
fn compute_main(@builtin(global_invocation_id) global_id: vec3u) {
    if (global_id.x >= params.grid_size.x || global_id.y >= params.grid_size.y) {
        return;
    }

    let x = global_id.x;
    let y = global_id.y;
    let idx = y * params.grid_size.x + x;

    var neighbors = 0u;
    for (var i = -1i; i <= 1i; i++) {
        for (var j = -1i; j <= 1i; j++) {
            if (i == 0i && j == 0i) { continue; }

            let nx = (i32(x) + i + i32(params.grid_size.x)) % i32(params.grid_size.x);
            let ny = (i32(y) + j + i32(params.grid_size.y)) % i32(params.grid_size.y);
            let n_idx = u32(ny) * params.grid_size.x + u32(nx);
            neighbors += input_cells[n_idx];
        }
    }

    let current_state = input_cells[idx];
    var next_state = 0u;

    // Use bitmask for rules
    if (current_state == 1u) {
        if ((params.survive_rule & (1u << neighbors)) != 0u) {
            next_state = 1u;
        }
    } else {
        if ((params.birth_rule & (1u << neighbors)) != 0u) {
            next_state = 1u;
        }
    }

    output_cells[idx] = next_state;
}

// Simple rendering shader
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4f {
    var pos = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
    );
    return vec4f(pos[vertex_index], 0.0, 1.0);
}

@group(0) @binding(0) var<storage, read> cells: array<u32>;
@group(0) @binding(1) var<uniform> render_params: SimulationParams;

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let grid_pos = (pos.xy - render_params.view_offset) / render_params.view_zoom;
    let x = u32(grid_pos.x);
    let y = u32(grid_pos.y);

    if (grid_pos.x < 0.0 || grid_pos.y < 0.0 || x >= render_params.grid_size.x || y >= render_params.grid_size.y) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let idx = y * render_params.grid_size.x + x;
    let state = cells[idx];

    if (state == 1u) {
        return render_params.alive_color;
    } else {
        return render_params.dead_color;
    }
}
