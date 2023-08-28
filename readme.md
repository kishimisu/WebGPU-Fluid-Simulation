# WebGPU Fluid Simulation

This is my attempt at implementing Jos Stam's [Real-Time Fluid Dynamics for Games](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/GDC03.pdf) paper using javascript as a playground for learning the WebGPU API.

![Demo](assets/demo.gif)

## Live Demo

As WebGPU is still in development, it is not yet available in release builds of recent navigators.
In order for this demo to run properly, you will have to enable WebGPU experimental features in your browser.
I'll update this readme once it will be officially supported.

The simplest solution that worked for me was to download [Google Chrome Canary](https://www.google.com/chrome/canary/), then navigate to `chrome://flags` and enable `Unsafe WebGPU` & `WebGPU Developer Features` (for better security, don't navigate the web with these features on).
Other methods can be found [here](https://developer.chrome.com/en/docs/web-platform/webgpu/#use).

Once you have WebGPU enabled, you can start [playing with the live demo](https://kishimisu.github.io/WebGPU-Fluid-Simulation/) !

## Context

I've already tried to create a fluid simulation a few years ago using plain javascript and no GPU, but quickly came to the limitations of intense CPU computing on the web.

It's also been some time now since I've wanted to learn WebGPU and I thought it would be the perfect opportunity to tackle back on implementing fluid simulation using the power of this new API optimized for parallel computing and graphic rendering.

For this simulation, I'm making use of compute shaders to do the calculations instead of fragment shaders that can be found in usual OpenGL/WebGL implementations.

## Project Structure

- `index.html` : web page containing the demo
- `src/main.js` : simulation setup & render loop
- `src/init.js` : initialization functions (webgpu context, render size & gui)
- `src/utils.js` : utility wrappers to handle WebGPU buffers, uniforms and programs
- `src/render.js` : program used to render on the canvas
- `src/shaders.js` : WGSL strings containing each program's compute shader code
- `libraries/` : contains the CCapture.js library for canvas recording and the dat.gui.js library for GUI elements

![Symmetry Demo](assets/demo1.gif)

## References

### Fluid Simulation References
- Jos Stam Paper : https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/GDC03.pdf
- Nvidia GPUGem's Chapter 38 : https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu
- Jamie Wong's Fluid simulation : https://jamie-wong.com/2016/08/05/webgl-fluid-simulation/
- PavelDoGreat's Fluid simulation : https://github.com/PavelDoGreat/WebGL-Fluid-Simulation

### WebGPU References
- WebGPU Official Reference : https://www.w3.org/TR/webgpu/
- WGSL Official Reference : https://www.w3.org/TR/WGSL/
- Get started with GPU Compute on the web : https://web.dev/gpu-compute/
- Raw WebGPU Tutorial : https://alain.xyz/blog/raw-webgpu
