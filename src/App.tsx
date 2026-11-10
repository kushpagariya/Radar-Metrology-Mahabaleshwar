import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, ArrowRight, ArrowDown, Move, Radar, Menu, X, MousePointer2, Radio } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Dashboard from './Dashboard';
import Plot from './Plot';
import { makeDemoScan } from './data';
const RadarScene=lazy(()=>import('./RadarScene'));
gsap.registerPlugin(ScrollTrigger);

class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?<div className="scene-fallback"><img src="/radar-poster.png" alt="Representative three-dimensional radar model" onError={e=>{e.currentTarget.style.display='none'}} /><Radar size={140} strokeWidth={.5}/><span>Explore the research workspace below</span></div>:this.props.children}
}
export function Brand({dark=false}:{dark?:boolean}){return <span className={`brand ${dark?'brand-dark':''}`}><span className="brand-mark"><Radar size={25} strokeWidth={1.3}/></span><span>Radar Metrology<span className="brand-place">Mahabaleshwar</span></span></span>}

function Landing(){
  const hero=useRef<HTMLElement>(null),progress=useRef(0),rotation=useRef(0),pulse=useRef(-10000),drag=useRef<number|null>(null);
  const [still,setStill]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 700px)').matches);
  const [menu,setMenu]=useState(false);
  const scan=useMemo(()=>makeDemoScan(),[]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 700px)');const change=()=>setStill(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);
  },[]);
  useEffect(()=>{
    if(still){hero.current?.style.setProperty('--journey','0');progress.current=0;return;}
    const trigger=ScrollTrigger.create({trigger:hero.current,start:'top top',end:'bottom bottom',scrub:true,onUpdate:self=>{progress.current=self.progress;hero.current?.style.setProperty('--journey',String(self.progress))}});
    return()=>trigger.kill();
  },[still]);
  return <div className="landing">
    <a className="skip-link" href="#landing-content">Skip to content</a>
    <header className="landing-nav"><a href="#/" aria-label="Radar Metrology home"><Brand/></a><button className="mobile-menu icon-button" aria-label={menu?'Close navigation':'Open navigation'} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button><nav className={menu?'nav-open':''} aria-label="Main navigation"><a href="#instrument" onClick={()=>setMenu(false)}>The radar</a><a href="#workflow" onClick={()=>setMenu(false)}>Our approach</a><a className="btn btn-small btn-outline" href="#/dashboard">Open workspace <ArrowUpRight size={15}/></a></nav></header>
    <main id="landing-content">
      <section ref={hero} className={`hero ${still?'still':''}`} aria-label="Beam to Data interactive exhibition">
        <div className="hero-sticky">
          <div className="hero-copy"><h1>Explore the<br/><span>unseen.</span></h1><p>An interactive look into weather radar.<br/>Mahabaleshwar, Western Ghats.</p><a className="btn btn-primary" href="#/dashboard">Enter the radar workspace <ArrowUpRight size={17}/></a><span className="hero-prototype">A scientific exhibition · demonstration prototype</span></div>
          <div className="transition-copy"><h2>One beam.<br/>Many dimensions.</h2><p>An illustrative field of sampled echoes.<br/>Explore how weather signals take shape.</p><a className="btn btn-primary" href="#/dashboard">Open the scan explorer <ArrowUpRight size={17}/></a></div>
          <div className="atmosphere-word" aria-hidden="true">ATMOSPHERE</div>
          <div className="radar-stage" onPointerDown={e=>{if(!still){drag.current=e.clientX;e.currentTarget.setPointerCapture(e.pointerId)}}} onPointerMove={e=>{if(drag.current!==null&&!still){rotation.current+=(e.clientX-drag.current)*.006;drag.current=e.clientX}}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} role="img" aria-label="Representative radar model. Move the cursor to steer the antenna; drag to rotate the view.">
            {still?<img className="radar-static-poster" src="/radar-poster.png" width="700" height="650" alt="Representative radar and illustrative sampling field in a light studio"/>:<SceneBoundary><Suspense fallback={<div className="scene-loading"><Radar size={48} strokeWidth={1}/></div>}><RadarScene progress={progress} rotation={rotation} still={still} pulse={pulse}/></Suspense></SceneBoundary>}
          </div>
          <div className="hero-instrument"><span className="instrument-dot"/><div><strong>Representative radar model</strong><span>Beam to Data · Mahabaleshwar</span></div></div>
          <div className="hero-interaction"><MousePointer2 size={14}/><span>Steer</span><Move size={14}/><span>Rotate</span><button className="signal-button" onClick={()=>pulse.current=performance.now()}><Radio size={14}/>Send a pulse</button><button className="text-button" onClick={()=>rotation.current=0} aria-label="Reset radar rotation">Reset</button></div>
          <div className="signal-journey" aria-label="Signal journey"><span>Transmit</span><span>Sample</span><span>Explore</span><div><i/></div></div>
          <a className="scroll-cue" href="#instrument"><ArrowDown size={16}/><span>{still?'Discover the radar':'Scroll to follow the beam'}</span></a>
        </div>
      </section>
      <section id="instrument" className="instrument-section wrap">
        <div className="section-intro"><h2>A different view<br/>of the atmosphere.</h2><p>The Western Ghats shape the rain. Radar helps us explore what happens above them.</p></div>
        <div className="science-preview"><div className="preview-head"><span><span className="instrument-dot"/> Reflectivity workspace</span><span>Synthetic demonstration</span></div><Plot scan={scan} compact/><div className="preview-legend"><span>0</span><div/ ><span>60 dBZ</span></div><a href="#/dashboard" className="preview-action" aria-label="Open reflectivity explorer"><ArrowUpRight size={22}/></a></div>
        <div className="instrument-details"><div><h3>The instrument.</h3><p>A representative X-band radar model introduces the path from an emitted beam to a scientific observation.</p></div><div><h3>The observation.</h3><p>Explore reflectivity in dBZ, selected elevations and geographical context in a focused research workspace.</p><a className="link" href="#/dashboard">Take a closer look <ArrowRight size={16}/></a></div></div>
      </section>
      <section id="workflow" className="workflow-section"><div className="wrap"><div className="workflow-heading"><h2>From observation<br/>to understanding.</h2><p>A clear path through radar data.<br/>Every output keeps its method in view.</p></div><div className="workflow-steps"><div><span className="step-index">01 / INPUT</span><h3>Bring a scan.</h3><p>Start with the illustrative volume or inspect a NetCDF file through the local Python service.</p></div><div><span className="step-index">02 / EXPLORE</span><h3>Find a perspective.</h3><p>Select an elevation, adjust the display and inspect the values behind the reflectivity plot.</p></div><div><span className="step-index">03 / INTERPRET</span><h3>Follow the method.</h3><p>Explore formula-based rainfall estimates with explicit assumptions, units and parameters.</p></div></div><a className="btn btn-primary" href="#/dashboard">Enter the research workspace <ArrowUpRight size={17}/></a></div></section>
    </main>
    <footer className="landing-footer wrap"><Brand/><div><span>Independent research prototype</span><span>Representative model · illustrative landing visualization</span></div><a className="link" href="#/dashboard/methods">Data & methodology <ArrowUpRight size={14}/></a></footer>
  </div>;
}
export default function App(){
  const [route,setRoute]=useState(window.location.hash);
  useEffect(()=>{const change=()=>{setRoute(window.location.hash);if(window.location.hash.startsWith('#/'))window.scrollTo(0,0)};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[]);
  return route.startsWith('#/dashboard')?<Dashboard initialPage={route.endsWith('/methods')?'methods':'workspace'}/>:<Landing/>;
}
