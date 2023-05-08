let settings = {
    render_mode: 0,
    grid_size: 128,
    dye_size: 1024,
    sim_speed: 5,
    contain_fluid: true,
    velocity_add_intensity: 0.2 ,
    velocity_add_radius: 0.0002,
    velocity_diffusion: 0.9999,
    dye_add_intensity: 1,
    dye_add_radius: 0.001,
    dye_diffusion: 0.98,
    viscosity: 0.8,
    vorticity: 2,
    pressure_iterations: 20,
    buffer_view: 'dye',
    input_symmetry: 'none',

    raymarch_steps: 12,
    smoke_density: 40,
    enable_shadows: true,
    shadow_intensity: 25,
    smoke_height: 0.2,
    light_height: 1,
    light_intensity: 1,
    light_falloff: 1,
}

let gui, smokeFolder
let device, presentationFormat

const mouseInfos = {
    current: null,
    last: null,
    velocity: null
}

// Buffers
let velocity, velocity0, dye, dye0, divergence, divergence0, pressure, pressure0, vorticity

// Uniforms
const globalUniforms = {}
let uRenderMode, time, dt, mouse, grid, uSimSpeed, vel_force, vel_radius, vel_diff, dye_force, dye_radius, dye_diff
let viscosity, uVorticity, containFluid, uSymmetry, uSmokeParameters, uRenderIntensity

// Programs
let checkerProgram, updateDyeProgram, updateProgram, advectProgram, boundaryProgram, divergenceProgram
let boundaryDivProgram, pressureProgram, boundaryPressureProgram, gradientSubtractProgram, advectDyeProgram
let clearPressureProgram, vorticityProgram, vorticityConfinmentProgram, renderProgram

function initBuffers() {
    velocity = new DynamicBuffer({ dims: 2 })
    velocity0 = new DynamicBuffer({ dims: 2 })

    dye = new DynamicBuffer({ dims: 3, w: settings.dye_w, h: settings.dye_h })
    dye0 = new DynamicBuffer({ dims: 3, w: settings.dye_w, h: settings.dye_h })

    divergence = new DynamicBuffer()
    divergence0 = new DynamicBuffer()
    
    pressure = new DynamicBuffer()
    pressure0 = new DynamicBuffer()

    vorticity = new DynamicBuffer()
}

function initUniforms() {
    uRenderMode = new Uniform('render_mode', {displayName: "Render Mode", size: 1, min: RENDER_MODES, 
        onChange: (val) => {
            globalUniforms.render_intensity_multiplier.setValue([1, 1, 1, 100, 10, 1e6, 1][parseInt(val)])
            if (val == 2) smokeFolder.show(), smokeFolder.open()
            else smokeFolder.hide()
    }})
    gui.add(settings, 'grid_size', SIMULATION_GRID_SIZES).name("Sim. Resolution").onChange(refreshSizes)
    gui.add(settings, 'dye_size', DYE_GRID_SIZES).name("Render Resolution").onChange(refreshSizes)

    time = new Uniform('time')
    dt = new Uniform('dt')
    mouse = new Uniform('mouseInfos', {size: 4})
    grid = new Uniform('gridSize', {size: 7, value: [settings.grid_w, settings.grid_h, settings.dye_w, settings.dye_h, settings.dx, settings.rdx, settings.dyeRdx]})
    uSimSpeed = new Uniform('sim_speed', {min: 0.1, max: 20, addToGUI: false})
    vel_force = new Uniform('velocity_add_intensity', {displayName: "Velocity Force", min: 0, max: .5})
    vel_radius = new Uniform('velocity_add_radius', {displayName: "Velocity Radius", min: 0, max: 0.001, step: 0.00001})
    vel_diff = new Uniform('velocity_diffusion', {displayName: "Velocity Diffusion", min: 0.95, max: 1, step: 0.00001})
    dye_force = new Uniform('dye_add_intensity', {displayName: "Dye Intensity", min: 0, max: 10})
    dye_radius = new Uniform('dye_add_radius', {displayName: "Dye Radius", min: 0, max: 0.01, step: 0.00001})
    dye_diff = new Uniform('dye_diffusion', {displayName: "Dye Diffusion", min: 0.95, max: 1, step: 0.00001})
    viscosity = new Uniform('viscosity', {displayName: "Viscosity",min: 0, max: 1})
    uVorticity = new Uniform('vorticity', {displayName: "Vorticity",min: 0, max: 10, step: 0.00001})
    containFluid = new Uniform('contain_fluid', {displayName: "Solid boundaries"})
    uSymmetry = new Uniform('mouse_type', {value: 0})
    uSmokeParameters = new Uniform('smoke_parameters', {value: [settings.raymarch_steps, settings.smoke_density, settings.enable_shadows, settings.shadow_intensity, settings.smoke_height, settings.light_height, settings.light_intensity, settings.light_falloff]})
    uRenderIntensity = new Uniform('render_intensity_multiplier', {value: 1})
}

