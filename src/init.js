function onMouseMove(e) {
    const {width, height} = canvas.getBoundingClientRect()

    if (!mouseInfos.current) mouseInfos.current = []
    mouseInfos.current[0] = e.offsetX / width
    mouseInfos.current[1] = 1 - e.offsetY / height // y position needs to be inverted
}

function onWebGPUDetectionError(error) {
    console.log('Could not initialize WebGPU: ' + error)
    document.querySelector('.webgpu-not-supported').style.visibility = 'visible'
    return false
}

// Init the WebGPU context by checking first if everything is supported
// Returns true on init success, false otherwise
async function initContext() {
    if (navigator.gpu == null)
        return onWebGPUDetectionError('WebGPU NOT Supported')

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return onWebGPUDetectionError('No adapter found')

    device = await adapter.requestDevice()

    canvas = document.getElementById("canvas-container")
    context = canvas.getContext("webgpu");
    if (!context) return onWebGPUDetectionError("Canvas does not support WebGPU")

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

    // Resize event
    let resizeTimeout
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout)
        resizeTimeout = setTimeout(refreshSizes, 150)
    })

    return true
}

function refreshSizes() {
    initSizes()
    initBuffers()
    initPrograms()
    globalUniforms.gridSize.needsUpdate = [settings.grid_w, settings.grid_h, settings.dye_w, settings.dye_h, settings.dx, settings.rdx, settings.dyeRdx]
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

    // Useful values for the simulation
    settings.rdx = settings.grid_size * 4
    settings.dyeRdx = settings.dye_size * 4
    settings.dx = 1 / settings.rdx

    // Resize the canvas
    canvas.width = settings.dye_w
    canvas.height = settings.dye_h
}

const RENDER_MODES = {
    "Classic": 0, 
    "Smoke 2D": 1, 
    "Smoke 3D + Shadows": 2,
    "Debug - Velocity": 3,
    "Debug - Divergence": 4,
    "Debug - Pressure": 5,
    "Debug - Vorticity": 6,
}
const SIMULATION_GRID_SIZES = [32, 64, 128, 256, 512, 1024]
const DYE_GRID_SIZES  = [128, 256, 512, 1024, 2048]

// Initialize the GUI elements
function initGUI() {
    gui.add(settings, 'pressure_iterations', 0, 50).name("Pressure Iterations")

    const symmetry_types = ['none', 'horizontal', 'vertical', 'both', 'center']
    gui.add(settings, 'input_symmetry', symmetry_types).onChange((type) => {
        let index = symmetry_types.indexOf(type)
        globalUniforms.mouse_type.setValue(index)
    }).name("Mouse Symmetry")

    // gui.add(settings, 'rdx', 32, 8000).onChange(() => {
    //     settings.dx = 1 / settings.rdx
    //     globalUniforms.gridSize.update(device.queue, [settings.grid_w, settings.grid_h, settings.dye_w, settings.dye_h, settings.dx, settings.rdx, settings.dyeRdx])
    // })

    gui.add(settings, 'reset').name("Clear canvas")

    smokeFolder = gui.addFolder('Smoke Parameters')
    smokeFolder.add(settings, 'raymarch_steps', 5, 20, 1).name("3D resolution")
    smokeFolder.add(settings, 'light_height', 0.5, 1, 0.001).name("Light Elevation")
    smokeFolder.add(settings, 'light_intensity', 0, 1, 0.001).name("Light Intensity")
    smokeFolder.add(settings, 'light_falloff', 0.5, 10, 0.001).name("Light Falloff")
    smokeFolder.add(settings, 'enable_shadows').name("Enable Shadows")
    smokeFolder.add(settings, 'shadow_intensity', 0, 50, 0.001).name("Shadow Intensity")
    smokeFolder.hide()
}