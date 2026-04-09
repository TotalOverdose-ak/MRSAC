"use client";

import { useEffect, useRef, useState } from "react";
import Globe, { GlobeMethods } from "react-globe.gl";

type EarthGlobeProps = {
  rotateSpeed?: number;
};

export default function EarthGlobe({ rotateSpeed = 1.0 }: EarthGlobeProps) {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);

  // Step 1: Mount the component so the Globe element renders
  useEffect(() => { setMounted(true); }, []);

  // Step 2: Once mounted, poll briefly for globeEl ref to become available
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      if (globeEl.current) {
        globeEl.current.controls().autoRotate = true;
        globeEl.current.controls().autoRotateSpeed = rotateSpeed;
        globeEl.current.controls().enableZoom = false;
        globeEl.current.pointOfView({ altitude: 2 });
        setGlobeReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [mounted]);

  // Step 3: Smoothly animate rotation speed (decelerate over ~2s when target goes to 0)
  const targetSpeedRef = useRef(rotateSpeed);
  const currentSpeedRef = useRef(rotateSpeed);
  targetSpeedRef.current = rotateSpeed;

  useEffect(() => {
    if (!globeReady) return;
    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000; // seconds
      lastTime = now;

      const target = targetSpeedRef.current;
      const current = currentSpeedRef.current;

      if (Math.abs(current - target) > 0.01) {
        // Lerp speed: fast snap up, slow decelerate down
        const lerpRate = target > current ? 8 : 1.2; // snap up quickly, slow down gently (~2s)
        currentSpeedRef.current = current + (target - current) * Math.min(lerpRate * dt, 1);
      } else {
        currentSpeedRef.current = target;
      }

      if (globeEl.current) {
        globeEl.current.controls().autoRotateSpeed = currentSpeedRef.current;
      }

      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [globeReady]);

  // Scroll parallax
  useEffect(() => {
    const handleScroll = () => {
      if (globeEl.current) {
        const currentPov = globeEl.current.pointOfView();
        globeEl.current.pointOfView({ ...currentPov, lng: currentPov.lng + 0.3 });
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!mounted) return null;

  return (
    <div className="w-[1000px] h-[1000px] md:w-[1600px] md:h-[1600px] pointer-events-auto cursor-grab active:cursor-grabbing flex items-center justify-center filter drop-shadow-[0_0_60px_rgba(77,166,255,0.4)]">
      <Globe
        ref={globeEl}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="#4da6ff"
        atmosphereAltitude={0.15}
        width={1600} 
        height={1600}
        animateIn={true}
      />
    </div>
  );
}

