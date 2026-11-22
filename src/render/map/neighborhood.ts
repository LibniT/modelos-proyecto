/** Barrio ficticio de Valledupar. Casas, árboles, andenes y río son decorado estático. */
import { iso, type Vec } from '../layout';
import { pts, shade } from '../draw';
import { cream, glass, ink, rect, slab, tree, type G } from '../art';
import type { CityLayout } from './layout';

function road(g:G,a:Vec,b:Vec,width:number,main:boolean):void {
  const p=iso(a),q=iso(b);
  for(const [thick,color] of [[width+7,0xa4af96],[width+5,0xf5e5c4],[width,0x667d79]]){
    g.lineStyle(thick,color).lineBetween(p.x,p.y,q.x,q.y);
  }
  if(!main)return;
  const len=Math.hypot(q.x-p.x,q.y-p.y);
  for(let t=12;t<len-12;t+=24){
    const line=(k:number)=>({x:p.x+(q.x-p.x)*k/len,y:p.y+(q.y-p.y)*k/len});
    const u=line(t),v=line(t+9);
    g.lineStyle(2,0xf5de9b).lineBetween(u.x,u.y,v.x,v.y);
  }
  for(const frac of [.18,.82]){
    const u=(q.x-p.x)/len,v=(q.y-p.y)/len;
    for(let k=-2;k<=2;k++){
      const x=p.x+(q.x-p.x)*frac+u*k*3.8,y=p.y+(q.y-p.y)*frac+v*k*3.8;
      g.lineStyle(2,0xede6cb).lineBetween(x-v*width*.35,y+u*width*.35,x+v*width*.35,y-u*width*.35);
    }
  }
}

function house(g:G,x:number,y:number,i:number):void{
  const col=[0xe59b75,0xe5c477,0x95bfc0,0xe0ada3,0xa3ba8e][i%5];
  const z=12+(i%3)*4;
  slab(g,x-.48,y-.4,.98,.84,0,z,cream);
  slab(g,x-.54,y-.45,1.1,.94,z,3,col);
  const eave=pts([{x:x-.55,y:y+.49},{x:x+.56,y:y+.49}],z+3);
  const ridge=pts([{x:x+.56,y},{x:x-.55,y}],z+11);
  g.fillStyle(col).fillPoints([...eave,...ridge],true);
  g.fillStyle(shade(col,.73)).fillPoints([...pts([{x:x+.56,y:y-.45},{x:x+.56,y:y+.49}],z+3),ridge[0]],true);
  slab(g,x-.31,y+.44,.22,.025,4,5,glass);
  slab(g,x+.16,y+.44,.19,.025,0,10,ink);
}

export function neighborhood(g:G,L:CityLayout):void {
  const {w,h,hospital,clinics}=L;
  slab(g,0,0,w,h,-10,10,0xbad09e);
  // Dos orillas escalonadas y reflejos inmóviles en el Guatapurí.
  for(let x=0;x<w;x+=.25){
    const y=h-1.65+.35*Math.sin(x*.54);
    rect(g,x,y-.22,.26,1.54,0,0xe5cc99);
    rect(g,x,y,.26,1.12,0,0x70b9b3);
    rect(g,x,y+.18,.26,.60,0,0x55a7a9);
    if(Math.floor(x*4)%7===0)rect(g,x,y+.45,.6,.055,1,0xb9e6d7);
  }
  const streets:{a:Vec;b:Vec;main:boolean}[]=[];
  for(const x of [hospital.x-2.7,hospital.x+3.2,w-2.05]) streets.push({a:{x,y:.5},b:{x,y:h-2.4},main:false});
  for(const y of [2.25,hospital.y-4.4]) streets.push({a:{x:.5,y},b:{x:w-.5,y},main:false});
  clinics.forEach(c=>streets.push({a:hospital,b:c,main:true}));
  for(const {a,b,main} of streets)road(g,a,b,main?23:12,main);

  const items:{depth:number;draw:()=>void}[]=[];
  const nearby=(x:number,y:number)=>{
    const p=iso({x,y});
    return streets.some(({a,b,main})=>{
      const u=iso(a),v=iso(b),dx=v.x-u.x,dy=v.y-u.y;
      const t=Math.min(1,Math.max(0,((p.x-u.x)*dx+(p.y-u.y)*dy)/(dx*dx+dy*dy)));
      return Math.hypot(p.x-u.x-t*dx,p.y-u.y-t*dy)<(main?30:24);
    });
  };
  let i=0;
  for(let x=1;x<w-.9;x+=1.42)for(let y=1;y<h-2.45;y+=1.47){
    i++;
    if([hospital,...clinics].some(c=>Math.abs(c.x-x)<2.1&&Math.abs(c.y-y)<2.15)||nearby(x,y))continue;
    const index=i, park=x>hospital.x+4&&y>hospital.y-4;
    if(park && i%3===0)continue;
    const draw=park||i%4===0?()=>tree(g,x,y,.60+(index%4)*.08):()=>house(g,x,y,index);
    items.push({depth:x+y,draw});
  }
  items.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
}

