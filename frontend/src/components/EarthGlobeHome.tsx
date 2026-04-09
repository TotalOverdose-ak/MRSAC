"use client";

import { useEffect, useRef, useState } from "react";
import Globe, { GlobeMethods } from "react-globe.gl";

export default function EarthGlobeHome() {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  // Mount the component so the Globe element renders
  useEffect(() => { setMounted(true); }, []);

  // Configure initial globe setup (static, no rotation, no zoom)
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      if (globeEl.current) {
        globeEl.current.controls().autoRotate = false;
        globeEl.current.controls().enableZoom = true;
        globeEl.current.pointOfView({ altitude: 2 });
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [mounted]);

  // Smooth Scroll parallax effect
  useEffect(() => {
    let ticking = false;
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (globeEl.current) {
            const currentScrollY = window.scrollY;
            const deltaY = currentScrollY - lastScrollY;
            lastScrollY = currentScrollY;
            
            // Only rotate based on actual scroll delta to prevent jitter
            const currentPov = globeEl.current.pointOfView();
            globeEl.current.pointOfView({ ...currentPov, lng: currentPov.lng + (deltaY * 0.05) });
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
