import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRealisticCat } from './cat-realistic.ts';
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15; document.body.append(renderer.domElement);
const scene = new T.Scene(); scene.background = new T.Color(0xe7e6e2);
const camera = new T.PerspectiveCamera(35, 1, 0.01, 20);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 0.22, 0);
orbit.minDistance = 0.5; orbit.maxDistance = 3; orbit.maxPolarAngle = Math.PI*0.49;
function view(x:number,y:number,z:number):void { camera.position.set(x,y,z); orbit.update(); }
view(0.9,0.48,1.05);
scene.add(new T.HemisphereLight(0xeaf3ff,0x777b67,2));
const key = new T.DirectionalLight(0xfff5e6,3); key.position.set(-1.5,2,2); key.castShadow = true;
key.shadow.mapSize.set(2048,2048); Object.assign(key.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:0.1,far:6}); key.shadow.bias=-0.0002; scene.add(key);
const rim = new T.DirectionalLight(0xdce8ff,2.5); rim.position.set(1,1,-1.5); scene.add(rim);
const floor = new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0xe2e2dc,roughness:1})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
const rig = createRealisticCat('bengal'); scene.add(rig.root);
let pose='standing', paused=false;
const loading = document.querySelector<HTMLElement>('#loading')!;
async function loaded():Promise<void> { try { await rig.ready; loading.textContent='可旋转检查 · 实时骨骼动画'; } catch(e) {document.querySelector('#error')!.textContent=String(e);} }
void loaded();
function sync():void {document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pose===pose)));}
document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b=>b.addEventListener('click',()=>{pose=b.dataset.pose!;sync();}));sync();
document.querySelector('#pause')!.addEventListener('click',e=>{paused=!paused;(e.target as HTMLElement).textContent=paused?'继续动作':'暂停动作';});
document.querySelector('#side')!.addEventListener('click',()=>view(1.35,0.38,0));
document.querySelector('#front')!.addEventListener('click',()=>view(0,0.36,1.35));
document.querySelector('#quarter')!.addEventListener('click',()=>view(0.9,0.48,1.05));
function resize():void {camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}addEventListener('resize',resize);resize();
const clock = new T.Clock();
function frame():void {requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),0.1);if(!paused)rig.animate?.(dt,{posture:pose==='grooming'?'sitting':pose==='eating'?'crouching':pose==='walking'?'standing':pose,gaitPhase:pose==='walking'?0.5:0,previewWalk:pose==='walking',activity:pose});renderer.render(scene,camera);}
frame();
