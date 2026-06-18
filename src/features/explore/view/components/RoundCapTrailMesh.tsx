/**
 * RoundCapTrailMesh — 圆角粗线三角形带轨迹渲染。
 *
 * 使用自定义 BufferGeometry + useFrame 生成带圆角端盖的 3D 轨迹线。
 * 宽度随速度缩放，颜色按速度渐变插值。
 */
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TrailPoint } from "../../viewModel/hooks/useTrailBuffer";
import { hexToRgb, velocityToColor, DEFAULT_COLOR_STOPS } from "./TrailColorUtils";
import type { VelocityColorStop } from "./TrailColorUtils";

const MAX_OBSERVED_VELOCITY = 15.0;
const MAX_TRAIL_POINTS = 6000;
const CAP_SEGMENTS = 8;
const MAX_VERTICES = 2 * MAX_TRAIL_POINTS + 2 * CAP_SEGMENTS;
const MAX_INDICES = 6 * (MAX_TRAIL_POINTS - 1) + 6 * CAP_SEGMENTS * 2;
/** 最小线宽相对于 1px 的倍率 */
const MIN_WIDTH_MULTIPLIER = 1.5;

export interface RoundCapTrailMeshProps {
  points: TrailPoint[];
  colorMode?: "velocity" | "solid";
  solidColor?: string;
  opacity?: number;
  maxWidth?: number;
  colorGradient?: VelocityColorStop[];
}

