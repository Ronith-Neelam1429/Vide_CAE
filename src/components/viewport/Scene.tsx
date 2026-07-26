import { Grid, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Color, MOUSE, TOUCH, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useExperimentStore } from "../../store/experimentStore";
import { ImportedDesign } from "./ImportedDesign";
import { SkinSurface } from "./SkinSurface";

function CameraSetup() {
  const { camera, gl } = useThree();

  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    perspective.position.set(4.8, 3.4, 5.8);
    perspective.near = 0.01;
    perspective.far = 500;
    perspective.fov = 45;
    perspective.updateProjectionMatrix();
    perspective.lookAt(0, 0.4, 0);

    gl.setClearColor(new Color("#1e1e1e"), 1);
  }, [camera, gl]);

  return null;
}

function PlaceholderCube() {
  const hasDesign = useExperimentStore((s) => s.design !== null);
  if (hasDesign) return null;

  return (
    <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#5a6570" metalness={0.35} roughness={0.45} />
    </mesh>
  );
}

function CadControls() {
  const { gl } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const orbit = controlsRef.current;
    if (!orbit) return;

    const setLeftButton = (pan: boolean) => {
      orbit.mouseButtons.LEFT = pan ? MOUSE.PAN : MOUSE.ROTATE;
    };

    const syncFromEvent = (event: KeyboardEvent | PointerEvent) => {
      setLeftButton(event.altKey);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt" || !event.altKey) {
        setLeftButton(false);
      }
    };

    const onBlur = () => setLeftButton(false);

    const element = gl.domElement;
    element.addEventListener("pointerdown", syncFromEvent, true);
    window.addEventListener("keydown", syncFromEvent);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      element.removeEventListener("pointerdown", syncFromEvent, true);
      window.removeEventListener("keydown", syncFromEvent);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setLeftButton(false);
    };
  }, [gl]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={1.2}
      maxDistance={60}
      maxPolarAngle={Math.PI * 0.495}
      minPolarAngle={0.05}
      target={[0, 0.4, 0]}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.PAN,
        RIGHT: MOUSE.ROTATE,
      }}
      touches={{
        ONE: TOUCH.ROTATE,
        TWO: TOUCH.DOLLY_PAN,
      }}
      panSpeed={0.9}
      rotateSpeed={0.75}
      zoomSpeed={0.85}
    />
  );
}

export function Scene() {
  return (
    <>
      <CameraSetup />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#f0e6dc", "#2a2a2a", 0.35]} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <directionalLight position={[-5, 4, -3]} intensity={0.28} color="#ffd8c8" />

      <Grid
        infiniteGrid
        fadeDistance={40}
        fadeStrength={1.2}
        cellSize={0.25}
        sectionSize={1}
        cellThickness={0.55}
        sectionThickness={1.05}
        cellColor="#3a3a3a"
        sectionColor="#4f4f4f"
        position={[0, -0.001, 0]}
      />

      <SkinSurface />
      <PlaceholderCube />
      <ImportedDesign />
      <CadControls />
    </>
  );
}
