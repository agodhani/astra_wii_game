const LANDMARK = Object.freeze({
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
});

const REQUIRED = Object.values(LANDMARK);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointConfidence(point) {
  if (!point) return 0;
  const visibility = point.visibility ?? 1;
  const presence = point.presence ?? 1;
  if (!Number.isFinite(visibility) || !Number.isFinite(presence)) return 0;
  return clamp(Math.min(visibility, presence), 0, 1);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readPose(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length <= LANDMARK.RIGHT_WRIST) {
    return { confidence: 0 };
  }

  const confidence = Math.min(...REQUIRED.map((index) => pointConfidence(landmarks[index])));
  if (REQUIRED.some((index) => (
    !Number.isFinite(landmarks[index]?.x) || !Number.isFinite(landmarks[index]?.y)
  ))) {
    return { confidence: 0 };
  }
  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y,
  );
  if (!Number.isFinite(shoulderWidth) || shoulderWidth < 0.025) {
    return { confidence: 0 };
  }

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const wristMidX = (
    landmarks[LANDMARK.LEFT_WRIST].x + landmarks[LANDMARK.RIGHT_WRIST].x
  ) / 2;
  const elbowMidX = (
    landmarks[LANDMARK.LEFT_ELBOW].x + landmarks[LANDMARK.RIGHT_ELBOW].x
  ) / 2;

  return {
    confidence,
    relativeArmX: ((wristMidX * 0.78 + elbowMidX * 0.22) - shoulderMidX) / shoulderWidth,
    rightwardSign: Math.sign(rightShoulder.x - leftShoulder.x) || -1,
  };
}

export class GestureInterpreter {
  constructor(options = {}) {
    this.options = {
      handedness: 'right',
      sensitivity: 1,
      reducedMotion: false,
      confidenceThreshold: 0.55,
      cooldownMs: 900,
      calibrationSamples: 20,
      backswingTimeoutMs: 1200,
      forwardTimeoutMs: 700,
    };
    this.calibration = null;
    this.calibrationReadings = [];
    this.lastPower = null;
    this.setOptions(options);
    this.resetMotion('uncalibrated');
  }

  setOptions(options = {}) {
    const previousHandedness = this.options.handedness;
    this.options.handedness = options.handedness === 'left' ? 'left' : (
      options.handedness === 'right' ? 'right' : this.options.handedness
    );
    if (Number.isFinite(options.sensitivity)) {
      this.options.sensitivity = clamp(options.sensitivity, 0.5, 2);
    }
    if (typeof options.reducedMotion === 'boolean') {
      this.options.reducedMotion = options.reducedMotion;
    }
    if (Number.isFinite(options.confidenceThreshold)) {
      this.options.confidenceThreshold = clamp(options.confidenceThreshold, 0.25, 0.95);
    }
    if (Number.isFinite(options.cooldownMs)) {
      this.options.cooldownMs = clamp(options.cooldownMs, 400, 2500);
    }
    if (Number.isFinite(options.calibrationSamples)) {
      this.options.calibrationSamples = Math.round(clamp(options.calibrationSamples, 3, 120));
    }
    if (Number.isFinite(options.backswingTimeoutMs)) {
      this.options.backswingTimeoutMs = clamp(options.backswingTimeoutMs, 500, 3000);
    }
    if (Number.isFinite(options.forwardTimeoutMs)) {
      this.options.forwardTimeoutMs = clamp(options.forwardTimeoutMs, 300, 1800);
    }
    if (previousHandedness && previousHandedness !== this.options.handedness) {
      this.resetMotion(this.calibration ? 'rest' : 'uncalibrated');
    }
    return this.getState();
  }

  beginCalibration() {
    this.calibration = null;
    this.calibrationReadings = [];
    this.lastPower = null;
    this.cooldownUntil = 0;
    this.resetMotion('calibrating');
    return this.getState();
  }

  resetTracking() {
    this.resetMotion(this.calibration ? 'tracking-lost' : 'uncalibrated');
    return this.getState();
  }

  resetMotion(phase) {
    this.phase = phase;
    this.readyFrames = 0;
    this.lastSide = null;
    this.lastTimestamp = null;
    this.backswingPeak = 0;
    this.peakForwardSpeed = 0;
    this.phaseStartedAt = null;
    this.cooldownUntil = this.cooldownUntil ?? 0;
  }

