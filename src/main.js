const settings = {
    grid_size: 512,
    dye_size: 2048,
    sim_speed: 5,
    contain_fluid: true,
    velocity_add_intensity: 0.1,
    velocity_add_radius: 0.0001,
    velocity_diffusion: 0.9999,
    dye_add_intensity: 4,
    dye_add_radius: 0.001,
    dye_diffusion: 0.994,//8,
    viscosity: 0.8,
    vorticity: 2,
    pressure_iterations: 100,
    buffer_view: 'dye',
    input_symmetry: 'horizontal'
}

const globalUniforms = {}
let gui, device, presentationFormat

const mouseInfos = {
    current: null,
    last: null,
    velocity: null
}

async function main() {
    // Init WebGPU Context
    const initializationSuccess = await initContext()
    if (!initializationSuccess) return

    // Init the recorder (for video export)
    const recorder = new Recorder(reset)
    
    // Init buffers
    const velocity = new DynamicBuffer({ dims: 2 })
    const velocity0 = new DynamicBuffer({ dims: 2 })

    const dye = new DynamicBuffer({ dims: 3, w: settings.dye_w, h: settings.dye_h })
    const dye0 = new DynamicBuffer({ dims: 3, w: settings.dye_w, h: settings.dye_h })

    const divergence = new DynamicBuffer()
    const divergence0 = new DynamicBuffer()
    
    const pressure = new DynamicBuffer()
    const pressure0 = new DynamicBuffer()
    const pressure1 = new DynamicBuffer()

    const vorticity = new DynamicBuffer()

    // Init uniforms
    const time = new Uniform('time')
    const dt = new Uniform('dt')
    const mouse = new Uniform('mouseInfos', {size: 4})
    const grid = new Uniform('gridSize', {size: 7, value: [settings.grid_w, settings.grid_h, settings.dye_w, settings.dye_h, settings.dx, settings.rdx, settings.dyeRdx]})
    const simSpeed = new Uniform('sim_speed', {min: 0.1, max: 20})
    const vel_force = new Uniform('velocity_add_intensity', {min: 0, max: 1})
    const vel_radius = new Uniform('velocity_add_radius', {min: 0, max: 0.001, step: 0.00001})
    const vel_diff = new Uniform('velocity_diffusion', {min: 0.95, max: 1, step: 0.00001})
    const dye_force = new Uniform('dye_add_intensity', {min: 0, max: 10})
    const dye_radius = new Uniform('dye_add_radius', {min: 0, max: 0.01, step: 0.00001})
    const dye_diff = new Uniform('dye_diffusion', {min: 0.95, max: 1, step: 0.00001})
    const viscosity = new Uniform('viscosity', {min: 0, max: 1})
    const uVorticity = new Uniform('vorticity', {min: 0, max: 10, step: 0.00001})
    const containFluid = new Uniform('contain_fluid')
    const uSymmetry = new Uniform('mouse_type')
    console.log({globalUniforms})

    // Init programs, see dispatchComputePipeline() below for more infos
    const checkerProgram = new Program({
        buffers: [ dye ],
        shader: checkerboardShader,
        dispatchX: settings.dye_w,
        dispatchY: settings.dye_h,
        uniforms: [ grid ]
    })

    const updateDyeProgram = new UpdateProgram({
        in_quantity: dye,
        out_quantity: dye0,
        uniforms: [ grid, mouse, dye_force, dye_radius, dye_diff, time, dt, uSymmetry ],
        dispatchX: settings.dye_w,
        dispatchY: settings.dye_h,
        shader: updateDyeShader
    })

    const updateProgram = new UpdateProgram({
        in_quantity: velocity,
        out_quantity: velocity0,
        uniforms: [ grid, mouse, vel_force, vel_radius, vel_diff, dt, time, uSymmetry ]
    })

    const advectProgram = new AdvectProgram({
        in_quantity: velocity0,
        in_velocity: velocity0,
        out_quantity: velocity,
        uniforms: [ grid, dt ]
    })

    const boundaryProgram = new BoundaryProgram({
        in_quantity: velocity,
        out_quantity: velocity0,
        uniforms: [ grid, containFluid ]
    })

    const divergenceProgram = new DivergenceProgram({
        in_velocity: velocity0,
        out_divergence: divergence0
    })

    const boundaryDivProgram = new BoundaryProgram({
        in_quantity: divergence0,
        out_quantity: divergence,
        shader: boundaryPressureShader
    })

    const pressureProgramA = new PressureProgram({
        in_pressure: pressure,
        in_divergence: divergence,
        out_pressure: pressure0,
    })

    const pressureProgramB = new PressureProgram({
        in_pressure: pressure0,
        in_divergence: divergence,
        out_pressure: pressure1,
    })
    
    const boundaryPressureProgram = new BoundaryProgram({
        in_quantity: pressure1,
        out_quantity: pressure,
        shader: boundaryPressureShader
    })

    const gradientSubtractProgram = new GradientSubtractProgram({
        in_pressure: pressure,
        in_velocity: velocity0,
        out_velocity: velocity
    })

    const advectDyeProgram = new AdvectProgram({
        in_quantity: dye0,
        in_velocity: velocity,
        out_quantity: dye,
        uniforms: [ grid, dt ],
        dispatchX: settings.dye_w,
        dispatchY: settings.dye_h,
        shader: advectDyeShader
    })

    const clearPressureProgram = new UpdateProgram({
        in_quantity: pressure,
        out_quantity: pressure0,
        uniforms: [ grid, viscosity ],
        shader: clearPressureShader,
    })

    const vorticityProgram = new VorticityProgram({
        in_velocity: velocity,
        out_vorticity: vorticity,
    })

    const vorticityConfinmentProgram = new VorticityConfinmentProgram({
        in_velocity: velocity,
        in_vorticity: vorticity,
        out_velocity: velocity0,
        uniforms: [ grid, dt, uVorticity ]
    })

    const renderProgram = new RenderProgram()

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

        // if (loop === 0) checkerProgram.dispatch(passEncoder)

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
        for (let i = 0; i < settings.pressure_iterations/2; i++) {
            pressureProgramA.dispatch(passEncoder)
            pressureProgramB.dispatch(passEncoder)
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

        // Update mouse uniform
        if (recorder.isRecording === 'frames') {
            mouse.update(device.queue, recorder.mouseData[loop])
        } else if (mouseInfos.current) {
            mouseInfos.velocity = mouseInfos.last ? [mouseInfos.current[0] - mouseInfos.last[0], mouseInfos.current[1] - mouseInfos.last[1]] : [0, 0]
            mouse.update(device.queue, [...mouseInfos.current, ...mouseInfos.velocity])
            mouseInfos.last = [...mouseInfos.current]
        }

        // Compute fluid
        const commandEncoder = device.createCommandEncoder()
        const passEncoder = commandEncoder.beginComputePass()
        dispatchComputePipeline(passEncoder)
        passEncoder.end()
        
        velocity0.copyTo(velocity, commandEncoder)
        pressure0.copyTo(pressure, commandEncoder)

        // Copy the selected buffer to the render program
        if (settings.buffer_view === 'dye') dye.copyTo(renderProgram.buffer, commandEncoder)
        else if (settings.buffer_view === 'velocity') velocity.copyTo(renderProgram.buffer, commandEncoder)
        else if (settings.buffer_view === 'divergence') divergence.copyTo(renderProgram.buffer, commandEncoder)
        else if (settings.buffer_view === 'pressure') pressure.copyTo(renderProgram.buffer, commandEncoder)
        else if (settings.buffer_view === 'vorticity') vorticity.copyTo(renderProgram.buffer, commandEncoder)

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