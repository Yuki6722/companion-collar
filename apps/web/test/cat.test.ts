import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRealisticCat, pawCycle } from '../src/scene/cat/cat-realistic.ts';
import { CatController } from '../src/scene/cat/cat-controller.ts';

// Parse the actual shipped topology/weights, without a DOM image decoder or WebGL.
async function loadGeometry() {
  const data = await readFile(new URL('../public/assets/models/bengal-cat/bengal-cat.glb', import.meta.url));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20,20+length).toString());
  json.buffers[0].uri = `data:application/octet-stream;base64,${data.subarray(28+length).toString('base64')}`;
  delete json.images; delete json.textures; delete json.materials;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  // FileLoader uses ProgressEvent even when loading an in-memory data URI.
  if (!globalThis.ProgressEvent) Object.defineProperty(globalThis, 'ProgressEvent', {value: class ProgressEvent {}, configurable:true});
  return new GLTFLoader().parseAsync(JSON.stringify(json), '');
}

test('loaded feline skin changes pose, keeps bone lengths and survives room transforms', async () => {
  const rig = createRealisticCat('bengal', loadGeometry()); await rig.ready;
  const meshes: T.SkinnedMesh[] = [], bones: T.Bone[] = [];
  rig.root.traverse(o => { if ((o as T.SkinnedMesh).isSkinnedMesh) meshes.push(o as T.SkinnedMesh); if ((o as T.Bone).isBone) bones.push(o as T.Bone); });
  assert.ok(meshes.length > 0); assert.ok(bones.length >= 90);
  const lengths = bones.filter(b => (b.parent as T.Bone)?.isBone).map(b => [b, b.position.length()] as const);
  const pose = (posture: string) => { for(let i=0;i<90;i++) rig.animate!(1/60,{posture,gaitPhase:0,reducedMotion:true}); rig.root.updateMatrixWorld(true); };
  const body = bones.find(b=>b.name.startsWith('Root_M_'))!;
  const head = bones.find(b=>b.name.startsWith('Head_M_'))!;
  pose('standing'); const standY = body.getWorldPosition(new T.Vector3()).y; const standQ = body.quaternion.clone(); const standHead = head.getWorldPosition(new T.Vector3());
  pose('sitting'); assert.ok(body.getWorldPosition(new T.Vector3()).y < standY-0.10); assert.ok(body.quaternion.angleTo(standQ)>0.2);
  pose('lying'); assert.ok(head.getWorldPosition(new T.Vector3()).distanceTo(standHead)>0.08);
  for(const [b,l] of lengths) if(b!==body) assert.ok(Math.abs(b.position.length()-l)<0.00001, `${b.name}: stretched bone`);
  rig.root.position.set(3,1,-2); rig.root.rotation.y=1.3; pose('standing');
  assert.ok(Math.abs(body.getWorldPosition(new T.Vector3()).y-standY-1)<0.001);
  const debug = rig.debugInfo!(); assert.equal(debug.loaded,true); assert.equal(debug.separateControls,true);
  for(const foot of debug.feet as number[][]) assert.ok(foot[1]! >= 0 && foot[1]! < 0.06, `paw height ${foot[1]}`);
  rig.dispose!();
});

test('external gait survives the controller update instead of being reset to frame zero', async () => {
  const rig=createRealisticCat('bengal',loadGeometry());await rig.ready;
  const controller=new CatController(rig);
  controller.snapPoseFor('walking',true);
  controller.setExternalTransform({x:0,y:0,z:0,rotY:0},0.42);
  controller.update(1/60);
  assert.equal(controller.gaitPhase(),0.42); assert.equal(controller.currentPosture(),'walking');
  controller.setExternalTransform({x:0,y:0,z:0,rotY:0},0);controller.update(1/60);assert.equal(controller.gaitPhase(),0);
  rig.dispose!();
});

test('walk cycle has continuous endpoints and overlapping support, not a synchronized hop', () => {
  for(let phase=0;phase<1;phase+=0.01){
    const feet=[0,0.25,0.5,0.75].map(offset=>pawCycle(phase+offset));
    assert.ok(feet.filter(f=>f.stance).length>=2);
    for(const f of feet){assert.ok(Number.isFinite(f.z));assert.ok(f.lift>=0&&f.lift<=0.053);}
  }
  assert.ok(Math.abs(pawCycle(1-1e-7).z-pawCycle(0).z)<1e-5);
});

