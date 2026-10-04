/**
 * Continuous skinned cat, using the attributed Bengal asset (see CREDITS-CATS.md).
 * All lengths/angles below are animation art direction, not biological measurements.
 * A single driver owns the skeleton. Semantic controller nodes never contain the mesh.
 */
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CatRig, CatAnimationInput } from './cat-model.ts';

export const CAT_MODEL_URL = './assets/models/bengal-cat/bengal-cat.glb';
const SCALE = 0.62;
const TAU = Math.PI * 2;
const smooth = (x: number): number => x * x * (3 - 2 * x);
const V = (x = 0, y = 0, z = 0): T.Vector3 => new T.Vector3(x, y, z);
interface BoneRest { bone: T.Bone; p: T.Vector3; q: T.Quaternion; s: T.Vector3 }
interface Leg {
  upper: T.Bone; knee: T.Bone; ankle: T.Bone; toe: T.Bone;
  side: number; hind: boolean; offset: number;
  footOffset: T.Vector3; footQ: T.Quaternion; home: T.Vector3;
}

/** A four-beat walk: hind-left, fore-left, hind-right, fore-right, with overlap in support. */
export function pawCycle(phase: number): { z: number; lift: number; stance: boolean } {
  const p = ((phase % 1) + 1) % 1;
  const support = 0.72;
  if (p < support) return { z: 0.105 - 0.21 * p / support, lift: 0, stance: true };
  const k = (p - support) / (1 - support);
  return { z: -0.105 + 0.21 * smooth(k), lift: 0.052 * Math.sin(Math.PI * k), stance: false };
}

