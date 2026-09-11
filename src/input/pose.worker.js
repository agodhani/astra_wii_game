import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// MediaPipe's loader falls back to self.import when importScripts is unavailable
// in a module worker. The generated ES-module wrappers expose its WASM factory
// without eval, remote scripts, or moving inference onto the main thread.
self.import = async (loaderUrl) => {
  const { default: factory } = await import(/* @vite-ignore */ loaderUrl.replace(/\.js$/, '.mjs'));
  self.ModuleFactory = factory;
};

let landmarker = null;
let activeGeneration = 0;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function createLandmarker(delegate) {
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/models/pose_landmarker_lite.task',
      delegate,
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function initialize(generation) {
  activeGeneration = generation;
  landmarker?.close();
  landmarker = null;

  let gpuError;
  try {
    landmarker = await createLandmarker('GPU');
  } catch (error) {
    gpuError = error;
    try {
      landmarker = await createLandmarker('CPU');
    } catch (cpuError) {
      throw new Error(
        `Pose model failed to load. GPU: ${errorMessage(gpuError)}; CPU: ${errorMessage(cpuError)}`,
      );
    }
  }

  if (generation !== activeGeneration) {
    landmarker.close();
    landmarker = null;
    return;
  }
  self.postMessage({ type: 'ready', generation });
}

function detect(message) {
  const { bitmap, generation, timestamp } = message;
  try {
    if (!landmarker || generation !== activeGeneration) return;
    const result = landmarker.detectForVideo(bitmap, timestamp);
    const landmarks = result.landmarks?.[0] ?? null;
    self.postMessage({ type: 'result', generation, timestamp, landmarks });
    result.close?.();
  } catch (error) {
    self.postMessage({
      type: 'error',
      generation,
      message: `Pose tracking stopped: ${errorMessage(error)}`,
    });
  } finally {
    bitmap.close();
  }
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') {
    initialize(message.generation).catch((error) => {
      if (message.generation === activeGeneration) {
        self.postMessage({
          type: 'error',
          generation: message.generation,
          message: errorMessage(error),
        });
      }
    });
  } else if (message.type === 'frame') {
    detect(message);
  } else if (message.type === 'stop') {
    activeGeneration += 1;
    landmarker?.close();
    landmarker = null;
    self.close();
  }
};
