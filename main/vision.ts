import { AttachmentRepository } from './image-attachments.js';
import {
  VisionBridge as SharedVisionBridge,
  type VisionBridgeOptions,
  type VisionPrepareInput,
  type VisionPrepareResult,
} from '../shared/vision.js';

export type HostVisionBridgeOptions = Omit<VisionBridgeOptions, 'load'> & Readonly<{
  repository: AttachmentRepository;
  workspaceRoot: string;
}>;

/** Main-process wiring for the domain bridge and the persisted image snapshots. */
export class VisionBridge extends SharedVisionBridge {
  constructor(options: HostVisionBridgeOptions | VisionBridgeOptions) {
    if ('repository' in options) {
      const { repository, workspaceRoot, ...bridge } = options;
      super({ ...bridge, load: (ref, signal) => repository.load(ref.id, workspaceRoot).then(value => {
        if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted', 'AbortError');
        return value;
      }) });
    } else super(options);
  }
}

export function createVisionBridge(options: HostVisionBridgeOptions): VisionBridge { return new VisionBridge(options); }

export async function prepareVision(options: HostVisionBridgeOptions, input: VisionPrepareInput): Promise<VisionPrepareResult> {
  return createVisionBridge(options).prepare(input);
}

export * from '../shared/vision.js';
export { AttachmentRepository } from './image-attachments.js';
export type { ImageAttachmentRef, LoadedImageAttachment } from '../shared/vision.js';