export function createRealisticCat(coat: 'bengal' | 'black', modelPromise?: Promise<{ scene: T.Group }>): CatRig {
  const root = new T.Group(); root.name = 'cat';
  const body = new T.Group(); body.name = 'cat-body-controls';
  // Dummy meshes are independent control handles, never scaled visible body parts.
  const emptyGeometry = new T.BufferGeometry();
  const emptyMaterial = new T.MeshBasicMaterial({ visible: false });
  const controlMesh = (): T.Mesh => new T.Mesh(emptyGeometry, emptyMaterial);
  const torso = controlMesh(), chest = controlMesh(), hips = controlMesh();
  const head = new T.Group(), earL = new T.Group(), earR = new T.Group();
  const eyeL = controlMesh(), eyeR = controlMesh(), pupilL = controlMesh(), pupilR = controlMesh();
  const nose = controlMesh();
  const tail = Array.from({ length: 6 }, () => new T.Group());
  const legs = Array.from({ length: 4 }, () => new T.Group());
  head.add(earL, earR, eyeL, eyeR, pupilL, pupilR, nose);
  body.add(torso, chest, hips, head, ...tail, ...legs); root.add(body);
  const visual = new T.Group(); visual.name = 'cat-skinned-visual'; visual.scale.setScalar(SCALE); root.add(visual);
  const collar = new T.Group(); collar.name = 'cat-collar'; root.add(collar);
  const whiskerZone = new T.Group(); whiskerZone.name = 'cat-whisker-zone'; whiskerZone.visible = false; root.add(whiskerZone);
  const band = new T.Mesh(new T.TorusGeometry(0.050, 0.005, 10, 64), new T.MeshStandardMaterial({ color: 0x304642, roughness: 0.85 }));
  band.name = 'collar-band'; band.scale.y = 1.1; collar.add(band);
  const pod = new T.Mesh(new T.BoxGeometry(0.025, 0.012, 0.018), new T.MeshStandardMaterial({ color: 0x212a2b, roughness: 0.55 }));
  pod.name = 'collar-pod'; pod.position.set(0, 0.056, 0); collar.add(pod);
  const led = new T.Mesh(new T.SphereGeometry(0.0018, 8, 6), new T.MeshBasicMaterial({ color: 0x69cba7 }));
  led.position.set(0.007, 0.0625, 0.003); collar.add(led);
  const electrodeMat = new T.MeshStandardMaterial({ color: 0x2f8f86, roughness: 0.35, metalness: 0.35 });
  for (const side of [-1, 1]) {
    const electrode = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.003, 12), electrodeMat);
    electrode.position.set(side*0.048, -0.005, 0); electrode.rotation.z = Math.PI/2;
    electrode.name = side > 0 ? 'collar-ecg-right' : 'collar-ecg-left'; collar.add(electrode);
  }
  const thermistor = new T.Mesh(new T.SphereGeometry(0.004, 12, 10), new T.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.55 }));
  thermistor.name = 'collar-thermistor'; thermistor.position.set(0, -0.052, 0.002); collar.add(thermistor);
  const lens = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, 0.006, 14), new T.MeshStandardMaterial({ color: 0x14161a, roughness: 0.25, metalness: 0.5 }));
  lens.name = 'collar-camera'; lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.025, 0.047); collar.add(lens);
  // Follow the same neck transform as the hardware, through walking and lowered poses.
  const povAnchor = new T.Object3D(); povAnchor.name = 'cat-pov-anchor';
  povAnchor.position.set(0, -0.025, 0.053); collar.add(povAnchor);
  const zone = new T.Mesh(new T.SphereGeometry(0.10, 16, 12), new T.MeshBasicMaterial({color:0x70cbbb,wireframe:true,transparent:true,opacity:0.25}));
  zone.scale.set(1.4, 0.7, 0.8); whiskerZone.add(zone);

  let disposed = false, loaded = false, error: string | null = null;
  let time = 0, phase = 0, walkWeight = 0;
  let low = 0, sit = 0, groom = 0, feed = 0;
  let lastPosition: T.Vector3 | null = null;
  let model: T.Group | null = null;
  let rest: BoneRest[] = [], chains: Leg[] = [];
  const bones = new Map<string, T.Bone>();
  let rootBone: T.Bone, neck: T.Bone, skull: T.Bone;
  const prev = new Map<T.Bone, { p: T.Vector3; q: T.Quaternion }>();
  let currentAction = 'loading';
  const bone = (name: string): T.Bone => {
    const found = [...bones.values()].find(b => b.name.startsWith(name));
    if (!found) throw new Error(`Cat skeleton missing ${name}`);
    return found;
  };
  const point = (b: T.Object3D): T.Vector3 => visual.worldToLocal(b.getWorldPosition(V()));
  const setPoint = (b: T.Object3D, p: T.Vector3): void => {
    b.position.copy(b.parent!.worldToLocal(visual.localToWorld(p.clone()))); b.updateMatrixWorld(true);
  };
  const turn = (b: T.Bone, x: number, y = 0, z = 0): void => {
    b.updateWorldMatrix(true, false);
    const axes = visual.getWorldQuaternion(new T.Quaternion());
    const delta = new T.Quaternion().setFromEuler(new T.Euler(x, y, z, 'YXZ'));
    delta.premultiply(axes).multiply(axes.clone().invert());
    const world = b.getWorldQuaternion(new T.Quaternion()).premultiply(delta);
    b.quaternion.copy(b.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
    b.updateMatrixWorld(true);
  };
  const aim = (b: T.Bone, child: T.Bone, target: T.Vector3): void => {
    const origin = b.getWorldPosition(V());
    const from = child.getWorldPosition(V()).sub(origin).normalize();
    const to = target.clone().sub(origin).normalize();
    const q = new T.Quaternion().setFromUnitVectors(from, to).multiply(b.getWorldQuaternion(new T.Quaternion()));
    b.quaternion.copy(b.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
    b.updateMatrixWorld(true);
  };
  const solve = (leg: Leg, toeTarget: T.Vector3): void => {
    const fold = leg.hind ? Math.min(1, low + sit) : 0;
    const footOffset = leg.footOffset.clone().lerp(V(0, -0.025, leg.footOffset.length()), fold).normalize().multiplyScalar(leg.footOffset.length());
    // Solve shoulder/elbow/wrist or hip/knee/hock; retain the paw's flat orientation.
    const target = visual.localToWorld(toeTarget.clone().sub(footOffset));
    const a = leg.upper.getWorldPosition(V()), b = leg.knee.getWorldPosition(V()), c = leg.ankle.getWorldPosition(V());
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const dir = target.clone().sub(a);
    const d = T.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 0.0001, l1 + l2 - 0.0001);
    dir.normalize();
    const pole = V(leg.side * 0.10, 0, leg.hind ? 1 : -1).transformDirection(visual.matrixWorld);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const along = (l1*l1 - l2*l2 + d*d) / (2*d);
    const joint = a.clone().addScaledVector(dir, along).addScaledVector(pole, Math.sqrt(Math.max(0, l1*l1-along*along)));
    aim(leg.upper, leg.knee, joint);
    aim(leg.knee, leg.ankle, a.clone().addScaledVector(dir, d));
    const footTurn = new T.Quaternion().setFromUnitVectors(leg.footOffset.clone().normalize(), footOffset.clone().normalize());
    const q = visual.getWorldQuaternion(new T.Quaternion()).multiply(footTurn).multiply(leg.footQ);
    leg.ankle.quaternion.copy(leg.ankle.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
    leg.ankle.updateMatrixWorld(true);
  };

  const release = (object: T.Object3D): void => {
    const textures = new Set<T.Texture>(), materials = new Set<T.Material>(), geometries = new Set<T.BufferGeometry>();
    object.traverse(o => {
      const m = o as T.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat);
      if ((o as T.SkinnedMesh).isSkinnedMesh) (o as T.SkinnedMesh).skeleton.dispose();
    });
    for (const mat of materials) { for (const value of Object.values(mat)) if (value instanceof T.Texture) textures.add(value); mat.dispose(); }
    for (const t of textures) t.dispose(); for (const g of geometries) g.dispose();
  };

  const ready = (modelPromise ?? new GLTFLoader().loadAsync(CAT_MODEL_URL)).then(gltf => {
    if (disposed) { release(gltf.scene); return; }
    model = gltf.scene; visual.add(model);
    model.traverse(o => {
      if ((o as T.Bone).isBone) bones.set(o.name, o as T.Bone);
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      // Dynamic bounds must follow skinning; stale glTF bounds can hide a crouched cat.
      mesh.frustumCulled = false;
      for (const raw of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mat = raw as T.MeshStandardMaterial;
        mat.metalness = 0; mat.roughness = 0.93;
        if (mat.map) mat.map.anisotropy = 8;
        if (coat === 'black') {
          mat.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
              vec3 coatTexel = diffuseColor.rgb;
              float luminance = dot(coatTexel, vec3(0.2126, 0.7152, 0.0722));
              float eyeMask = step(coatTexel.r * 0.98, coatTexel.g) * step(coatTexel.b * 1.4, coatTexel.g);
              vec3 blackFur = vec3(0.022, 0.026, 0.031) + pow(luminance, 0.6) * vec3(0.09, 0.095, 0.10);
              diffuseColor.rgb = mix(blackFur, coatTexel, eyeMask);
            `);
          };
          mat.customProgramCacheKey = () => 'melanistic-cat-v1';
        }
      }
    });
    root.updateMatrixWorld(true);
    rootBone = bone('Root_M_'); neck = bone('Neck1_M_'); skull = bone('Head_M_');
    rest = [...bones.values()].map(b => ({ bone:b, p:b.position.clone(), q:b.quaternion.clone(), s:b.scale.clone() }));
    for (const side of [-1, 1]) for (const hind of [false, true]) {
      const suffix = side === -1 ? 'R_' : 'L_';
      const upper = bone((hind ? 'Hip_' : 'Shoulder_') + suffix);
      const knee = bone((hind ? 'Knee_' : 'Elbow_') + suffix);
      const ankle = bone((hind ? 'Ankle_' : 'Wrist_') + suffix);
      const toe = bone((hind ? 'Toes1_' : 'Fingers1_') + suffix);
      const home = point(toe); home.x = side * 0.052; home.y = hind ? 0.032 : 0.028; home.z = hind ? -0.27 : 0.24;
      chains.push({ upper, knee, ankle, toe, side, hind, home,
        offset: hind ? (side === 1 ? 0 : 0.5) : (side === 1 ? 0.25 : 0.75),
        footOffset: point(toe).sub(point(ankle)),
        footQ: visual.getWorldQuaternion(new T.Quaternion()).invert().multiply(ankle.getWorldQuaternion(new T.Quaternion())),
      });
    }
    loaded = true; currentAction = 'standing';
  }).catch((err: unknown) => { error = String(err); throw err; });
  // Keep failures visible in diagnostics without creating an unhandled rejection in the room.
  void ready.catch(err => console.error('猫模型加载失败', err));

  const animate = (dt: number, input: CatAnimationInput): void => {
    if (!loaded || disposed || !model) return;
    dt = Math.max(0, Math.min(dt, 0.1));
    const still = input.reducedMotion ?? false;
    if (!still) time += dt;
    const position = root.position.clone();
    const distance = lastPosition ? Math.hypot(position.x-lastPosition.x, position.z-lastPosition.z) : 0;
    lastPosition = position;
    const moving = input.previewWalk || (input.gaitPhase > 0 && distance > 0.000005);
    // Phase comes from distance, so stance paws move backwards exactly as the body advances.
    if (moving && !still) phase += input.previewWalk ? dt * 1.15 : Math.min(distance, 0.08) / (0.21 * SCALE / 0.72);
    const damp = 1 - Math.exp(-dt * 9);
    walkWeight += ((moving && !still ? 1 : 0) - walkWeight) * damp;
    const lying = /lying|curled/.test(input.posture);
    const seated = input.posture === 'sitting';
    const crouched = /crouch/.test(input.posture);
    low += ((moving ? 0 : lying ? 1 : crouched ? 0.45 : 0) - low) * damp;
    sit += ((seated && !moving ? 1 : 0) - sit) * damp;
    groom += ((input.activity === 'grooming' && !moving ? 1 : 0) - groom) * damp;
    feed += ((/eating|drinking/.test(input.activity ?? '') && !moving ? 1 : 0) - feed) * damp;
    currentAction = moving ? 'walking' : input.activity === 'grooming' ? 'grooming' : input.posture;
    for (const b of rest) { b.bone.position.copy(b.p); b.bone.quaternion.copy(b.q); b.bone.scale.copy(b.s); }
    visual.position.set(0, 0, 0); visual.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    // Pelvis descends first when sitting; the spine rises towards the shoulders.
    const pelvis = point(rootBone); pelvis.y -= low*0.245 + sit*0.225;
    pelvis.y += still ? 0 : Math.sin(time*2.2)*0.002 + Math.sin(phase*TAU*2)*0.004*walkWeight;
    setPoint(rootBone, pelvis);
    turn(rootBone, -sit*0.36 + low*0.04, 0, still ? 0 : Math.sin(phase*TAU)*0.015*walkWeight);
    for (const prefix of ['RootPart1_', 'RootPart2_', 'Spine1_', 'Spine2_', 'Spine3_']) turn(bone(prefix), -sit*0.004);
    turn(neck, sit*0.27 + feed*0.65 + groom*0.38 - low*0.10 + (still ? 0 : Math.sin(time*0.65)*0.018), groom*0.18);
    turn(skull, sit*0.18 + feed*0.28 + groom*(0.28+(still ? 0 : Math.sin(time*7)*0.08)), still ? 0 : Math.sin(time*0.37)*0.075*(1-groom));
    // Tail articulation travels down a continuous weighted chain, never disconnected segments.
    const tails = [...bones.values()].filter(b => /^Tail\d+_M_/.test(b.name));
    tails.forEach((b, i) => {
      turn(b, 0, (still ? 0 : Math.sin(time*0.85-i*0.42))*0.035);
      const child = tails[i+1];
      if (!child) return;
      const before = b.quaternion.clone();
      const p = point(b);
      const target = p.clone().add(V(-0.12, 0, i < 2 ? -0.13 : 0.06));
      target.y = 0.045;
      aim(b, child, visual.localToWorld(target));
      const aimed = b.quaternion.clone();
      b.quaternion.slerpQuaternions(before, aimed, Math.min(1, low+sit));
      b.updateMatrixWorld(true);
    });
    const twitch = still ? 0 : Math.pow(Math.max(0, Math.sin(time*0.61)), 24) * 0.13;
    turn(bone('Ear1_R_R'), 0, twitch, -twitch*0.35);
    turn(bone('Ear1_R_L'), 0, -twitch*0.6, twitch*0.25);
    const blinkT = time % 5.2;
    const blink = still ? 0 : blinkT > 4.96 ? Math.sin((blinkT-4.96)/0.24*Math.PI) : 0;
    for (const side of ['R','L']) {
      turn(bone(`EyeLidUp1_R_${side}`), blink*0.16 + low*0.06);
      turn(bone(`EyeLidDn1_R_${side}`), -blink*0.06);
    }
    for (const leg of chains) {
      const target = leg.home.clone();
      const cycle = pawCycle(phase+leg.offset);
      target.z += cycle.z*walkWeight; target.y += cycle.lift*walkWeight;
      if (leg.hind) {
        target.x += leg.side*(sit*0.020+low*0.048);
        target.z += sit*0.055 + low*0.025;
      } else {
        target.z += low*0.08 - sit*0.06;
        if (leg.side === 1) {
          target.y += groom*0.25;
          target.z += groom*0.015;
          target.x -= groom*0.028;
        }
      }
      solve(leg, target);
    }
    // Small incident overlays remain visual demonstrations from the existing recipe.
    const inc = input.incident;
    if (inc && !still) {
      const f = inc.tremorFreq ?? 0, amp = inc.tremorAmp ?? 0;
      turn(rootBone, Math.sin(time*f*TAU)*amp, 0, Math.sin(time*f*TAU*0.83)*(inc.bodyTwist ?? 0)*0.5);
      turn(skull, Math.sin(time*f*TAU)*amp*2);
    }
    // Blend bone transforms, never scale a leg to make it fit a pose.
    const blend = 1-Math.exp(-dt*24);
    for (const b of rest) {
      const before = prev.get(b.bone);
      if (before) { b.bone.quaternion.slerpQuaternions(before.q, b.bone.quaternion.clone(), blend); b.bone.position.lerpVectors(before.p,b.bone.position,blend); }
      prev.set(b.bone, { p:b.bone.position.clone(), q:b.bone.quaternion.clone() });
    }
    root.updateMatrixWorld(true);
    const neckPosition = point(neck).multiplyScalar(SCALE);
    collar.position.copy(neckPosition);
    // Collar plane follows the actual neck tangent, including when lowering the head.
    const tangent = point(skull).sub(point(bone('Neck_M_'))).normalize();
    collar.quaternion.setFromUnitVectors(V(0,0,1), tangent);
    whiskerZone.position.copy(point(skull).multiplyScalar(SCALE)).add(V(0,0,0.035));
  };
  return {
    root, body, torso, chest, hips, head, earL, earR, eyeL, eyeR, pupilL, pupilR, nose,
    tail, legs, breathParts: [], furShells: [], collar, whiskerZone, povAnchor, ready, animate,
    debugInfo: () => ({ loaded, error, coat, action:currentAction, bones:bones.size, phase, walkWeight,
      feet:chains.map(l => point(l.toe).toArray().map(n => Math.round(n*SCALE*1000)/1000)),
      // 头骨原点（视觉局部坐标）：它随躯干/脊柱旋转而移动，是**身体真的在动**的唯一可断言信号。
      // 只查 `action` 或 `incident` 参数区分不出「标签在报、身体没动」——那正是上一轮的故障形态。
      head: loaded ? point(skull).toArray().map(n => Math.round(n*SCALE*10000)/10000) : null,
      separateControls: chest !== hips && chest !== torso, modelUrl:CAT_MODEL_URL }),
    dispose: () => { disposed=true; release(root); },
  };
}