/** Cuatro siluetas: urgencias con helipuerto, clínica de ladrillo, torre y pabellón ajardinado. */
export function facility(g:G,j:number):void {
  const hospital=j<0;
  const w=hospital?3.15:j===1?1.64:2.42,d=hospital?2.32:j===2?1.95:1.55;
  const h=hospital?57:[37,66,43][j%3];
  const color=hospital?0xe4e9d8:[0xf3be9d,0xf6dfa9,0xe7eacb][j%3];
  const trim=hospital?0x48787b:[0xaf624e,0x4c7c88,0x5a826a][j%3];
  const x=-w/2,y=-d/2;
  g.fillStyle(ink,.15).fillEllipse(10,7,(w+d)*28,(w+d)*11);
  slab(g,x-.2,y-.19,w+.4,d+.38,0,4,0xebddbc);
  slab(g,x,y,w,d,4,h,color);
  for(let z=14;z<h;z+=17){
    for(let i=0;i<Math.floor(w/.45);i++)slab(g,x+.10+i*.46,y+d,.32,.025,z,9,glass);
    for(let i=0;i<Math.floor(d/.48);i++)slab(g,x+w,y+.09+i*.49,.025,.34,z,9,0x578b97);
    slab(g,x-.035,y-.035,w+.07,d+.07,z-3,2,trim);
  }
  slab(g,x-.09,y-.09,w+.18,d+.18,h+4,4,cream);
  rect(g,x+.10,y+.10,w-.20,d-.20,h+8,trim);
  slab(g,x+.35,y+d,.64,.04,4,16,ink);
  slab(g,x+.19,y+d-.02,1.05,.42,20,4,hospital?0xdb785c:trim);
  if(hospital){
    const roof=iso({x:-.25,y:.05});
    g.fillStyle(0xc4d5b6).fillEllipse(roof.x,roof.y-h-8,55,25);
    g.lineStyle(2,cream).strokeEllipse(roof.x,roof.y-h-8,49,20);
    rect(g,-.58,-.18,.14,.56,h+9,cream);rect(g,-.16,-.18,.14,.56,h+9,cream);rect(g,-.44,.04,.28,.14,h+9,cream);
    slab(g,-1.28,-.85,.53,.45,h+8,7,0xc2cfc5);
    const p=iso({x:.99,y:d/2});
    g.fillStyle(0xb44f3c).fillRect(p.x-7,p.y-46,14,5).fillRect(p.x-2.5,p.y-51,5,15);
    rect(g,x+w+.25,y, .65,1.30,1,0x677e7a);
    for(let i=0;i<3;i++)rect(g,x+w+.26,y+.15+i*.42,.58,.05,2,cream);
  }else if(j===0){
    for(let i=0;i<4;i++)slab(g,x+.28+i*.48,y+.21,.38,.55,h+8,3,0x6493a1);
  }else if(j===1){
    slab(g,-.52,-.45,1.04,.85,h+8,12,color);
    slab(g,-.56,-.49,1.12,.93,h+20,3,trim);
  }else{
    for(let i=0;i<3;i++){
      const p=iso({x:x+.42+i*.63,y});
      g.fillStyle(0x72a47b).fillEllipse(p.x,p.y-h-13,16,10);
    }
  }
}
