import { Grid, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Color, MOUSE, TOUCH, type PerspectiveCamera } from "three";

function CameraSetup() {
  const { camera, gl } = useThree();

  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    perspective.position.set(4.5, 3.2, 5.5);
    perspective.near = 0.01;
    perspective.far = 500;
    perspective.fov = 45;
    perspective.updateProjectionMatrix();
    perspective.lookAt(0, 0.5, 0);

    gl.setClearColor(new Color("#1e1e1e"), 1);
  }, [camera, gl]);

  return null;
}

function PlaceholderCube() {
  return (
    <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#5a6570"
        metalness={0.35}
        roughness={0.45}
      />
    </mesh>
  );
}

export function Scene() {
  return (
    <>
      <CameraSetup />

      <ambientLight intensity={0.45} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 3, -2]} intensity={0.25} />

      <Grid
        infiniteGrid
        fadeDistance={40}
        fadeStrength={1.2}
        cellSize={0.25}
        sectionSize={1}
        cellThickness={0.6}
        sectionThickness={1.1}
        cellColor="#3a3a3a"
        sectionColor="#4f4f4f"
        position={[0, 0, 0]}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial opacity={0.18} />
      </mesh>

      <PlaceholderCube />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={1.2}
        maxDistance={60}
        maxPolarAngle={Math.PI * 0.49}
        target={[0, 0.5, 0]}
        mouseButtons={{
          // Disable LMB so Phase 2 can use it for contact picking.
          // Shift+RMB still pans via OrbitControls' built-in modifier.
          LEFT: -1 as MOUSE,
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
    </>
  );
}
