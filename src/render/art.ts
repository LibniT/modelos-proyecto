/** Piezas de la maqueta. Las coordenadas del suelo están en baldosas y las alturas en píxeles. */
import type Phaser from 'phaser';
import { iso, type Vec } from './layout';
import { pts, shade } from './draw';

export type G = Phaser.GameObjects.Graphics;
export const ink = 0x244951;
export const glass = 0x6eabb4;
export const cream = 0xfff2cf;

export function rect(g: G, x: number, y: number, w: number, d: number, z: number, color: number): void {
  g.fillStyle(color).fillPoints(pts([{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}], z), true);
}

/** Banda elevada; sirve también para aleros, marcos y franjas de las fachadas. */
export function slab(g: G, x: number, y: number, w: number, d: number, base: number, h: number, color: number): void {
  const a = {x,y:y+d}, b = {x:x+w,y:y+d}, c = {x:x+w,y};
  for (const [start,end,factor] of [[a,b,.85],[b,c,.69]] as const) {
    g.fillStyle(shade(color,factor)).fillPoints([...pts([start,end],base),...pts([end,start],base+h)],true);
  }
  rect(g,x,y,w,d,base+h,color);
}

export function tree(g: G, x: number, y: number, scale = 1): void {
  const p=iso({x,y});
  g.save().translateCanvas(p.x,p.y).scaleCanvas(scale,scale);
  g.fillStyle(ink,.13).fillEllipse(5,1,27,10);
  g.fillStyle(0x795e48).fillRect(-2,-19,5,20);
  g.fillStyle(0x337760).fillEllipse(0,-23,26,30);
  g.fillStyle(0x52966b).fillEllipse(-5,-28,20,23);
  g.fillStyle(0x84b77e).fillEllipse(-6,-32,14,15);
  g.restore();
}

/** Una textura local por pieza. El origen del dibujo coincide con el punto de apoyo en el piso. */
export function stamp(scene: Phaser.Scene, key: string, w: number, h: number, ox: number, oy: number, draw: (g:G)=>void): string {
  if (!scene.textures.exists(key)) {
    const g=scene.add.graphics();
    g.translateCanvas(ox,oy);
    draw(g);
    g.generateTexture(key,w,h);
    g.destroy();
  }
  return key;
}

/** Carrocería orientada según el vector real de la vía, con cabina, parabrisas y baliza. */
export function ambulance(g: G, dir: Vec): void {
  const d=Math.hypot(dir.x,dir.y);
  const u={x:dir.x/d,y:dir.y/d}, v={x:-u.y,y:u.x};
  const at=(a:number,b:number,z:number)=>{
    const p=iso({x:u.x*a+v.x*b,y:u.y*a+v.y*b});
    return {x:p.x,y:p.y-z};
  };
  const hull=(a:number,b:number,w:number,l:number,base:number,h:number,col:number)=>{
    const corners=[[a,b],[a+w,b],[a+w,b+l],[a,b+l]];
    const face=corners.map(([i,j])=>at(i,j,base+h));
    const foot=corners.map(([i,j])=>at(i,j,base));
    const sides=[0,1,2,3].sort((i,j)=>foot[i].y+foot[(i+1)%4].y-foot[j].y-foot[(j+1)%4].y);
    for(const i of sides){
      const j=(i+1)%4;
      g.fillStyle(shade(col,i%2?.71:.87)).fillPoints([foot[i],foot[j],face[j],face[i]],true);
    }
    g.fillStyle(col).fillPoints(face,true);
  };
  g.fillStyle(ink,.19).fillEllipse(3,3,89,25);
  hull(-1,-.43,2,.86,5,10,0xf7f0db);
  hull(-1,-.44,1.38,.88,14,14,0xfffcf0);
  hull(-1,-.45,1.38,.9,12,4,0xe17551);
  hull(.38,-.4,.49,.8,15,9,glass);
  hull(.36,-.42,.48,.84,24,2,cream);
  hull(-.55,-.29,.16,.58,28,4,0x2e8399);
  const side=v.x+v.y>=0?.45:-.45;
  for(const a of [-.67,.67]){
    const p=at(a,side,6);
    g.fillStyle(ink).fillEllipse(p.x,p.y,11,13).fillStyle(0xcbdbd6).fillEllipse(p.x,p.y,4,6);
  }
  const cross=at(-.34,side,21);
  g.fillStyle(0xc85940).fillRect(cross.x-4,cross.y-1.5,8,3).fillRect(cross.x-1.5,cross.y-4,3,8);
}
