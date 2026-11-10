import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function Rod({ start, end, radius = .025, color = '#c2c9c5' }: { start: number[]; end: number[]; radius?: number; color?: string }) {
  const a = new THREE.Vector3(start[0],start[1],start[2]), b = new THREE.Vector3(end[0],end[1],end[2]);
  const direction = b.clone().sub(a);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return <mesh position={a.clone().add(b).multiplyScalar(.5)} quaternion={rotation} castShadow><cylinderGeometry args={[radius, radius, direction.length(), 8]} /><meshStandardMaterial color={color} roughness={.4} metalness={.6} /></mesh>;
}
function Dish() {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry(), points: number[] = [], indices: number[] = [];
    const rings = 26, slices = 100, radius = 1.38;
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= slices; i++) {
      const r = j / rings * radius, t = i / slices * Math.PI * 2;
      points.push(Math.cos(t) * r, Math.sin(t) * r, r * r * .27);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < slices; i++) { const a = j * (slices + 1) + i, b = a + slices + 1; indices.push(a,b,a+1,b,b+1,a+1); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(points,3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }, []);
  return <group rotation={[-.24, .42, .05]}>
    <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#e5e9e4" side={THREE.DoubleSide} roughness={.34} metalness={.28} /></mesh>
    <mesh position={[0,0,.515]}><torusGeometry args={[1.38,.035,10,100]} /><meshStandardMaterial color="#bec8c4" metalness={.6} roughness={.3} /></mesh>
    {Array.from({length: 16}, (_,i) => { const t = i / 16 * Math.PI * 2; return <Rod key={i} start={[Math.cos(t)*.35,Math.sin(t)*.35,.02]} end={[Math.cos(t)*1.37,Math.sin(t)*1.37,.5]} radius={.012} color="#bdc8c1" />; })}
    {[0,2.094,4.188].map(t => <Rod key={t} start={[Math.cos(t)*1.2,Math.sin(t)*1.2,.4]} end={[0,0,1.13]} radius={.023} color="#829994" />)}
    <mesh position={[0,0,1.14]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.08,.12,.25,16]} /><meshStandardMaterial color="#455d5c" metalness={.6} roughness={.3} /></mesh>
    <mesh position={[0,0,-.16]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.28,.38,.45,20]} /><meshStandardMaterial color="#a6b4ae" metalness={.45} roughness={.5} /></mesh>
  </group>;
}
function EchoField({progress,pulse}:{progress:React.RefObject<number>;pulse:React.RefObject<number>}){
  const cells=useRef<THREE.InstancedMesh>(null),field=useRef<THREE.Group>(null),pulseRing=useRef<THREE.Mesh>(null),sheet=useRef<THREE.Mesh>(null);
  const invalidate=useThree(s=>s.invalidate);
  const samples=useMemo(()=>Array.from({length:35*18},(_,i)=>{
    const az=.48+Math.floor(i/18)/34*2.0,r=2.0+(i%18)*.36;
    const x=Math.sin(az)*r,z=Math.cos(az)*r;
    const echo=Math.exp(-((x-4.1)**2+(z+1.4)**2)/5)+.6*Math.exp(-((x-3.1)**2+(z-3.3)**2)/2.5);
    return{x,z,height:.08+echo*2.5,color:new THREE.Color().setHSL(.47+echo*.04,.37,.75-echo*.28)};
  }),[]);
  const beam=useMemo(()=>{
    const positions:number[]=[];for(let i=0;i<28;i++){const a=.48+i/28*2,b=.48+(i+1)/28*2;positions.push(0,4.85,.2,Math.sin(a)*8,.08,Math.cos(a)*8,Math.sin(b)*8,.08,Math.cos(b)*8)}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;
  },[]);
  useLayoutEffect(()=>{if(!cells.current)return;const dummy=new THREE.Object3D();samples.forEach((s,i)=>{dummy.position.set(s.x,s.height/2+.06,s.z);dummy.scale.set(.11,s.height,.11);dummy.updateMatrix();cells.current!.setMatrixAt(i,dummy.matrix);cells.current!.setColorAt(i,s.color)});cells.current.instanceMatrix.needsUpdate=true;invalidate()},[samples,invalidate]);
  useFrame(()=>{
    const p=progress.current,age=(performance.now()-pulse.current)/1800,live=age>=0&&age<1;
    if(field.current){field.current.scale.y=.035+p*.965;field.current.rotation.y=-.06+p*.1;}
    if(cells.current)(cells.current.material as THREE.MeshStandardMaterial).opacity=.3+p*.65;
    if(sheet.current)(sheet.current.material as THREE.MeshBasicMaterial).opacity=.045+p*.045+(live?(1-age)*.06:0);
    if(pulseRing.current){pulseRing.current.visible=live;pulseRing.current.scale.setScalar(.4+age*9);(pulseRing.current.material as THREE.MeshBasicMaterial).opacity=(1-age)*.7;}
    if(live)invalidate();
  });
  return <>
    <mesh ref={sheet} geometry={beam}><meshBasicMaterial color="#55b9b7" transparent opacity={.05} side={THREE.DoubleSide} depthWrite={false}/></mesh>
    <group ref={field}><instancedMesh ref={cells} args={[undefined,undefined,samples.length]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#fff" transparent opacity={.4} roughness={.32} metalness={.3}/></instancedMesh></group>
    {[2.5,4,5.5,7].map((r,i)=><mesh key={r} position={[0,.035,0]} rotation={[-Math.PI/2,0,-.48]}><ringGeometry args={[r,r+.018,80,1,0,2.0]}/><meshBasicMaterial color="#56a6a4" transparent opacity={.6-i*.1} side={THREE.DoubleSide}/></mesh>)}
    <mesh ref={pulseRing} rotation={[-Math.PI/2,0,0]} position={[0,.04,0]} visible={false}><ringGeometry args={[.98,1,100]}/><meshBasicMaterial color="#52b8b3" transparent opacity={.7} side={THREE.DoubleSide} depthWrite={false}/></mesh>
  </>;
}
function Model({ progress, rotation, still, pulse }: { progress: React.RefObject<number>; rotation: React.RefObject<number>; still: boolean; pulse:React.RefObject<number> }) {
  const antenna = useRef<THREE.Group>(null), model = useRef<THREE.Group>(null), waves = useRef<THREE.Group>(null);
  const invalidate=useThree(state=>state.invalidate);
  useEffect(()=>{const refresh=()=>invalidate();window.addEventListener('pointermove',refresh);window.addEventListener('scroll',refresh,{passive:true});window.addEventListener('click',refresh);return()=>{window.removeEventListener('pointermove',refresh);window.removeEventListener('scroll',refresh);window.removeEventListener('click',refresh)}},[invalidate]);
  useFrame(({ pointer,camera }) => {
    if (antenna.current && !still) {antenna.current.rotation.y = THREE.MathUtils.lerp(antenna.current.rotation.y, pointer.x * .36, .07);if(Math.abs(antenna.current.rotation.y-pointer.x*.36)>.001)invalidate();}
    if (model.current) model.current.rotation.y = -.3 + rotation.current;
    camera.position.set(12-progress.current*2,8+progress.current*4,15+progress.current);camera.lookAt(progress.current*1.8,2.5-progress.current*1.1,0);
    if (waves.current) { waves.current.scale.setScalar(1 + progress.current*.65); waves.current.rotation.y = progress.current*.12; }
  });
  return <>
    <group ref={model} position={[0,0,0]}>
      <mesh position={[0,.13,0]} receiveShadow castShadow><cylinderGeometry args={[1.42,1.54,.26,8]} /><meshStandardMaterial color="#c7cec7" roughness={.92} /></mesh>
      <mesh position={[0,1.68,0]} receiveShadow castShadow><cylinderGeometry args={[.63,.92,3.1,8]} /><meshStandardMaterial color="#d9ded4" roughness={.85} /></mesh>
      <mesh position={[0,3.35,0]} receiveShadow castShadow><cylinderGeometry args={[1.1,1.1,.2,32]} /><meshStandardMaterial color="#d0d8d1" roughness={.65} metalness={.2} /></mesh>
      <mesh position={[0,3.98,0]} castShadow><cylinderGeometry args={[.38,.42,1.1,16]} /><meshStandardMaterial color="#79948d" roughness={.4} metalness={.5} /></mesh>
      <group ref={antenna} position={[0,4.85,0]}><Dish /></group>
      {[3.49,3.87].map(y => <mesh key={y} position={[0,y,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[1.08,.019,8,64]} /><meshStandardMaterial color="#a8b9b1" metalness={.7} roughness={.4} /></mesh>)}
      {Array.from({length: 20}, (_,i) => {const t = i /20 *Math.PI*2; return <Rod key={i} start={[Math.cos(t)*1.08,3.4,Math.sin(t)*1.08]} end={[Math.cos(t)*1.08,3.88,Math.sin(t)*1.08]} radius={.014} />;})}
      <mesh position={[.007,1.02,.815]} rotation={[-.075,0,0]}><boxGeometry args={[.42,1.25,.055]} /><meshStandardMaterial color="#6c8079" roughness={.7} /></mesh>
      <mesh position={[.26,1.55,.82]}><boxGeometry args={[.035,.045,.04]} /><meshStandardMaterial color="#d0d8d1" /></mesh>
      <Rod start={[-.7,.27,-.5]} end={[-.48,3.26,-.4]} radius={.035} color="#99aaa0" />
      {Array.from({length:12},(_,i)=><Rod key={i} start={[-.9+i*.018,.4+i*.24,-.36]} end={[-.52+i*.008,.4+i*.24,-.64]} radius={.018} />)}
      <mesh position={[0,3.2,.65]}><boxGeometry args={[.4,.22,.04]} /><meshStandardMaterial color="#2b6669" /></mesh>
    </group>
    <group ref={waves} position={[0,.018,0]}>{[2.3,3.7,5.1,6.5,7.9].map((r,i) => <mesh key={r} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[r,r+.014,128]} /><meshBasicMaterial color="#72b8b5" transparent opacity={.35-i*.045} side={THREE.DoubleSide} depthWrite={false} /></mesh>)}</group>
    <EchoField progress={progress} pulse={pulse}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.02,0]} receiveShadow><planeGeometry args={[200,200]} /><shadowMaterial transparent opacity={.12} /></mesh>
  </>;
}
export default function RadarScene({ progress, rotation, still, pulse }: { progress: React.RefObject<number>; rotation: React.RefObject<number>; still: boolean; pulse:React.RefObject<number> }) {
  return <Canvas frameloop="demand" shadows={!still} dpr={[1,still ? 1 : 1.5]} camera={{position:[12,8,15],fov:33}} gl={{ antialias:true, alpha:true, powerPreference:'low-power' }} onCreated={({camera})=>camera.lookAt(0,2.5,0)}>
    <ambientLight intensity={1.5} /><hemisphereLight args={['#eff6fa','#bac1ae',2]} />
    <directionalLight position={[-5,10,5]} intensity={3.3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={10} shadow-camera-bottom={-6} shadow-bias={-.001} />
    <directionalLight position={[5,4,-6]} intensity={2} color="#c9e3e8" />
    <Suspense fallback={null}><Model progress={progress} rotation={rotation} still={still} pulse={pulse}/></Suspense>
  </Canvas>;
}