test('room timeline at 20× drives actual skeletal steps and waits for travel to finish', async () => {
  // Resolve the public core entry outside node_modules, as required by Node strip-only.
  const { registerHooks } = await import('node:module');
  const hook = registerHooks({ resolve(specifier, context, next) {
    return next(specifier === '@camp/core' ? new URL('../../../packages/core/src/index.ts', import.meta.url).href : specifier, context);
  }});
  try {
    const { CatBehaviorRuntime } = await import('../src/scene/cat/cat-behavior.ts');
    const rig=createRealisticCat('bengal',loadGeometry()); await rig.ready;
    const controller=new CatController(rig);
    const timeline={seed:42,durationS:101,timeScale:20,budgetS:{},incidents:[],segments:[
      {t:0,durS:1,activity:'resting' as const,posture:'standing' as const,anchorId:'floor-living'},
      {t:1,durS:2,activity:'locomoting' as const,posture:'walking' as const,anchorId:'floor-kitchen',resolved:true},
      {t:3,durS:98,activity:'resting' as const,posture:'standing' as const,anchorId:'floor-kitchen'},
    ]};
    const runtime=new CatBehaviorRuntime(timeline,controller);
    const positions: T.Vector3[]=[];const jointAngles: T.Quaternion[]=[];let movingFrames=0;
    const foreleg=rig.root.getObjectByName('Shoulder_L_79_83')!;
    let earlyTime=0;
    for(let i=0;i<900;i++){
      runtime.update(1/60);
      rig.animate!(1/60,{posture:controller.currentPosture(),gaitPhase:controller.gaitPhase(),activity:runtime.status().activity});
      if(i===45)earlyTime=runtime.getTimeS();
      if((rig.debugInfo!().walkWeight as number)>0.8){movingFrames++;positions.push(rig.root.position.clone());jointAngles.push(foreleg.quaternion.clone());}
    }
    assert.ok(earlyTime<3,'short locomotion segment must not be skipped by 20× clock');
    assert.ok(movingFrames>60,'must visibly step for more than one second');
    assert.ok(positions[0]!.distanceTo(positions.at(-1)!)>1,'must move through the room');
    assert.ok(jointAngles.some(q=>q.angleTo(jointAngles[0]!)>0.1),'actual skin joints must articulate');
    assert.ok(runtime.getTimeS()>3,'shared clock resumes after reaching destination');
    const stopped=rig.debugInfo!();assert.ok((stopped.walkWeight as number)<0.01,'stop stepping at the destination');
    rig.dispose!();
  } finally {hook.deregister();}
});

test('wall-clock catch-up cannot teleport the cat mid-travel', async () => {
  // Why: the behaviour clock deliberately re-derives progress from the wall clock, so that a
  // throttled background tab does not stall the demo. Reusing that same "catch-up" amount for the
  // **walk animation** is a different thing entirely: it stuffs seconds of walking into one frame.
  // Measured in the room: 0.45 m of displacement inside 50 ms (≈8.7 m/s, 20× walkSpeedMps),
  // while the same trip averages 0.48 m/s → the cat visibly teleports, then walks.
  const { registerHooks } = await import('node:module');
  const hook = registerHooks({ resolve(specifier, context, next) {
    return next(specifier === '@camp/core' ? new URL('../../../packages/core/src/index.ts', import.meta.url).href : specifier, context);
  }});
  try {
    const { CatBehaviorRuntime } = await import('../src/scene/cat/cat-behavior.ts');
    const rig = createRealisticCat('bengal', loadGeometry()); await rig.ready;
    const controller = new CatController(rig);
    const timeline = { seed: 42, durationS: 101, timeScale: 20, budgetS: {}, incidents: [], segments: [
      { t: 0, durS: 1, activity: 'resting' as const, posture: 'standing' as const, anchorId: 'floor-living' },
      { t: 1, durS: 2, activity: 'locomoting' as const, posture: 'walking' as const, anchorId: 'floor-kitchen', resolved: true },
      { t: 3, durS: 98, activity: 'resting' as const, posture: 'standing' as const, anchorId: 'floor-kitchen' },
    ]};
    const runtime = new CatBehaviorRuntime(timeline, controller, { startAtS: 0.9 });
    runtime.update(1/60);
    assert.equal(runtime.status().activity, 'locomoting', '位移段应当已经生效');
    const before = runtime.getTransform();

    // 2.5 s of real time passes with no render frame (model load / first shader compile / tab return).
    await new Promise(resolve => setTimeout(resolve, 2500));
    runtime.update(1/60);
    const after = runtime.getTransform();
    const jumped = Math.hypot(after.x - before.x, after.z - before.z);
    assert.ok(jumped < 0.15, `one update must not eat 2.5 s of catch-up (moved ${jumped.toFixed(3)} m)`);

    // A paused demo must not bank travel progress either, otherwise resuming replays it in one step.
    runtime.setPaused(true);
    const pausedAt = runtime.getTransform();
    await new Promise(resolve => setTimeout(resolve, 400));
    runtime.update(1/60);
    const drifted = Math.hypot(runtime.getTransform().x - pausedAt.x, runtime.getTransform().z - pausedAt.z);
    assert.ok(drifted < 1e-9, `paused demo must not advance travel (moved ${drifted})`);
    rig.dispose!();
  } finally { hook.deregister(); }
});
