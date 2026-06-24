use wasm_bindgen::prelude::*;
use wgpu::util::DeviceExt;

#[wasm_bindgen]
pub struct WebGPULife {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    #[allow(dead_code)]
    config: wgpu::SurfaceConfiguration,
    compute_pipeline: wgpu::ComputePipeline,
    render_pipeline: wgpu::RenderPipeline,
    #[allow(dead_code)]
    cell_buffers: [wgpu::Buffer; 2],
    uniform_buffer: wgpu::Buffer,
    params: SimulationParams,
    compute_bind_groups: [wgpu::BindGroup; 2],
    render_bind_groups: [wgpu::BindGroup; 2],
    grid_size: [u32; 2],
    frame_index: usize,
}

#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
struct SimulationParams {
    grid_size: [u32; 2],
    birth_rule: u32,
    survive_rule: u32,
    alive_color: [f32; 4],
    dead_color: [f32; 4],
}

#[wasm_bindgen]
impl WebGPULife {
    #[wasm_bindgen]
    pub async fn new(canvas: web_sys::HtmlCanvasElement, width: u32, height: u32) -> Result<WebGPULife, JsValue> {
        let instance = wgpu::Instance::default();
        let surface = instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(|e| JsValue::from_str(&format!("Surface Error: {:?}", e)))?;

        let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::default(),
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }).await.ok_or_else(|| JsValue::from_str("Failed to find an appropriate adapter"))?;

        let (device, queue) = adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: None,
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: Default::default(),
            },
            None,
        ).await.map_err(|e| JsValue::from_str(&e.to_string()))?;

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });

        let config = surface.get_default_config(&adapter, width, height).unwrap();
        surface.configure(&device, &config);

        let grid_size = [width, height];
        let cell_count = (width * height) as usize;
        let initial_cells = vec![0u32; cell_count];

        let params = SimulationParams {
            grid_size,
            birth_rule: 1 << 3,
            survive_rule: (1 << 2) | (1 << 3),
            alive_color: [0.0, 1.0, 0.0, 1.0],
            dead_color: [0.1, 0.1, 0.1, 1.0],
        };

        let cell_buffers = [
            device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Cell Buffer 0"),
                contents: bytemuck::cast_slice(&initial_cells),
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            }),
            device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Cell Buffer 1"),
                contents: bytemuck::cast_slice(&initial_cells),
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            }),
        ];

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Uniform Buffer"),
            contents: bytemuck::cast_slice(&[params]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let compute_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute Bind Group Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let compute_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Compute Pipeline Layout"),
            bind_group_layouts: &[&compute_bind_group_layout],
            push_constant_ranges: &[],
        });

        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute Pipeline"),
            layout: Some(&compute_pipeline_layout),
            module: &shader,
            entry_point: Some("compute_main"),
            compilation_options: Default::default(),
            cache: None,
        });

        let render_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Render Bind Group Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let render_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Render Pipeline Layout"),
            bind_group_layouts: &[&render_bind_group_layout],
            push_constant_ranges: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let compute_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Compute Bind Group 0"),
                layout: &compute_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: cell_buffers[0].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: cell_buffers[1].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 2, resource: uniform_buffer.as_entire_binding() },
                ],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Compute Bind Group 1"),
                layout: &compute_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: cell_buffers[1].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: cell_buffers[0].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 2, resource: uniform_buffer.as_entire_binding() },
                ],
            }),
        ];

        let render_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Render Bind Group 0"),
                layout: &render_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: cell_buffers[1].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: uniform_buffer.as_entire_binding() },
                ],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Render Bind Group 1"),
                layout: &render_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: cell_buffers[0].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: uniform_buffer.as_entire_binding() },
                ],
            }),
        ];

        let mut life = WebGPULife {
            device,
            queue,
            surface,
            config,
            compute_pipeline,
            render_pipeline,
            cell_buffers,
            uniform_buffer,
            params,
            compute_bind_groups,
            render_bind_groups,
            grid_size,
            frame_index: 0,
        };
        life.reset(0.2);
        Ok(life)
    }

    pub fn reset(&mut self, density: f64) {
        let cell_count = (self.grid_size[0] * self.grid_size[1]) as usize;
        let mut initial_cells = vec![0u32; cell_count];
        for i in 0..cell_count {
            if js_sys::Math::random() < density {
                initial_cells[i] = 1;
            }
        }
        self.queue.write_buffer(&self.cell_buffers[0], 0, bytemuck::cast_slice(&initial_cells));
        self.queue.write_buffer(&self.cell_buffers[1], 0, bytemuck::cast_slice(&initial_cells));
        self.frame_index = 0;
    }

    pub fn set_cell(&mut self, x: u32, y: u32, value: u32) {
        if x < self.grid_size[0] && y < self.grid_size[1] {
            let idx = (y * self.grid_size[0] + x) as u64 * 4;
            let val = [value];
            self.queue.write_buffer(&self.cell_buffers[self.frame_index % 2], idx, bytemuck::cast_slice(&val));
        }
    }

    pub fn update_params(&mut self, birth_rule: u32, survive_rule: u32, alive_color: Vec<f32>, dead_color: Vec<f32>) {
        self.params.birth_rule = birth_rule;
        self.params.survive_rule = survive_rule;
        if alive_color.len() == 4 {
            self.params.alive_color.copy_from_slice(&alive_color);
        }
        if dead_color.len() == 4 {
            self.params.dead_color.copy_from_slice(&dead_color);
        }
        self.queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[self.params]));
    }

    pub fn run_frame(&mut self) {
        let output = self.surface.get_current_texture().unwrap();
        let view = output.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });

        {
            let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: None });
            cpass.set_pipeline(&self.compute_pipeline);
            cpass.set_bind_group(0, &self.compute_bind_groups[self.frame_index % 2], &[]);
            cpass.dispatch_workgroups((self.grid_size[0] + 15) / 16, (self.grid_size[1] + 15) / 16, 1);
        }

        {
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            rpass.set_pipeline(&self.render_pipeline);
            rpass.set_bind_group(1, &self.render_bind_groups[self.frame_index % 2], &[]);
            rpass.draw(0..6, 0..1);
        }

        self.queue.submit(Some(encoder.finish()));
        output.present();
        self.frame_index += 1;
    }
}
