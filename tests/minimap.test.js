import test from 'node:test';
import assert from 'node:assert/strict';
import { getMinimapShotGeometry } from '../src/ui/minimap.js';

test('putting geometry follows every sampled slope bend to its stopping point', () => {
  const prediction = {
    path: [
      { x: 0, z: 0, t: 0 },
      { x: 0.4, z: 2, t: 0.2 },
      { x: 1.3, z: 4, t: 0.4 },
      { x: 2.8, z: 5.5, t: 0.6 },
    ],
    landing: { x: 0, z: 0 },
    stop: { x: 2.8, z: 5.5 },
    end: { x: 2.8, z: 5.5 },
    penalty: 0,
  };

  const geometry = getMinimapShotGeometry(prediction, { id: 'putter' });
  assert.deepEqual(geometry.solidPath, prediction.path.map(({ x, z }) => ({ x, z })));
  assert.deepEqual(geometry.rollPath, []);
  assert.deepEqual(geometry.target, prediction.stop);
  assert.equal(geometry.hazardPoint, null);
  assert.equal(geometry.resetPoint, null);
});

test('hazard geometry terminates at impact and reports the separate playable reset', () => {
  const prediction = {
    path: [
      { x: 0, z: 0, t: 0 },
      { x: 2, z: 100, t: 1 },
      { x: 4, z: 180, t: 2 },
      { x: 5, z: 210, t: 3 },
    ],
    landing: { x: 4, z: 180 },
    stop: { x: 5, z: 210 },
    end: { x: 0, z: 0 },
    penalty: 1,
  };

  const geometry = getMinimapShotGeometry(prediction, { id: 'driver' });
  assert.deepEqual(geometry.solidPath, prediction.path.slice(0, 3).map(({ x, z }) => ({ x, z })));
  assert.deepEqual(geometry.rollPath, prediction.path.slice(2).map(({ x, z }) => ({ x, z })));
  assert.deepEqual(geometry.hazardPoint, prediction.stop);
  assert.deepEqual(geometry.resetPoint, prediction.end);
  assert.notDeepEqual(geometry.rollPath.at(-1), prediction.end);
});

test('full-shot geometry preserves sampled flight and curved rollout', () => {
  const prediction = {
    path: [
      { x: 0, z: 0, t: 0 },
      { x: 1, z: 50, t: 1 },
      { x: 3, z: 95, t: 2 },
      { x: 6, z: 120, t: 2.5 },
      { x: 11, z: 138, t: 3 },
    ],
    landing: { x: 3, z: 95 },
    landingPathIndex: 2,
    stop: { x: 11, z: 138 },
    end: { x: 11, z: 138 },
    penalty: 0,
  };

  const geometry = getMinimapShotGeometry(prediction, { id: 'iron5' });
  assert.deepEqual(geometry.solidPath, prediction.path.slice(0, 3).map(({ x, z }) => ({ x, z })));
  assert.deepEqual(geometry.rollPath, prediction.path.slice(2).map(({ x, z }) => ({ x, z })));
  assert.deepEqual(geometry.target, prediction.landing);
  assert.deepEqual(geometry.stopPoint, prediction.stop);
  assert.equal(geometry.hazardPoint, null);
  assert.equal(geometry.resetPoint, null);
});
