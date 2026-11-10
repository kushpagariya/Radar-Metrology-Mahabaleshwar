import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { colorFor, formatDistance, rainRate, type Scan, type Field } from './data';

type Props = {scan: Scan; field?: Field; range?: number; min?:number; max?:number; a?:number; b?:number; map?:boolean; rings?:boolean; compact?:boolean; canvasRef?:React.RefObject<HTMLCanvasElement|null>};
export default function Plot({scan,field='reflectivity',range=82.5,min=0,max=60,a=200,b=1.6,map=false,rings=true,compact=false,canvasRef}:Props) {
  const ownRef=useRef<HTMLCanvasElement>(null), ref=canvasRef||ownRef;
  const [probe,setProbe]=useState<{value:number|null;az:number;range:number}|null>(null);
  const [pan,setPan]=useState({x:0,y:0}), [zoom,setZoom]=useState(1);
  const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
  useEffect(()=>{setPan({x:0,y:0});setZoom(1)},[range,map,scan.id]);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const draw=()=>{
      const rect={width:canvas.clientWidth,height:canvas.clientHeight}, dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;
      const ctx=canvas.getContext('2d')!;ctx.scale(dpr,dpr);
      const w=rect.width,h=rect.height,cx=w/2+pan.x,cy=h/2+pan.y, radius=Math.min(w,h)*.405*zoom;
      ctx.fillStyle=map?'#edf0e9':'#f8faf8';ctx.fillRect(0,0,w,h);
      if(map){
        ctx.strokeStyle='#cfd7cc';ctx.lineWidth=1;
        // Illustrative contour geometry; deliberately not presented as surveyed terrain.
        for(let k=-9;k<15;k++){ctx.beginPath();for(let y=0;y<h;y+=5){const x=w*.34+k*24+Math.sin(y/90+k*.3)*22+Math.sin(y/39)*8; y?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()}
        ctx.fillStyle='#dce8e5';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(w*.09,0);ctx.bezierCurveTo(w*.20,h*.25,w*.05,h*.6,w*.19,h);ctx.lineTo(0,h);ctx.fill();
      }
      const scale=radius/range;
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
      for(let ai=0;ai<scan.azimuths.length;ai++){
        const az=scan.azimuths[ai], next=ai<scan.azimuths.length-1?scan.azimuths[ai+1]:az+(az-scan.azimuths[ai-1]||1);
        // Limit each ray to its actual angular sampling; never fill missing sectors.
        const width=Math.min(3,Math.abs(next-az)||1)*Math.PI/180;
        const angle=az*Math.PI/180-Math.PI/2;
        scan.ranges.forEach((r,ri)=>{
          const dbz=scan.values[ai]?.[ri];if(dbz==null||r>range)return;
          const v=field==='rainfall'?rainRate(dbz,a,b):dbz;
          const inner=(ri? (scan.ranges[ri-1]+r)/2:Math.max(0,r-(scan.ranges[1]-r)/2))*scale;
          const outer=(ri<scan.ranges.length-1?(r+scan.ranges[ri+1])/2:r+(r-scan.ranges[ri-1])/2)*scale;
          ctx.beginPath();ctx.arc(cx,cy,outer,angle-width/2,angle+width/2+.003);ctx.arc(cx,cy,inner,angle+width/2+.003,angle-width/2,true);ctx.closePath();ctx.fillStyle=colorFor(v,min,max);ctx.globalAlpha=map?.78:.94;ctx.fill();
        });
      }
      ctx.restore();ctx.globalAlpha=1;
      if(rings){ctx.strokeStyle='#657f7c50';ctx.lineWidth=.7;for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(cx,cy,radius*i/4,0,Math.PI*2);ctx.stroke();if(!compact){ctx.fillStyle='#4f6563';ctx.font='12px "DM Sans", sans-serif';ctx.fillText(formatDistance(range*i/4),cx+8,cy-radius*i/4+14)}}ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(cx-radius,cy);ctx.lineTo(cx+radius,cy);ctx.moveTo(cx,cy-radius);ctx.lineTo(cx,cy+radius);ctx.stroke();ctx.setLineDash([])}
      ctx.fillStyle='#254c4d';ctx.beginPath();ctx.arc(cx,cy,3.5,0,Math.PI*2);ctx.fill();
      if(!compact){ctx.font='12px "DM Sans", sans-serif';ctx.fillStyle='#49635e';ctx.textAlign='center';ctx.fillText('N',cx,cy-radius-15);ctx.fillText('S',cx,cy+radius+22);ctx.fillText('W',cx-radius-18,cy+4);ctx.fillText('E',cx+radius+18,cy+4);ctx.textAlign='left';if(map&&scan.synthetic){[['Pune',.62,.13],['Satara',.76,.65],['Mahabaleshwar',.5,.52],['Konkan',.14,.72]].forEach(([name,x,y])=>{ctx.fillStyle='#f5f7f1';ctx.fillRect(w*Number(x)-4,h*Number(y)-13,String(name).length*7+8,20);ctx.fillStyle='#51625b';ctx.fillText(String(name),w*Number(x),h*Number(y))})}}
    };
    const observer=new ResizeObserver(draw);observer.observe(canvas);draw();return()=>observer.disconnect();
  },[scan,field,range,min,max,a,b,map,rings,compact,pan,zoom,ref]);
  function inspect(e:React.PointerEvent<HTMLCanvasElement>){
    if(drag.current){setPan({x:drag.current.px+e.clientX-drag.current.x,y:drag.current.py+e.clientY-drag.current.y});return;}
    const box=e.currentTarget.getBoundingClientRect(),x=e.clientX-box.left-box.width/2-pan.x,y=e.clientY-box.top-box.height/2-pan.y;
    const r=Math.hypot(x,y)/(Math.min(box.width,box.height)*.405*zoom)*range,az=(Math.atan2(x,-y)*180/Math.PI+360)%360;
    let ai=0,ri=0;scan.azimuths.forEach((v,i)=>{if(Math.min(Math.abs(v-az),360-Math.abs(v-az))<Math.min(Math.abs(scan.azimuths[ai]-az),360-Math.abs(scan.azimuths[ai]-az)))ai=i});scan.ranges.forEach((v,i)=>{if(Math.abs(v-r)<Math.abs(scan.ranges[ri]-r))ri=i});
    const delta=Math.min(Math.abs(scan.azimuths[ai]-az),360-Math.abs(scan.azimuths[ai]-az));
    const neighbour=scan.azimuths[ai+1]??(scan.azimuths[ai]+(scan.azimuths[ai]-scan.azimuths[ai-1]||1));
    const rayWidth=Math.min(3,Math.abs(neighbour-scan.azimuths[ai])||1);
    const halfGate=Math.abs((scan.ranges[1]??scan.ranges[0])-scan.ranges[0])/2;
    const sampled=delta<=rayWidth/2&&r>=scan.ranges[0]-halfGate&&r<=scan.ranges[scan.ranges.length-1]+halfGate;
    setProbe(r>range?null:{value:sampled?(scan.values[ai]?.[ri]??null):null,az,range:r});
  }
  return <div className={`radar-plot ${compact?'compact':''}`}>
    <canvas ref={ref} aria-label={`${scan.synthetic?'Illustrative':'Uploaded'} ${field} PPI, elevation ${scan.elevation} degrees. Use export to inspect numeric data.`} onPointerMove={inspect} onPointerLeave={()=>{setProbe(null);drag.current=null}} onPointerDown={e=>{if(map){e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y}}}} onPointerUp={()=>drag.current=null} />
    {!compact&&map&&<><span className="map-qualifier">Schematic regional context</span><div className="map-zoom"><button aria-label="Zoom in on radar map" onClick={()=>setZoom(z=>Math.min(2.5,z+.25))}>+</button><button aria-label="Zoom out on radar map" onClick={()=>setZoom(z=>Math.max(.75,z-.25))}>−</button><button aria-label="Reset map view" onClick={()=>{setZoom(1);setPan({x:0,y:0})}}><RotateCcw size={14}/></button></div></>}
    {!compact&&<div className="plot-readout" aria-live="off">{probe?<><span>{probe.value===null?'No data':`${(field==='rainfall'?rainRate(probe.value,a,b):probe.value).toFixed(1)} ${field==='rainfall'?'mm/hr':'dBZ'}`}</span><span>{probe.az.toFixed(1)}° / {probe.range.toFixed(1)} km</span></>:<><span>{scan.synthetic?'Illustrative scan':'Source-file scan'}</span><span>{map?'Drag to pan · + / − to zoom':'Move over the scan to inspect a gate'}</span></>}</div>}
  </div>;
}