function initPrograms() {
    checkerProgram = new Program({
        buffers: [ dye ],
        shader: checkerboardShader,
        dispatchX: settings.dye_w,
        dispatchY: settings.dye_h,
        uniforms: [ grid, time ]
    })

    updateDyeProgram = new UpdateProgram({
        in_quantity: dye,
        out_quantity: dye0,
        uniforms: [ grid, mouse, dye_force, dye_radius, dye_diff, time, dt, uSymmetry ],
        dispatchX: settings.dye_w,
        dispatchY: settings.dye_h,
        shader: updateDyeShader
    })

    updateProgram = new UpdateProgram({
        in_quantity: velocity,
        out_quantity: velocity0,
        uniforms: [ grid, mouse, vel_force, vel_radius, vel_diff, dt, time, uSymmetry ]
    })

    advectProgram = new AdvectProgram({
        in_quantity: velocity0,
        in_velocity: velocity0,
        out_quantity: velocity,
        uniforms: [ grid, dt ]
    })

    boundaryProgram = new BoundaryProgram({
        in_quantity: velocity,
        out_quantity: velocity0,
        uniforms: [ grid, containFluid ]
    })

    divergenceProgram = new DivergenceProgram({
        in_velocity: velocity0,
        out_divergence: divergence0
    })

    boundaryDivProgram = new BoundaryProgram({
        in_quantity: divergence0,
        out_quantity: divergence,
        shader: boundaryPressureShader
    })

    pressureProgram = new PressureProgram({
        in_pressure: pressure,
        in_divergence: divergence,
        out_pressure: pressure0,
    })
    
    boundaryPressureProgram = new BoundaryProgram({
        in_quantity: pressure0,
        out_quantity: pressure,
        shader: boundaryPressureShader
    })

    gradientSubtractProgram = new GradientSubtractProgram({
        in_pressure: pressure,
        in_velocity: velocity0,
        out_velocity: velocity
    })

    advectDyeProgram = new AdvectProgram({
        in_quantity: dye0,
        in_velocity: velocity,
        out_quantity: dye,
        uniforms: [ grid, dt ],
        dispatchX: settings.dye_w,
        dispatchY: settings.dye_h,
        shader: advectDyeShader
    })

    clearPressureProgram = new UpdateProgram({
        in_quantity: pressure,
        out_quantity: pressure0,
        uniforms: [ grid, viscosity ],
        shader: clearPressureShader,
    })

    vorticityProgram = new VorticityProgram({
        in_velocity: velocity,
        out_vorticity: vorticity,
    })

    vorticityConfinmentProgram = new VorticityConfinmentProgram({
        in_velocity: velocity,
        in_vorticity: vorticity,
        out_velocity: velocity0,
        uniforms: [ grid, dt, uVorticity ]
    })

    renderProgram = new RenderProgram()
}

