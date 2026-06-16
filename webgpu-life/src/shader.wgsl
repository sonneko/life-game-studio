@group(0) @binding(0) var<storage, read> input_cells: array<u32>;
@group(0) @binding(1) var<storage, read_write> output_cells: array<u32>;
@group(0) @binding(2) var<uniform> grid_size: vec2u;

@compute @workgroup_size(16, 16)
fn compute_main(@builtin(global_invocation_id) global_id: vec3u) {
    if (global_id.x >= grid_size.x || global_id.y >= grid_size.y) {
        return;
    }

    let x = global_id.x;
    let y = global_id.y;
    let idx = y * grid_size.x + x;

    var neighbors = 0u;
    for (var i = -1i; i <= 1i; i++) {
        for (var j = -1i; j <= 1i; j++) {
            if (i == 0i && j == 0i) { continue; }

            let nx = (i32(x) + i + i32(grid_size.x)) % i32(grid_size.x);
            let ny = (i32(y) + j + i32(grid_size.y)) % i32(grid_size.y);
            let n_idx = u32(ny) * grid_size.x + u32(nx);
            neighbors += input_cells[n_idx];
        }
    }

    let current_state = input_cells[idx];
    var next_state = 0u;
    if (current_state == 1u) {
        if (neighbors == 2u || neighbors == 3u) {
            next_state = 1u;
        }
    } else {
        if (neighbors == 3u) {
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

@group(1) @binding(0) var<storage, read> cells: array<u32>;
@group(1) @binding(1) var<uniform> render_grid_size: vec2u;

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    // Basic mapping from screen pixels to grid cells
    // pos is in pixel coordinates (0..width, 0..height)
    // We assume the viewport is the same size as the grid for simplicity
    let x = u32(pos.x);
    let y = u32(pos.y);

    if (x >= render_grid_size.x || y >= render_grid_size.y) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let idx = y * render_grid_size.x + x;
    let state = cells[idx];

    if (state == 1u) {
        return vec4f(0.0, 1.0, 0.0, 1.0); // Green for alive
    } else {
        return vec4f(0.1, 0.1, 0.1, 1.0); // Dark grey for dead
    }
}