export function RoundCapTrailMesh({
  points, colorMode = "velocity", solidColor = "#f0c040",
  opacity = 0.9, maxWidth = 6, colorGradient,
}: RoundCapTrailMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const gradient = colorGradient ?? DEFAULT_COLOR_STOPS;
  const solidRgb = useMemo(() => hexToRgb(solidColor), [solidColor]);
  const maxVelocityRef = useMemo(() => ({ current: MAX_OBSERVED_VELOCITY }), []);
  const propsRef = useRef({ colorMode, solidRgb, gradient, maxVelocityRef, targetMaxWidth: maxWidth });
  propsRef.current = { colorMode, solidRgb, gradient, maxVelocityRef, targetMaxWidth: maxWidth };

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(MAX_VERTICES * 3), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(MAX_VERTICES * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(MAX_INDICES), 1));
    return geo;
  }, []);

  useFrame((state) => {
    const pts = pointsRef.current;
    const n = pts.length;
    if (n < 2) { geometry.setDrawRange(0, 0); return; }
    const pos = (geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const col = (geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const idx = (geometry.index as THREE.BufferAttribute).array as Uint16Array;
    const { colorMode: mode, solidRgb: solid, gradient: grad, maxVelocityRef: velRef, targetMaxWidth: targetPixelW } = propsRef.current;
    const { viewport, size } = state;
    const pixelToWorld = size.height > 0 ? viewport.height / size.height : 0.01;
    const targetWorldW = targetPixelW * pixelToWorld;
    const minWorldW = pixelToWorld * MIN_WIDTH_MULTIPLIER;

    let v = 0;
    for (let i = 0; i < n; i++) {
      const pt = pts[i]!, px = pt.position.x, py = pt.position.y, pz = pt.position.z;
      let tx: number, ty: number;
      if (i === 0) { const dx = pts[1]!.position.x - px, dy = pts[1]!.position.y - py; const len = Math.sqrt(dx*dx+dy*dy); tx = len<1e-6?1:dx/len; ty = len<1e-6?0:dy/len; }
      else if (i === n-1) { const dx = px-pts[n-2]!.position.x, dy = py-pts[n-2]!.position.y; const len = Math.sqrt(dx*dx+dy*dy); tx = len<1e-6?1:dx/len; ty = len<1e-6?0:dy/len; }
      else {
        const dx1=px-pts[i-1]!.position.x, dy1=py-pts[i-1]!.position.y, len1=Math.sqrt(dx1*dx1+dy1*dy1);
        const dx2=pts[i+1]!.position.x-px, dy2=pts[i+1]!.position.y-py, len2=Math.sqrt(dx2*dx2+dy2*dy2);
        if (len1<1e-6&&len2<1e-6) { tx=1; ty=0; }
        else if (len1<1e-6) { tx=dx2/len2; ty=dy2/len2; }
        else if (len2<1e-6) { tx=dx1/len1; ty=dy1/len1; }
        else { const ux=dx1/len1+dx2/len2, uy=dy1/len1+dy2/len2, ulen=Math.sqrt(ux*ux+uy*uy); tx=ulen<1e-6?dx1/len1:ux/ulen; ty=ulen<1e-6?dy1/len1:uy/ulen; }
      }
      const nx=-ty, ny=tx;
      const velocityRatio=Math.min(pt.velocity/velRef.current,1);
      const width=minWorldW+(targetWorldW-minWorldW)*Math.sqrt(velocityRatio), hw=width*0.5;
      let cr:number,cg:number,cb:number;
      if (mode==="velocity") { const c=velocityToColor(pt.velocity,grad,velRef); cr=c.r; cg=c.g; cb=c.b; }
      else { cr=solid.r; cg=solid.g; cb=solid.b; }
      pos[v*3]=px+nx*hw; pos[v*3+1]=py+ny*hw; pos[v*3+2]=pz; col[v*3]=cr; col[v*3+1]=cg; col[v*3+2]=cb; v++;
      pos[v*3]=px-nx*hw; pos[v*3+1]=py-ny*hw; pos[v*3+2]=pz; col[v*3]=cr; col[v*3+1]=cg; col[v*3+2]=cb; v++;
    }
    let ii=0;
    for (let i=0;i<n-1;i++) { const a=i*2,b=i*2+1,c=i*2+2,d=i*2+3; idx[ii++]=a; idx[ii++]=b; idx[ii++]=c; idx[ii++]=b; idx[ii++]=d; idx[ii++]=c; }
    // start cap
    const p0=pts[0]!, p1=pts[1]!, startCenter=v;
    pos[v*3]=p0.position.x; pos[v*3+1]=p0.position.y; pos[v*3+2]=p0.position.z;
    col[v*3]=col[0]!; col[v*3+1]=col[1]!; col[v*3+2]=col[2]!; v++;
    const hw0=Math.sqrt((pos[0]!-p0.position.x)**2+(pos[1]!-p0.position.y)**2);
    const tx0=p1.position.x-p0.position.x, ty0=p1.position.y-p0.position.y, tlen0=Math.sqrt(tx0*tx0+ty0*ty0);
    const ndx0=tlen0<1e-6?-1:-tx0/tlen0, ndy0=tlen0<1e-6?0:-ty0/tlen0, baseAngle0=Math.atan2(ndy0,ndx0), rightAngle0=baseAngle0+Math.PI/2;
    for (let k=1;k<CAP_SEGMENTS;k++) { const angle=rightAngle0-(k*Math.PI)/CAP_SEGMENTS; pos[v*3]=p0.position.x+Math.cos(angle)*hw0; pos[v*3+1]=p0.position.y+Math.sin(angle)*hw0; pos[v*3+2]=p0.position.z; col[v*3]=col[0]!; col[v*3+1]=col[1]!; col[v*3+2]=col[2]!; v++; }
    idx[ii++]=startCenter; idx[ii++]=1; idx[ii++]=startCenter+1;
    for (let k=1;k<CAP_SEGMENTS-1;k++) { idx[ii++]=startCenter; idx[ii++]=startCenter+k; idx[ii++]=startCenter+k+1; }
    idx[ii++]=startCenter; idx[ii++]=startCenter+CAP_SEGMENTS-1; idx[ii++]=0;
    // end cap
    const pLast=pts[n-1]!, pPrev=pts[n-2]!, endCenter=v;
    pos[v*3]=pLast.position.x; pos[v*3+1]=pLast.position.y; pos[v*3+2]=pLast.position.z;
    col[v*3]=col[(n-1)*2*3]!; col[v*3+1]=col[(n-1)*2*3+1]!; col[v*3+2]=col[(n-1)*2*3+2]!; v++;
    const hwN=Math.sqrt((pos[(n-1)*2*3]!-pLast.position.x)**2+(pos[(n-1)*2*3+1]!-pLast.position.y)**2);
    const txN=pLast.position.x-pPrev.position.x, tyN=pLast.position.y-pPrev.position.y, tlenN=Math.sqrt(txN*txN+tyN*tyN);
    const ndxN=tlenN<1e-6?1:txN/tlenN, ndyN=tlenN<1e-6?0:tyN/tlenN, baseAngleN=Math.atan2(ndyN,ndxN), leftAngleN=baseAngleN+Math.PI/2;
    for (let k=1;k<CAP_SEGMENTS;k++) { const angle=leftAngleN-(k*Math.PI)/CAP_SEGMENTS; pos[v*3]=pLast.position.x+Math.cos(angle)*hwN; pos[v*3+1]=pLast.position.y+Math.sin(angle)*hwN; pos[v*3+2]=pLast.position.z; col[v*3]=col[(n-1)*2*3]!; col[v*3+1]=col[(n-1)*2*3+1]!; col[v*3+2]=col[(n-1)*2*3+2]!; v++; }
    const leftN=(n-1)*2, rightN=(n-1)*2+1;
    idx[ii++]=endCenter; idx[ii++]=leftN; idx[ii++]=endCenter+1;
    for (let k=1;k<CAP_SEGMENTS-1;k++) { idx[ii++]=endCenter; idx[ii++]=endCenter+k+1; idx[ii++]=endCenter+k; }
    idx[ii++]=endCenter; idx[ii++]=rightN; idx[ii++]=endCenter+CAP_SEGMENTS-1;
    geometry.setDrawRange(0, ii);
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
    geometry.index!.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