  update(landmarks, timestamp = performance.now()) {
    const pose = readPose(landmarks);
    const valid = pose.confidence >= this.options.confidenceThreshold;

    if (!valid) {
      this.resetMotion(this.calibration ? 'tracking-lost' : (
        this.phase === 'calibrating' ? 'calibrating' : 'uncalibrated'
      ));
      return this.result(pose.confidence);
    }

    if (this.phase === 'calibrating') {
      const previousReading = this.calibrationReadings.at(-1);
      if (
        previousReading !== undefined
        && Math.abs(pose.relativeArmX - previousReading) > 0.12
      ) {
        this.calibrationReadings = [pose.relativeArmX];
      } else {
        this.calibrationReadings.push(pose.relativeArmX);
      }
      if (this.calibrationReadings.length >= this.options.calibrationSamples) {
        this.calibration = { restArmX: average(this.calibrationReadings) };
        this.resetMotion('rest');
      }
      return this.result(pose.confidence);
    }

    if (!this.calibration) {
      this.phase = 'uncalibrated';
      return this.result(pose.confidence);
    }

    const handSign = this.options.handedness === 'right'
      ? pose.rightwardSign
      : -pose.rightwardSign;
    const side = (pose.relativeArmX - this.calibration.restArmX) * handSign;
    const elapsed = this.lastTimestamp === null ? 0 : Math.max(1, timestamp - this.lastTimestamp);
    const velocity = this.lastSide === null ? 0 : (side - this.lastSide) / elapsed;
    this.lastSide = side;
    this.lastTimestamp = timestamp;

    if (timestamp < this.cooldownUntil) {
      this.phase = 'cooldown';
      return this.result(pose.confidence);
    }
    if (this.phase === 'cooldown' || this.phase === 'tracking-lost') {
      this.resetMotion('rest');
      this.lastSide = side;
      this.lastTimestamp = timestamp;
    }

    const phaseTimedOut = (
      this.phase === 'backswing'
      && timestamp - this.phaseStartedAt > this.options.backswingTimeoutMs
    ) || (
      this.phase === 'forward'
      && timestamp - this.phaseStartedAt > this.options.forwardTimeoutMs
    );
    if (phaseTimedOut) {
      this.resetMotion('rest');
      this.lastSide = side;
      this.lastTimestamp = timestamp;
      return this.result(pose.confidence);
    }

    const motionScale = this.options.reducedMotion ? 0.62 : 1;
    const sensitivity = this.options.sensitivity;
    const restThreshold = 0.18 * motionScale;
    const backswingThreshold = 0.52 * motionScale / sensitivity;
    const followThroughThreshold = 0.28 * motionScale / sensitivity;
    const forwardSpeedThreshold = 0.003 * motionScale / sensitivity;

    if (this.phase === 'rest') {
      if (Math.abs(side) <= restThreshold) {
        this.readyFrames += 1;
      }
      if (side > backswingThreshold && this.readyFrames >= 2) {
        this.phase = 'backswing';
        this.phaseStartedAt = timestamp;
        this.backswingPeak = side;
        this.peakForwardSpeed = 0;
      }
      return this.result(pose.confidence);
    }

    if (this.phase === 'backswing') {
      this.backswingPeak = Math.max(this.backswingPeak, side);
      this.peakForwardSpeed = Math.max(this.peakForwardSpeed, -velocity);
      if (
        side < this.backswingPeak - 0.14 * motionScale
        && velocity < -forwardSpeedThreshold
      ) {
        this.phase = 'forward';
        this.phaseStartedAt = timestamp;
      }
    } else if (this.phase === 'forward') {
      this.peakForwardSpeed = Math.max(this.peakForwardSpeed, -velocity);
    }

    if (this.phase === 'forward' && side <= -followThroughThreshold) {
      const travel = this.backswingPeak - side;
      const requiredTravel = 0.78 * motionScale / sensitivity;
      if (travel >= requiredTravel) {
        const effectiveTravel = travel * sensitivity / motionScale;
        const effectiveSpeed = this.peakForwardSpeed * sensitivity / motionScale;
        const power = clamp(
          0.58 * (effectiveTravel / 1.35) + 0.42 * (effectiveSpeed / 0.012),
          0,
          1.2,
        );
        this.lastPower = Math.round(power * 1000) / 1000;
        this.cooldownUntil = timestamp + this.options.cooldownMs;
        this.phase = 'cooldown';
        return this.result(pose.confidence, { power: this.lastPower });
      }
    }

    return this.result(pose.confidence);
  }

  result(confidence = 0, swing = null) {
    return {
      phase: this.phase,
      confidence,
      calibrated: Boolean(this.calibration),
      calibrationProgress: this.phase === 'calibrating'
        ? this.calibrationReadings.length / this.options.calibrationSamples
        : (this.calibration ? 1 : 0),
      lastPower: this.lastPower,
      swing,
    };
  }

  getState() {
    return this.result(0);
  }
}

export function createGestureInterpreter(options) {
  return new GestureInterpreter(options);
}
