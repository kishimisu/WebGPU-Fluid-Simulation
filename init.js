function onMouseMove(e) {
    const {width, height} = canvas.getBoundingClientRect()

    if (!mouseInfos.current) mouseInfos.current = []
    mouseInfos.current[0] = e.offsetX / width
    mouseInfos.current[1] = 1 - e.offsetY / height // y position needs to be inverted
}

// Init the WebGPU context by checking first if everything is supported
async function initContext() {
    if (navigator.gpu == null)
        throw new Error('WebGPU NOT Supported')

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('No adapter found')

    device = await adapter.requestDevice()

    canvas = document.getElementById("canvas-container")
    context = canvas.getContext("webgpu");
    if (!context) throw new Error("Canvas does not support WebGPU")

    // If we got here, WebGPU seems to be supported

    // Init canvas
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.addEventListener('mousemove', onMouseMove)

    // Init GUI
    gui = new dat.GUI()
        
    // Init  context
    presentationFormat = navigator.gpu.getPreferredCanvasFormat(adapter)

    context.configure({
        device,
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        alphaMode: 'opaque'
    })

    // Init buffer sizes
    initSizes()
}

// Init buffer & canvas dimensions to fit the screen while keeping the aspect ratio 
// and downscaling the dimensions if they exceed the browsers capabilities
function initSizes() {
    const aspectRatio = window.innerWidth / window.innerHeight
    const maxBufferSize = device.limits.maxStorageBufferBindingSize
    const maxCanvasSize = device.limits.maxTextureDimension2D

    // Fit to screen while keeping the aspect ratio
    const getPreferredDimensions = (size) => {
        let w, h

        if (window.innerHeight < window.innerWidth) {
            w = Math.floor(size * aspectRatio)
            h = size
        } else {
            w = size
            h = Math.floor(size / aspectRatio)
        }

        return getValidDimensions(w, h)
    }

    // Downscale if necessary to prevent crashes
    const getValidDimensions = (w, h) => {
        let downRatio = 1

        // Prevent buffer size overflow
        if (w * h * 4 >= maxBufferSize) downRatio = Math.sqrt(maxBufferSize / (w * h * 4))

        // Prevent canvas size overflow
        if (w > maxCanvasSize) downRatio = maxCanvasSize / w
        else if (h > maxCanvasSize) downRatio = maxCanvasSize / h
    
        return {
            w: Math.floor(w * downRatio), 
            h: Math.floor(h * downRatio)
        }
    }

    // Calculate simulation buffer dimensions
    let gridSize = getPreferredDimensions(settings.grid_size)
    settings.grid_w = gridSize.w
    settings.grid_h = gridSize.h

    // Calculate dye & canvas buffer dimensions
    let dyeSize = getPreferredDimensions(settings.dye_size)
    settings.dye_w = dyeSize.w
    settings.dye_h = dyeSize.h

    // const renderW = 8192
    // const renderH = 1317
    // settings.dye_w = renderW
    // settings.dye_h = renderH
    // settings.dye_size = renderH
    // settings.grid_w = renderW / 4
    // settings.grid_h = renderH / 4
    // settings.grid_size = renderH / 4

    // Useful values for the simulation
    settings.rdx = settings.grid_size * 4
    settings.dyeRdx = settings.dye_size * 4
    settings.dx = 1 / settings.rdx

    // Resize the canvas
    canvas.width = settings.dye_w
    canvas.height = settings.dye_h
}

// Initialize the GUI elements
function initGUI() {
    gui.add(settings, 'pressure_iterations', 0, 500)

    const symmetry_types = ['none', 'horizontal', 'vertical', 'both', 'center']
    gui.add(settings, 'input_symmetry', symmetry_types).onChange((type) => {
        let index = symmetry_types.indexOf(type)
        globalUniforms.mouse_type.setValue(index)
    })

    gui.add(settings, 'rdx').onChange(() => {
        settings.dx = 1 / settings.rdx
        grid.update(device.queue, [settings.grid_w, settings.grid_h, settings.dye_w, settings.dye_h, settings.dx, settings.rdx, settings.dyeRdx])
    })

    gui.add(settings, 'dyeRdx').onChange(() => {
        grid.update(device.queue, [settings.grid_w, settings.grid_h, settings.dye_w, settings.dye_h, settings.dx, settings.rdx, settings.dyeRdx])
    })

    const buffer_types = ['dye', 'velocity', 'divergence', 'pressure', 'vorticity']
    
    gui.add(settings, 'buffer_view', buffer_types).onChange((type) => {
        let multiplier = [1, 100, 10, 1e6, 1][buffer_types.indexOf(type)]
        globalUniforms.render_intensity_multiplier.setValue(multiplier)
        globalUniforms.render_dye_buffer.setValue(type === 'dye' ? 1 : 0)
    })

    gui.add(settings, 'reset')

    // gui.hide()
}