async function main() {
    // Init WebGPU Context
    const initializationSuccess = await initContext()
    if (!initializationSuccess) return

    // Init the recorder (for video export)
    const recorder = new Recorder(reset)
    
    // Init buffers, uniforms and programs
    initBuffers()
    initUniforms()
    initPrograms()

    // Simulation reset
    function reset() {
        velocity.clear(device.queue)
        dye.clear(device.queue)
        pressure.clear(device.queue)

        settings.time = 0
        loop = 0
    }
    settings.reset = reset
    
    // Fluid simulation step
    function dispatchComputePipeline(passEncoder) {

        if (settings.render_mode >= 1 && settings.render_mode <= 3) 
            checkerProgram.dispatch(passEncoder)

        // Add velocity and dye at the mouse position
        updateDyeProgram.dispatch(passEncoder)
        updateProgram.dispatch(passEncoder)

        // Advect the velocity field through itself
        advectProgram.dispatch(passEncoder)
        boundaryProgram.dispatch(passEncoder) // boundary conditions

        // Compute the divergence
        divergenceProgram.dispatch(passEncoder)
        boundaryDivProgram.dispatch(passEncoder) // boundary conditions
        
        // Solve the jacobi-pressure equation
        for (let i = 0; i < settings.pressure_iterations; i++) {
            pressureProgram.dispatch(passEncoder)
            boundaryPressureProgram.dispatch(passEncoder) // boundary conditions
        }

        // Subtract the pressure from the velocity field
        gradientSubtractProgram.dispatch(passEncoder)
        clearPressureProgram.dispatch(passEncoder)

        // Compute & apply vorticity confinment
        vorticityProgram.dispatch(passEncoder)
        vorticityConfinmentProgram.dispatch(passEncoder)

        // Advect the dye through the velocity field
        advectDyeProgram.dispatch(passEncoder)
    }

    let loop = 0
    let lastFrame = performance.now()

    // Render loop
    async function step() {
        requestAnimationFrame(step)

        // Update time
        const now = performance.now()
        settings.dt = Math.min(1/60, (now - lastFrame) / 1000)*settings.sim_speed
        settings.time += settings.dt
        lastFrame = now

        // Update uniforms
        Object.values(globalUniforms).forEach(u => u.update(device.queue))

        // Update custom uniform
        if (recorder.isRecording === 'frames') {
            mouse.update(device.queue, recorder.mouseData[loop])
        } else if (mouseInfos.current) {
            mouseInfos.velocity = mouseInfos.last ? [mouseInfos.current[0] - mouseInfos.last[0], mouseInfos.current[1] - mouseInfos.last[1]] : [0, 0]
            mouse.update(device.queue, [...mouseInfos.current, ...mouseInfos.velocity])
            mouseInfos.last = [...mouseInfos.current]
        }
        uSmokeParameters.update(device.queue, [settings.raymarch_steps, settings.smoke_density, settings.enable_shadows, settings.shadow_intensity, settings.smoke_height, settings.light_height, settings.light_intensity, settings.light_falloff])
        
        // Compute fluid
        const commandEncoder = device.createCommandEncoder()
        const passEncoder = commandEncoder.beginComputePass()
        dispatchComputePipeline(passEncoder)
        passEncoder.end()
        
        velocity0.copyTo(velocity, commandEncoder)
        pressure0.copyTo(pressure, commandEncoder)

        if      (settings.render_mode == 3) velocity.copyTo(renderProgram.buffer, commandEncoder)
        else if (settings.render_mode == 4) divergence.copyTo(renderProgram.buffer, commandEncoder)
        else if (settings.render_mode == 5) pressure.copyTo(renderProgram.buffer, commandEncoder)
        else if (settings.render_mode == 6) vorticity.copyTo(renderProgram.buffer, commandEncoder)
        else dye.copyTo(renderProgram.buffer, commandEncoder)

        // Draw fluid
        renderProgram.dispatch(commandEncoder)

        // Send commands to the GPU
        const gpuCommands = commandEncoder.finish()
        device.queue.submit([gpuCommands])

        // Update the recorder
        recorder.update()
        if (++loop >= recorder.mouseData.length && recorder.isRecording === 'frames') recorder.stop()
    }

    initGUI()
    step()
}

main()