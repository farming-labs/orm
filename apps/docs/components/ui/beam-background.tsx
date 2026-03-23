"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeElements,
} from "@react-three/fiber";
import { Environment, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

type MaterialConfig = {
  header?: string;
  vertexHeader?: string;
  fragmentHeader?: string;
  vertex?: Record<string, string>;
  fragment?: Record<string, string>;
  material?: Partial<THREE.MeshStandardMaterialParameters>;
  uniforms?: Record<string, unknown>;
};

export interface BeamBackgroundProps {
  beamWidth?: number;
  beamHeight?: number;
  beamNumber?: number;
  lightColor?: string;
  speed?: number;
  noiseIntensity?: number;
  scale?: number;
  rotation?: number;
}

const noiseGLSL = `
float random (in vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123); }
float noise (in vec2 st) {
    vec2 i = floor(st); vec2 f = fract(st);
    float a = random(i); float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
float cnoise(vec3 P){
  vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x); vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz; vec4 iz1 = Pi1.zzzz;
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
  vec4 gx0 = ixy0 / 7.0; vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0); vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5); gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 / 7.0; vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1); vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5); gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x); vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z); vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x); vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z); vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x,Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x,Pf1.y,Pf0.z)); float n110 = dot(g110, vec3(Pf1.xy,Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy,Pf1.z)); float n101 = dot(g101, vec3(Pf1.x,Pf0.y,Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x,Pf1.yz)); float n111 = dot(g111, Pf1);
  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),fade_xyz.z);
  vec2 n_yz = mix(n_z.xy,n_z.zw,fade_xyz.y);
  float n_xyz = mix(n_yz.x,n_yz.y,fade_xyz.x);
  return 2.2 * n_xyz;
}`;

const extendMaterial = (
  BaseMaterial: new (
    params?: THREE.MeshStandardMaterialParameters,
  ) => THREE.MeshStandardMaterial,
  cfg: MaterialConfig,
) => {
  const physical = THREE.ShaderLib.physical;
  const {
    vertexShader: baseVert,
    fragmentShader: baseFrag,
    uniforms: baseUniforms,
  } = physical;
  const baseDefines =
    (physical as { defines?: Record<string, unknown> }).defines ?? {};
  const uniforms = THREE.UniformsUtils.clone(baseUniforms);
  const defaults = new BaseMaterial(cfg.material || {});

  if (defaults.color) uniforms.diffuse.value = defaults.color;
  if ("roughness" in defaults) uniforms.roughness.value = defaults.roughness;
  if ("metalness" in defaults) uniforms.metalness.value = defaults.metalness;
  if ("envMap" in defaults) uniforms.envMap.value = defaults.envMap;
  if ("envMapIntensity" in defaults) {
    uniforms.envMapIntensity.value = defaults.envMapIntensity;
  }

  for (const [key, uniformValue] of Object.entries(cfg.uniforms ?? {})) {
    uniforms[key] =
      uniformValue !== null &&
      typeof uniformValue === "object" &&
      "value" in uniformValue
        ? (uniformValue as THREE.IUniform)
        : { value: uniformValue };
  }

  let vertexShader = `${cfg.header ?? ""}\n${cfg.vertexHeader ?? ""}\n${baseVert}`;
  let fragmentShader = `${cfg.header ?? ""}\n${cfg.fragmentHeader ?? ""}\n${baseFrag}`;

  for (const [includeName, code] of Object.entries(cfg.vertex ?? {})) {
    vertexShader = vertexShader.replace(includeName, `${includeName}\n${code}`);
  }

  for (const [includeName, code] of Object.entries(cfg.fragment ?? {})) {
    fragmentShader = fragmentShader.replace(includeName, `${includeName}\n${code}`);
  }

  return new THREE.ShaderMaterial({
    defines: { ...baseDefines },
    uniforms,
    vertexShader,
    fragmentShader,
    lights: true,
    fog: !!cfg.material?.fog,
  });
};

const hexToNormalizedRGB = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r / 255, g / 255, b / 255];
};

