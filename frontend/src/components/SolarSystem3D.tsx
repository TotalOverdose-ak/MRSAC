"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

// ── Planet config ────────────────────────────────────────────
const PLANET_DATA = [
  { name: "Mercury", textureUrl: "/textures/planets/2k_mercury.jpg",        emissive: 0x222222, radius: 0.6,  orbit: 6,   speed: 2.4,  startAngle: 0.8  },
  { name: "Venus",   textureUrl: "/textures/planets/2k_venus_surface.jpg",  emissive: 0x222222, radius: 1.0,  orbit: 9,   speed: 1.8,  startAngle: 2.1  },
  { name: "Earth",   textureUrl: "/textures/planets/2k_earth_daymap.jpg",   emissive: 0x222222, radius: 1.1,  orbit: 13,  speed: 1.4,  startAngle: 3.5  },
  { name: "Mars",    textureUrl: "/textures/planets/2k_mars.jpg",           emissive: 0x222222, radius: 0.85, orbit: 17,  speed: 1.1,  startAngle: 5.0  },
  { name: "Jupiter", textureUrl: "/textures/planets/2k_jupiter.jpg",        emissive: 0x111111, radius: 2.8,  orbit: 24,  speed: 0.6,  startAngle: 1.2  },
  { name: "Saturn",  textureUrl: "/textures/planets/2k_saturn.jpg",         emissive: 0x111111, radius: 2.3,  orbit: 32,  speed: 0.45, startAngle: 4.0  },
  { name: "Uranus",  textureUrl: "/textures/planets/2k_uranus.jpg",         emissive: 0x111111, radius: 1.6,  orbit: 40,  speed: 0.3,  startAngle: 2.8  },
  { name: "Neptune", textureUrl: "/textures/planets/2k_neptune.jpg",        emissive: 0x111111, radius: 1.5,  orbit: 47,  speed: 0.22, startAngle: 0.5  },
];

type SolarSystemProps = {
  phase: "solar" | "zooming" | "done";
  onZoomComplete?: () => void;
};

