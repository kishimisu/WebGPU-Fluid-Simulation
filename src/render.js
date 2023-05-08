// 3D Smoke Rendering inspired from @xjorma's shader:
// https://www.shadertoy.com/view/WlVyRV
const renderShader = /* wgsl */`
${ STRUCT_GRID_SIZE }
${ STRUCT_MOUSE }

struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(1) uv : vec2<f32>,
};

struct SmokeData {
  raymarchSteps: f32,
  smokeDensity: f32,
  enableShadows: f32,
  shadowIntensity: f32,
  smokeHeight: f32,
  lightHeight: f32, 
  lightIntensity: f32,
  lightFalloff: f32,
}

@group(0) @binding(0) var<storage, read> fieldX : array<f32>;
@group(0) @binding(1) var<storage, read> fieldY : array<f32>;
@group(0) @binding(2) var<storage, read> fieldZ : array<f32>;
@group(0) @binding(3) var<uniform> uGrid : GridSize;
@group(0) @binding(4) var<uniform> uTime : f32;
@group(0) @binding(5) var<uniform> uMouse : Mouse;
@group(0) @binding(6) var<uniform> isRenderingDye : f32;
@group(0) @binding(7) var<uniform> multiplier : f32;
@group(0) @binding(8) var<uniform> smokeData : SmokeData;

@vertex
fn vertex_main(@location(0) position: vec4<f32>) -> VertexOut
{
    var output : VertexOut;
    output.position = position;
    output.uv = position.xy*.5+.5;
    return output;
}

fn hash12(p: vec2<f32>) -> f32
{
	var p3: vec3<f32>  = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn getDye(pos : vec3<f32>) -> vec3<f32>
{
  var uv = pos.xy;
  uv.x *= uGrid.h / uGrid.w;
  uv = uv * 0.5 + 0.5;

  if(max(uv.x, uv.y) > 1. || min(uv.x, uv.y) < 0.) {
      return vec3(0);
  }

  uv = floor(uv*vec2(uGrid.dyeW, uGrid.dyeH));
  let id = u32(uv.x + uv.y * uGrid.dyeW);

  return vec3(fieldX[id], fieldY[id], fieldZ[id]);
}

fn getLevel(dye: vec3<f32>) -> f32
{
  return max(dye.r, max(dye.g, dye.b));
}

fn getMousePos() -> vec2<f32> {
  var pos = uMouse.pos;
  pos = (pos - .5) * 2.;
  pos.x *= uGrid.w / uGrid.h;
  return pos;
}

fn getShadow(p: vec3<f32>, lightPos: vec3<f32>, fogSlice: f32) -> f32 {
  let lightDir: vec3<f32> = normalize(lightPos - p);
  let lightDist: f32 = pow(max(0., dot(lightPos - p, lightPos - p) - smokeData.lightIntensity + 1.), smokeData.lightFalloff);
  var shadowDist: f32 = 0.;
  
  for (var i: f32 = 1.; i <= smokeData.raymarchSteps; i += 1.) {
      let sp: vec3<f32> = p + mix(0., lightDist*smokeData.smokeHeight, i / smokeData.raymarchSteps) * lightDir;
      if (sp.z > smokeData.smokeHeight) {
        break;
      }

      let height: f32 = getLevel(getDye(sp)) * smokeData.smokeHeight;
      shadowDist += min(max(0., height - sp.z), fogSlice);
  }
  
  return exp(-shadowDist * smokeData.shadowIntensity) / lightDist;
}

@fragment
fn fragment_main(fragData : VertexOut) -> @location(0) vec4<f32>
{
    var w = uGrid.dyeW;
    var h = uGrid.dyeH;

    if (isRenderingDye != 2.) {
      if (isRenderingDye > 1.) {
        w = uGrid.w;
        h = uGrid.h;
      }

      let fuv = vec2<f32>((floor(fragData.uv*vec2(w, h))));
      let id = u32(fuv.x + fuv.y * w);

      let r = fieldX[id] + uTime * 0. + uMouse.pos.x * 0.;
      let g = fieldY[id];
      let b = fieldZ[id];
      var col = vec3(r, g, b);

      if (isRenderingDye > 1.) {
        if (r < 0.) {col = mix(vec3(0.), vec3(0., 0., 1.), abs(r));}
        else {col = mix(vec3(0.), vec3(1., 0., 0.), r);}
      }

      return vec4(col * multiplier, 1);
    }

    var uv: vec2<f32> = fragData.uv * 2. - 1.;
    uv.x *= uGrid.dyeW / uGrid.dyeH;
    // let rd: vec3<f32> = normalize(vec3(uv, -1));
    // let ro: vec3<f32> = vec3(0,0,1);   

    let theta = -1.5708;
    let phi = 3.141592 + 0.0001;// - (uMouse.pos.y - .5);
    let parralax = 20.;
    var ro: vec3<f32> = parralax * vec3(sin(phi)*cos(theta),cos(phi),sin(phi)*sin(theta));
    let cw = normalize(-ro);
    let cu = normalize(cross(cw, vec3(0, 0, 1)));
    let cv = normalize(cross(cu, cw));
    let ca = mat3x3(cu, cv, cw);
    var rd =  ca*normalize(vec3(uv, parralax));
    ro = ro.xzy; rd = rd.xzy;

    let bgCol: vec3<f32> = vec3(0,0,0);
    let fogSlice = smokeData.smokeHeight / smokeData.raymarchSteps;
    
    let near: f32 = (smokeData.smokeHeight - ro.z) / rd.z;
    let far: f32  = -ro.z / rd.z;
    
    let m = getMousePos();
    let lightPos: vec3<f32> = vec3(m, smokeData.lightHeight);
    
    var transmittance: f32 = 1.;
    var col: vec3<f32> = vec3(0.35,0.35,0.35) * 0.;

    for (var i: f32 = 0.; i <= smokeData.raymarchSteps; i += 1.) {
      let p: vec3<f32> = ro + mix(near, far, i / smokeData.raymarchSteps) * rd;

      let dyeColor: vec3<f32> = getDye(p);
      let height: f32 = getLevel(dyeColor) * smokeData.smokeHeight;
      let smple: f32 = min(max(0., height - p.z), fogSlice);

      if (smple > .0001) {
        var shadow: f32 = 1.;

        if (smokeData.enableShadows > 0.) {
          shadow = getShadow(p, lightPos, fogSlice);
        }

        let dens: f32 = smple*smokeData.smokeDensity;

        col += shadow * dens * transmittance * dyeColor;
        transmittance *= 1. - dens;	
      } 
    }

    return vec4(mix(bgCol, col, 1. - transmittance), 1);
}
`

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
      code: renderShader
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
    const entries = [
      ...this.buffer.buffers, 
      globalUniforms.gridSize.buffer,
      globalUniforms.time.buffer,
      globalUniforms.mouseInfos.buffer,
      globalUniforms.render_mode.buffer,
      globalUniforms.render_intensity_multiplier.buffer,
      globalUniforms.smoke_parameters.buffer,
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