const createStackedPlanesBufferGeometry = (
  count: number,
  width: number,
  height: number,
  spacing: number,
  heightSegments: number,
) => {
  const geometry = new THREE.BufferGeometry();
  const numVertices = count * (heightSegments + 1) * 2;
  const numFaces = count * heightSegments * 2;
  const positions = new Float32Array(numVertices * 3);
  const indices = new Uint32Array(numFaces * 3);
  const uvs = new Float32Array(numVertices * 2);

  let vertexOffset = 0;
  let indexOffset = 0;
  let uvOffset = 0;
  const totalWidth = count * width + (count - 1) * spacing;
  const xOffsetBase = -totalWidth / 2;

  for (let planeIndex = 0; planeIndex < count; planeIndex++) {
    const xOffset = xOffsetBase + planeIndex * (width + spacing);
    const uvXOffset = Math.random() * 300;
    const uvYOffset = Math.random() * 300;

    for (let segmentIndex = 0; segmentIndex <= heightSegments; segmentIndex++) {
      const y = height * (segmentIndex / heightSegments - 0.5);
      const v0 = [xOffset, y, 0];
      const v1 = [xOffset + width, y, 0];

      positions.set([...v0, ...v1], vertexOffset * 3);

      const uvY = segmentIndex / heightSegments;
      uvs.set(
        [uvXOffset, uvY + uvYOffset, uvXOffset + 1, uvY + uvYOffset],
        uvOffset,
      );

      if (segmentIndex < heightSegments) {
        const a = vertexOffset;
        const b = vertexOffset + 1;
        const c = vertexOffset + 2;
        const d = vertexOffset + 3;
        indices.set([a, b, c, c, b, d], indexOffset);
        indexOffset += 6;
      }

      vertexOffset += 2;
      uvOffset += 4;
    }
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
};

const CanvasWrapper = ({ children }: { children: ReactNode }) => (
  <Canvas
    dpr={[1, 2]}
    frameloop="always"
    className="absolute inset-0 h-full w-full"
  >
    {children}
  </Canvas>
);

const DirectionalBeamLight = (
  props: ThreeElements["directionalLight"] & { color: string },
) => {
  const lightRef = useRef<THREE.DirectionalLight>(null!);

  useEffect(() => {
    const shadowCamera = lightRef.current.shadow.camera;
    shadowCamera.top = 24;
    shadowCamera.bottom = -24;
    shadowCamera.left = -24;
    shadowCamera.right = 24;
    shadowCamera.far = 64;
    lightRef.current.shadow.bias = -0.004;
  }, []);

  return <directionalLight ref={lightRef} intensity={1.85} {...props} />;
};

interface NoisePlanesProps {
  material: THREE.ShaderMaterial;
  width: number;
  count: number;
  height: number;
}

const NoisePlanes = forwardRef<THREE.Mesh, NoisePlanesProps>(
  ({ material, width, count, height }, ref) => {
    const meshRef = useRef<
      THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null
    >(null);

    useImperativeHandle(ref, () => meshRef.current as THREE.Mesh);

    const geometry = useMemo(
      () => createStackedPlanesBufferGeometry(count, width, height, 0, 100),
      [count, width, height],
    );

    useFrame((_, delta) => {
      if (!meshRef.current?.material.uniforms.time) return;
      meshRef.current.material.uniforms.time.value += 0.1 * delta;
    });

    return (
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        position={[0, 0, 0]}
      />
    );
  },
);

NoisePlanes.displayName = "NoisePlanes";

const MouseInteraction = ({ children }: { children: ReactNode }) => {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  const targetMouse = useRef({ x: 0, y: 0 });
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mouse.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -(event.clientY / window.innerHeight) * 2 + 1,
      };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;

    targetMouse.current.x += (mouse.current.x - targetMouse.current.x) * 0.005;
    targetMouse.current.y += (mouse.current.y - targetMouse.current.y) * 0.005;

    groupRef.current.rotation.y = targetMouse.current.x * 0.3;
    groupRef.current.rotation.x = targetMouse.current.y * 0.1;

    camera.position.x = targetMouse.current.x * 1;
    camera.position.y = targetMouse.current.y * 1;
    camera.lookAt(0, 0, 0);
  });

  return <group ref={groupRef}>{children}</group>;
};

export default function BeamBackground({
  beamWidth = 0.85,
  beamHeight = 15,
  beamNumber = 12,
  lightColor = "#ffffff",
  speed = 2,
  noiseIntensity = 0.18,
  scale = 0.2,
  rotation = 0,
}: BeamBackgroundProps) {
  const validBeamNumber = beamNumber > 0 ? beamNumber : 12;

  const beamMaterial = useMemo(
    () =>
      extendMaterial(THREE.MeshStandardMaterial, {
        header: `
          varying vec3 vEye;
          varying float vNoise;
          varying vec2 vUv;
          varying vec3 vPosition;
          uniform float time;
          uniform float uSpeed;
          uniform float uNoiseIntensity;
          uniform float uScale;
          ${noiseGLSL}`,
        vertexHeader: `
          float getPos(vec3 pos) {
            vec3 noisePos = vec3(pos.x * 0., pos.y - uv.y, pos.z + time * uSpeed * 3.) * uScale;
            return cnoise(noisePos);
          }
          vec3 getCurrentPos(vec3 pos) {
            vec3 newpos = pos;
            newpos.z += getPos(pos);
            return newpos;
          }
          vec3 getNormal(vec3 pos) {
            vec3 curpos = getCurrentPos(pos);
            vec3 nextposX = getCurrentPos(pos + vec3(0.01, 0.0, 0.0));
            vec3 nextposZ = getCurrentPos(pos + vec3(0.0, -0.01, 0.0));
            vec3 tangentX = normalize(nextposX - curpos);
            vec3 tangentZ = normalize(nextposZ - curpos);
            return normalize(cross(tangentZ, tangentX));
          }`,
        vertex: {
          "#include <begin_vertex>":
            "transformed.z += getPos(transformed.xyz);",
          "#include <beginnormal_vertex>":
            "objectNormal = getNormal(position.xyz);",
        },
        fragment: {
          "#include <dithering_fragment>": `
            float randomNoise = noise(gl_FragCoord.xy);
            gl_FragColor.rgb -= randomNoise / 15. * uNoiseIntensity;`,
        },
        material: { fog: true },
        uniforms: {
          diffuse: new THREE.Color(...hexToNormalizedRGB("#000000")),
          time: { value: 0 },
          roughness: 0.3,
          metalness: 0.3,
          uSpeed: { value: speed },
          envMapIntensity: 13.5,
          uNoiseIntensity: noiseIntensity,
          uScale: scale,
        },
      }),
    [speed, noiseIntensity, scale],
  );

  return (
    <div className="absolute inset-0 opacity-25">
      <CanvasWrapper>
        <MouseInteraction>
          <group
            rotation={[0, 0, THREE.MathUtils.degToRad(rotation)]}
            position={[0, 0, 0]}
          >
            <NoisePlanes
              material={beamMaterial}
              count={validBeamNumber}
              width={beamWidth}
              height={beamHeight}
            />
            <DirectionalBeamLight color={lightColor} position={[0, 3, 10]} />
          </group>
        </MouseInteraction>
        <ambientLight intensity={1.25} />
        <color attach="background" args={["#000000"]} />
        <PerspectiveCamera makeDefault position={[0, 0, 30]} fov={20} />
        <Environment preset="sunset" />
      </CanvasWrapper>
    </div>
  );
}
