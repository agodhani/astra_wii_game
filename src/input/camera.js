import { GestureInterpreter } from './gesture.js';

const FRAME_INTERVAL_MS = 1000 / 15;
const MODEL_LOAD_TIMEOUT_MS = 20_000;

function noop() {}

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was denied. Allow camera access in the browser, then retry.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found. Connect a camera or choose keyboard controls.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is busy or unavailable. Close other camera apps, then retry.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'That camera is unavailable. Choose another device and retry.';
    default:
      return error instanceof Error ? error.message : 'The camera could not be started.';
  }
}

export class CameraController {
  constructor({ onStatus = noop, onLandmarks = noop, onSwing = noop } = {}) {
    this.onStatus = onStatus;
    this.onLandmarks = onLandmarks;
    this.onSwing = onSwing;
    this.options = {
      deviceId: '',
      handedness: 'right',
      sensitivity: 1,
      reducedMotion: false,
    };
    this.armed = false;
    this.generation = 0;
    this.state = {
      state: 'idle',
      message: 'Camera off.',
      confidence: 0,
      calibrated: false,
      phase: 'uncalibrated',
      calibrationProgress: 0,
      lastPower: null,
      armed: false,
    };
  }

  async listDevices() {
    if (!globalThis.navigator?.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    let cameraNumber = 0;
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device) => {
        cameraNumber += 1;
        return {
          deviceId: device.deviceId,
          groupId: device.groupId,
          label: device.label || `Camera ${cameraNumber}`,
        };
      });
  }

  async start(video, options = {}) {
    this._teardown();
    const generation = ++this.generation;
    this.video = video;
    this.setOptions(options);
    this._emit({
      state: 'requesting',
      message: 'Waiting for camera permission…',
      confidence: 0,
      calibrated: false,
      phase: 'uncalibrated',
      calibrationProgress: 0,
      lastPower: null,
    });

    if (!video || !globalThis.navigator?.mediaDevices?.getUserMedia) {
      const error = new Error('Camera capture is not supported in this browser.');
      this._fail(error.message, generation);
      throw error;
    }

    const videoConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: 'user',
    };
    if (this.options.deviceId) {
      delete videoConstraints.facingMode;
      videoConstraints.deviceId = { exact: this.options.deviceId };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException('Camera start was superseded.', 'AbortError');
      }
      this.stream = stream;
      this._endedHandler = () => this._handleDisconnect(generation);
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', this._endedHandler, { once: true });
      });

      video.muted = true;
      video.playsInline = true;
      video.setAttribute?.('playsinline', '');
      video.srcObject = stream;
      await video.play();
      if (generation !== this.generation) {
        throw new DOMException('Camera start was superseded.', 'AbortError');
      }

      this.interpreter = new GestureInterpreter(this.options);
      await this._loadWorker(generation);
      if (generation !== this.generation) {
        throw new DOMException('Camera start was superseded.', 'AbortError');
      }

      this._emit({
        state: 'ready',
        message: 'Camera ready. Stand where your upper body and hands stay in frame, then calibrate.',
        confidence: 0,
        calibrated: false,
        phase: 'uncalibrated',
        calibrationProgress: 0,
        lastPower: null,
      });
      this.lastFrameAt = 0;
      this.inFlight = false;
      this.capturingFrame = false;
      this.frameErrors = 0;
      this._scheduleFrame(generation);
      return this.getState();
    } catch (error) {
      if (generation !== this.generation && error?.name === 'AbortError') throw error;
      const message = cameraErrorMessage(error);
      this._fail(message, generation);
      throw new Error(message, { cause: error });
    }
  }

  calibrate() {
    if (!this.interpreter || !this.stream) return false;
    const result = this.interpreter.beginCalibration();
    this._emit({
      state: 'calibrating',
      message: 'Hold a comfortable address pose with shoulders, elbows, and hands visible.',
      ...result,
    });
    return true;
  }

  setOptions(options = {}) {
    if (typeof options.deviceId === 'string') this.options.deviceId = options.deviceId;
    if (options.handedness === 'left' || options.handedness === 'right') {
      this.options.handedness = options.handedness;
    }
    if (Number.isFinite(options.sensitivity)) {
      this.options.sensitivity = Math.min(2, Math.max(0.5, options.sensitivity));
    }
    if (typeof options.reducedMotion === 'boolean') {
      this.options.reducedMotion = options.reducedMotion;
    }
    this.interpreter?.setOptions(this.options);
    return this.getState();
  }

  setArmed(armed) {
    this.armed = Boolean(armed);
    this._emit({ armed: this.armed });
    return this.armed;
  }

  stop() {
    ++this.generation;
    this._teardown();
    this._emit({
      state: 'idle',
      message: 'Camera off.',
      confidence: 0,
      calibrated: false,
      phase: 'uncalibrated',
      calibrationProgress: 0,
      lastPower: null,
    });
  }

  getState() {
    return { ...this.state };
  }

  async _loadWorker(generation) {
    let worker;
    try {
      worker = new Worker(new URL('./pose.worker.js', import.meta.url), { type: 'module' });
    } catch (error) {
      throw new Error(`Pose worker could not start: ${cameraErrorMessage(error)}`);
    }
    this.worker = worker;

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        finish(reject, new Error('Pose model loading timed out. Check the local model files and retry.'));
      }, MODEL_LOAD_TIMEOUT_MS);

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.workerInitAbort === abort) this.workerInitAbort = null;
        callback(value);
      };
      const abort = () => finish(
        reject,
        new DOMException('Camera start was stopped.', 'AbortError'),
      );
      this.workerInitAbort = abort;

      worker.onmessage = (event) => {
        const message = event.data;
        if (message.generation !== generation || generation !== this.generation) return;
        if (message.type === 'ready') {
          worker.onmessage = (nextEvent) => this._handleWorkerMessage(nextEvent, generation);
          worker.onerror = (runtimeEvent) => {
            this._fail(runtimeEvent.message || 'Pose worker stopped unexpectedly.', generation);
          };
          finish(resolve);
        } else if (message.type === 'error') {
          finish(reject, new Error(message.message));
        }
      };
      worker.onerror = (event) => {
        finish(reject, new Error(event.message || 'Pose worker failed to load.'));
      };
      worker.postMessage({ type: 'init', generation });
    });
  }

  _handleWorkerMessage(event, generation) {
    const message = event.data;
    if (generation !== this.generation || message.generation !== generation) return;
    this.inFlight = false;
    if (message.type === 'error') {
      this._fail(message.message, generation);
      return;
    }
    if (message.type !== 'result') return;

    const landmarks = message.landmarks;
    this._safeCall(this.onLandmarks, landmarks);
    const result = this.interpreter.update(landmarks, message.timestamp);
    if (result.swing && this.armed) {
      this._safeCall(this.onSwing, { power: Math.min(1.2, result.swing.power) });
    }
    this._reportGesture(result);
  }

  _reportGesture(result) {
    let state = 'tracking';
    let message = this.armed ? 'Ready to swing.' : 'Practice tracking ready.';
    if (result.phase === 'calibrating') {
      state = 'calibrating';
      message = `Hold your address pose… ${Math.round(result.calibrationProgress * 100)}%`;
    } else if (!result.calibrated) {
      state = 'ready';
      message = 'Camera ready. Calibrate before swinging.';
    } else if (result.phase === 'tracking-lost') {
      state = 'tracking-lost';
      message = 'Tracking lost; swing cancelled. Keep your shoulders, elbows, and hands in frame.';
    } else if (result.swing) {
      const percent = Math.round(result.swing.power * 100);
      message = this.armed
        ? `Swing captured: ${percent}% power.`
        : `Practice swing: ${percent}% power.`;
    } else if (result.phase === 'backswing') {
      message = 'Backswing recognized…';
    } else if (result.phase === 'forward') {
      message = 'Swing through…';
    } else if (result.phase === 'cooldown') {
      message = 'Reset to your address pose.';
    } else if (result.phase === 'rest') {
      message = this.armed ? 'Ready to swing.' : 'Practice tracking ready.';
    }
    this._emit({ state, message, ...result });
  }

  _scheduleFrame(generation) {
    if (generation !== this.generation || !this.worker) return;
    this.animationFrame = requestAnimationFrame((now) => {
      this._captureFrame(now, generation);
      this._scheduleFrame(generation);
    });
  }

  _captureFrame(now, generation) {
    if (
      generation !== this.generation
      || !this.worker
      || this.inFlight
      || this.capturingFrame
      || this.video?.readyState < 2
      || now - this.lastFrameAt < FRAME_INTERVAL_MS
    ) return;

    if (typeof createImageBitmap !== 'function') {
      this._fail('This browser cannot send camera frames to the pose worker. Try current Chrome or Edge.', generation);
      return;
    }

    this.capturingFrame = true;
    createImageBitmap(this.video)
      .then((bitmap) => {
        this.capturingFrame = false;
        if (generation !== this.generation || !this.worker) {
          bitmap.close();
          return;
        }
        this.lastFrameAt = now;
        this.inFlight = true;
        this.frameErrors = 0;
        this.worker.postMessage({
          type: 'frame',
          generation,
          timestamp: now,
          bitmap,
        }, [bitmap]);
      })
      .catch(() => {
        this.capturingFrame = false;
        this.frameErrors += 1;
        if (this.frameErrors >= 3) {
          this._fail('Camera frames could not be read. Reconnect the camera and retry.', generation);
        }
      });
  }

  _handleDisconnect(generation) {
    if (generation !== this.generation) return;
    this._fail('The camera disconnected. Reconnect it and retry, or switch to keyboard controls.', generation);
  }

  _fail(message, generation) {
    if (generation !== this.generation) return;
    this.generation += 1;
    this._teardown();
    this._emit({
      state: 'error',
      message,
      confidence: 0,
      calibrated: false,
      phase: 'tracking-lost',
      calibrationProgress: 0,
    });
  }

  _teardown() {
    this.workerInitAbort?.();
    this.workerInitAbort = null;
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'stop' });
      } catch {}
      this.worker.terminate();
    }
    this.worker = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        if (this._endedHandler) track.removeEventListener('ended', this._endedHandler);
        track.stop();
      });
    }
    this.stream = null;
    this._endedHandler = null;
    if (this.video) {
      this.video.pause?.();
      this.video.srcObject = null;
    }
    this.video = null;
    this.interpreter = null;
    this.inFlight = false;
    this.capturingFrame = false;
  }

  _emit(update) {
    this.state = { ...this.state, ...update, armed: this.armed };
    this._safeCall(this.onStatus, this.getState());
  }

  _safeCall(callback, value) {
    try {
      callback(value);
    } catch {
      // A UI callback cannot interrupt camera cleanup or gesture gating.
    }
  }
}
