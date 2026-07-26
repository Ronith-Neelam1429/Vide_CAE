import { Grid, OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  Color,
  MOUSE,
  TOUCH,
  Vector3,
  type PerspectiveCamera,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useExperimentStore } from "../../store/experimentStore";
import { ArmModel } from "./ArmModel";
import { ImportedDesign } from "./ImportedDesign";

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

function CadControls() {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const pressedKeys = useRef(new Set<string>());

  useFrame((_, delta) => {
    const keys = pressedKeys.current;
    if (keys.size === 0) return;

    const orbit = controlsRef.current;
    if (!orbit) return;

    const forward = new Vector3();
    const right = new Vector3();
    const offset = new Vector3();
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();

    const distance = camera.position.distanceTo(orbit.target);
    const speed = Math.max(1.6, distance * 0.55) * delta;
    if (keys.has("ArrowLeft")) offset.addScaledVector(right, -speed);
    if (keys.has("ArrowRight")) offset.addScaledVector(right, speed);
    if (keys.has("ArrowUp")) offset.addScaledVector(camera.up, speed);
    if (keys.has("ArrowDown")) offset.addScaledVector(camera.up, -speed);
    if (offset.lengthSq() === 0) return;

    // Move the camera and orbit target together so the view pans without
    // rotating either the camera or the body.
    camera.position.add(offset);
    orbit.target.add(offset);
    orbit.update();
  });

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.key.startsWith("Arrow")) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      pressedKeys.current.add(event.key);
      event.preventDefault();
    };
    const onKeyRelease = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.key);
    };

    const element = gl.domElement;
    element.addEventListener("pointerdown", syncFromEvent, true);
    window.addEventListener("keydown", syncFromEvent);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyRelease);
    window.addEventListener("blur", onBlur);

    return () => {
      element.removeEventListener("pointerdown", syncFromEvent, true);
      window.removeEventListener("keydown", syncFromEvent);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyRelease);
      window.removeEventListener("blur", onBlur);
      pressedKeys.current.clear();
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
  const showBody = useExperimentStore((s) => s.showBody);

  return (
    <>
      <CameraSetup />

      <ambientLight intensity={0.4} />
      <hemisphereLight args={["#f3e8dc", "#2a2622", 0.4]} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.15}
        color="#fff4ea"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 3, -5]} intensity={0.55} color="#ff9d6f" />
      <pointLight position={[0, 3.5, 3]} intensity={0.35} color="#ffd9c2" distance={16} />

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

      {showBody && <ArmModel />}
      <ImportedDesign />
      <CadControls />
    </>
  );
}