export default function SolarSystem3D({ phase, onZoomComplete }: SolarSystemProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    planets: { mesh: THREE.Mesh; orbit: number; speed: number; angle: number; name: string }[];
    earthMesh: THREE.Mesh | null;
    clock: THREE.Clock;
    animId: number;
    zoomStart: number;
    isZooming: boolean;
    zoomDone: boolean;
  } | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const onZoomCompleteRef = useRef(onZoomComplete);
  onZoomCompleteRef.current = onZoomComplete;

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // ── Renderer ─────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────
    const scene = new THREE.Scene();
    // No fog — so outer planets stay fully visible

    // ── Camera (angled down for 3D perspective) ──────────
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    camera.position.set(0, 35, 45);
    camera.lookAt(0, 0, 0);

    // ── Ambient + Sun light ──────────────────────────────
    scene.add(new THREE.AmbientLight(0x667799, 2.0));
    const sunLight = new THREE.PointLight(0xffdd66, 5, 300);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // Fill light from above and behind the camera
    const fillLight = new THREE.DirectionalLight(0x8899bb, 0.8);
    fillLight.position.set(0, 30, 40);
    scene.add(fillLight);

    // Rim light from below for dramatic depth
    const rimLight = new THREE.DirectionalLight(0x334466, 0.4);
    rimLight.position.set(0, -20, -30);
    scene.add(rimLight);

    // ── Starfield ────────────────────────────────────────
    const starGeom = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 400;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 400;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 400;
      const brightness = 0.5 + Math.random() * 0.5;
      starColors[i * 3] = brightness;
      starColors[i * 3 + 1] = brightness;
      starColors[i * 3 + 2] = brightness + Math.random() * 0.2;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeom.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.8 });
    scene.add(new THREE.Points(starGeom, starMat));

    const textureLoader = new THREE.TextureLoader();

    // ── SUN (emissive sphere + glow sprite) ──────────────
    const sunGeom = new THREE.SphereGeometry(2.5, 64, 64);
    const sunTexture = textureLoader.load("/textures/planets/2k_sun.jpg");
    sunTexture.colorSpace = THREE.SRGBColorSpace;
    const sunMat = new THREE.MeshBasicMaterial({ map: sunTexture });
    const sun = new THREE.Mesh(sunGeom, sunMat);
    scene.add(sun);

    // Sun inner core glow
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.3 })
    );
    scene.add(sunCore);

    // Sun outer glow (larger transparent sphere)
    const sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(4, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.08, side: THREE.BackSide })
    );
    scene.add(sunGlow);

    // ── PLANETS + ORBITS ─────────────────────────────────
    const planets: { mesh: THREE.Mesh; orbit: number; speed: number; angle: number; name: string }[] = [];
    let earthMesh: THREE.Mesh | null = null;

    PLANET_DATA.forEach((p) => {
      // Orbit ring
      const orbitCurve = new THREE.EllipseCurve(0, 0, p.orbit, p.orbit, 0, Math.PI * 2, false, 0);
      const orbitPoints = orbitCurve.getPoints(128);
      const orbitGeom = new THREE.BufferGeometry().setFromPoints(
        orbitPoints.map((pt) => new THREE.Vector3(pt.x, 0, pt.y))
      );
      const orbitLine = new THREE.Line(
        orbitGeom,
        new THREE.LineBasicMaterial({
          color: p.name === "Earth" ? 0x4da6ff : 0xffffff,
          transparent: true,
          opacity: p.name === "Earth" ? 0.3 : 0.12,
        })
      );
      scene.add(orbitLine);

      // Planet sphere — emissive material so dark side is still visible
      const planetGeom = new THREE.SphereGeometry(p.radius, 64, 64);
      const texture = textureLoader.load(p.textureUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const planetMat = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: new THREE.Color(p.emissive),
        emissiveIntensity: 0.2,
        roughness: 0.8,
        metalness: 0.1,
      });
      const planetMesh = new THREE.Mesh(planetGeom, planetMat);
      
      // Tilt planets slightly for realism
      planetMesh.rotation.x = Math.PI * 0.1;
      scene.add(planetMesh);

      // Saturn rings
      if (p.name === "Saturn") {
        const ringGeom = new THREE.RingGeometry(p.radius * 1.4, p.radius * 2.4, 64, 1);
        
        // Correct radial UV mapping for standard ring texture line
        const pos = ringGeom.attributes.position;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v3.fromBufferAttribute(pos, i);
          const r = v3.length();
          const normalizedRadius = (r - p.radius * 1.4) / (p.radius * 2.4 - p.radius * 1.4);
          ringGeom.attributes.uv.setXY(i, normalizedRadius, 1);
        }

        const ringTexture = textureLoader.load("/textures/planets/2k_saturn_ring_alpha.png");
        ringTexture.colorSpace = THREE.SRGBColorSpace;
        const ringMat = new THREE.MeshStandardMaterial({
          map: ringTexture,
          alphaMap: ringTexture,
          transparent: true,
          side: THREE.DoubleSide,
          opacity: 0.9,
          roughness: 0.6,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI * 0.4;
        planetMesh.add(ring);
      }

      // Earth atmosphere glow
      if (p.name === "Earth") {
        earthMesh = planetMesh;
        const atmoGeom = new THREE.SphereGeometry(p.radius * 1.2, 32, 32);
        const atmoMat = new THREE.MeshBasicMaterial({
          color: 0x4da6ff,
          transparent: true,
          opacity: 0.2,
          side: THREE.BackSide,
        });
        planetMesh.add(new THREE.Mesh(atmoGeom, atmoMat));
      }

      planets.push({
        mesh: planetMesh,
        orbit: p.orbit,
        speed: p.speed,
        angle: p.startAngle,
        name: p.name,
      });
    });

    // ── Animation state ──────────────────────────────────
    const clock = new THREE.Clock();
    const state = {
      renderer, scene, camera, planets, earthMesh, clock,
      animId: 0, zoomStart: 0, isZooming: false, zoomDone: false,
    };
    sceneRef.current = state;

    // ── Render loop ──────────────────────────────────────
    const animate = () => {
      state.animId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Orbit planets
      state.planets.forEach((p) => {
        p.angle += p.speed * dt * 0.3;
        p.mesh.position.x = Math.cos(p.angle) * p.orbit;
        p.mesh.position.z = Math.sin(p.angle) * p.orbit;
        p.mesh.position.y = Math.sin(p.angle * 0.5) * 0.3; // Slight vertical wobble
        p.mesh.rotation.y += dt * 0.5; // Self-rotation
      });

      // Sun glow pulse
      sunCore.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.04);

      // Gentle camera orbit in solar phase
      if (phaseRef.current === "solar") {
        camera.position.x = Math.sin(elapsed * 0.08) * 6;
        camera.position.z = 45 + Math.cos(elapsed * 0.08) * 4;
        camera.lookAt(0, 0, 0);
      }

      // ── ZOOM TO EARTH ──────────────────────────────────
      if (phaseRef.current === "zooming" && !state.zoomDone) {
        if (!state.isZooming) {
          state.isZooming = true;
          state.zoomStart = elapsed;
        }

        const zoomElapsed = elapsed - state.zoomStart;
        const zoomDuration = 2.8;
        let t = Math.min(zoomElapsed / zoomDuration, 1);
        // Smooth easing — ease in/out cubic
        t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        if (state.earthMesh) {
          const earthPos = state.earthMesh.position;

          // Camera starts from its current position, ends very close to Earth
          const startPos = new THREE.Vector3(camera.position.x, 35, 45);
          const endPos = new THREE.Vector3(
            earthPos.x + 1.5,
            earthPos.y + 0.8,
            earthPos.z + 2.5
          );

          camera.position.lerpVectors(startPos, endPos, t);

          // Look at Earth throughout zoom
          const lookTarget = new THREE.Vector3().lerpVectors(
            new THREE.Vector3(0, 0, 0),
            earthPos,
            Math.min(t * 2, 1)
          );
          camera.lookAt(lookTarget);
        }

        if (t >= 1) {
          state.zoomDone = true;
          onZoomCompleteRef.current?.();
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // ── Resize handler ───────────────────────────────────
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Cleanup ──────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(state.animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update phase ref when phase prop changes (triggers zoom in render loop)
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  return <div ref={mountRef} className="absolute inset-0 z-0" />;
}
