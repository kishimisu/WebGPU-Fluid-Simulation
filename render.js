// Renders 3 (r, g, b) storage buffers to the canvas
class RenderProgram {
  constructor() {
    const vertices = new Float32Array([
      -1, -1, 0, 1, -1, 1, 0, 1, 1, -1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, 1, 1, 0, 1
    ]);

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    const vertexBuffersDescriptors = [
      {
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: "float32x4",
          },
        ],
        arrayStride: 16,
        stepMode: "vertex",
      },
    ];

    const shaderModule = device.createShaderModule({
      code: `
                ${ STRUCT_GRID_SIZE }
                struct VertexOut {
                    @builtin(position) position : vec4<f32>,
                    @location(1) uv : vec2<f32>,
                };

                @group(0) @binding(0) var<storage, read_write> fieldX : array<f32>;
                @group(0) @binding(1) var<storage, read_write> fieldY : array<f32>;
                @group(0) @binding(2) var<storage, read_write> fieldZ : array<f32>;
                @group(0) @binding(3) var<uniform> uGrid : GridSize;
                @group(0) @binding(4) var<uniform> multiplier : f32;
                @group(0) @binding(5) var<uniform> isRenderingDye : f32;

                @vertex
                fn vertex_main(@location(0) position: vec4<f32>) -> VertexOut
                {
                    var output : VertexOut;
                    output.position = position;
                    output.uv = position.xy*.5+.5;
                    return output;
                } 

                @fragment
                fn fragment_main(fragData : VertexOut) -> @location(0) vec4<f32>
                {
                    var w = uGrid.dyeW;
                    var h = uGrid.dyeH;

                    if (isRenderingDye != 1.) {
                      w = uGrid.w;
                      h = uGrid.h;
                    }

                    let fuv = vec2<f32>((floor(fragData.uv*vec2(w, h))));
                    let id = u32(fuv.x + fuv.y * w);

                    let r = fieldX[id];
                    let g = fieldY[id];
                    let b = fieldZ[id];
                    var col = vec3(r, g, b);

                    if (r == g && r == b) {
                      if (r < 0.) {col = mix(vec3(0.), vec3(0., 0., 1.), abs(r));}
                      else {col = mix(vec3(0.), vec3(1., 0., 0.), r);}
                    }
                    return vec4(col, 1) * multiplier;
                }`,
    });

    this.renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vertex_main",
        buffers: vertexBuffersDescriptors,
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragment_main",
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    // The r,g,b buffer containing the data to render
    this.buffer = new DynamicBuffer({ dims: 3, w: settings.dye_w, h: settings.dye_h })

    // Uniforms
    this.uRenderIntensity = new Uniform('render_intensity_multiplier', {value: 1})
    this.uRenderDye = new Uniform('render_dye_buffer', {value: 1})

    const entries = [
      ...this.buffer.buffers, 
      globalUniforms.gridSize.buffer,
      this.uRenderIntensity.buffer,
      this.uRenderDye.buffer,
    ].map((b, i) => ({
      binding: i,
      resource: { buffer: b },
    }))

    this.renderBindGroup = device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries
    });

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    };
  }

  // Dispatch a draw command to render on the canvas
  dispatch(commandEncoder) {
    this.renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const renderPassEncoder = commandEncoder.beginRenderPass(
      this.renderPassDescriptor
    );

    renderPassEncoder.setPipeline(this.renderPipeline);
    renderPassEncoder.setBindGroup(0, this.renderBindGroup);
    renderPassEncoder.setVertexBuffer(0, this.vertexBuffer);
    renderPassEncoder.draw(6);
    renderPassEncoder.end();
  }
}
