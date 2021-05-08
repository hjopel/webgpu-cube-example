import { Scene } from './scene';
import { Camera } from './camera';

export var device: GPUDevice;
export var cameraUniformBuffer: GPUBuffer;

async function getDevice() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.log('NO WEBGPU FOUND')
        return;
    }
    return await adapter.requestDevice();
}

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    private initSuccess: boolean = false;
    private swapChain: GPUSwapChain;
    private renderPassDescriptor: GPURenderPassDescriptor;

    private matrixSize = 4 * 16; // 4x4 matrix

    constructor() { }

    public async init(canvas: HTMLCanvasElement): Promise<boolean> {
        if (!canvas) {
            console.log('missing canvas!')
            return false;
        }

        device = await getDevice();

        if (!device) {
            console.log('found no gpu device!')
            return false;
        }

        this.swapChain = canvas.getContext('gpupresent').configureSwapChain({
            device: device,
            format: this.swapChainFormat,
        });

        const depthTextureView = this.depthTextureView(canvas);
        this.renderPassDescriptor = {
            colorAttachments: [
                {
                    // attachment is acquired and set in render loop.
                    view: undefined,
                    loadValue: { r: 0.7, g: 0.7, b: 0.7, a: 1.0 },
                } as GPURenderPassColorAttachmentNew,
            ],
            depthStencilAttachment: {
                view: depthTextureView,

                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            } as GPURenderPassDepthStencilAttachmentNew,
        };

        cameraUniformBuffer = device.createBuffer({
            size: this.matrixSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        return this.initSuccess = true;
    }

    public update(canvas: HTMLCanvasElement) {
        if (!this.initSuccess) {
            return;
        }

        this.updateRenderPassDescriptor(canvas);
    }

    public frame(camera: Camera, scene: Scene) {
        if (!this.initSuccess) {
            return;
        }

        const cameraViewProjectionMatrix = camera.getCameraViewProjMatrix() as Float32Array;
        device.queue.writeBuffer(
            cameraUniformBuffer,
            0,
            cameraViewProjectionMatrix.buffer,
            cameraViewProjectionMatrix.byteOffset,
            cameraViewProjectionMatrix.byteLength
        );

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachmentNew])[0].view = this.swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

        for (let object of scene.getObjects()) {
            object.draw(passEncoder, device)
        }

        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);
    }

    private depthTextureView(canvas: HTMLCanvasElement) {
        return device.createTexture({
            size: {
                width: canvas.width,
                height: canvas.height,
            },
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        }).createView();
    }

    private updateRenderPassDescriptor(canvas: HTMLCanvasElement) {
        (this.renderPassDescriptor.depthStencilAttachment as GPURenderPassDepthStencilAttachmentNew).view = this.depthTextureView(canvas);
    }
}