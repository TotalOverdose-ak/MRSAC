"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Globe2, ShieldCheck, Cpu, Database, Satellite, Crosshair, Navigation } from "lucide-react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useState } from "react";
import SolarSystemMap from "@/components/SolarSystemMap";

// Dynamically import globe to avoid SSR issues
const EarthGlobeHome = dynamic(() => import("@/components/EarthGlobeHome"), { ssr: false });

export default function Home() {
  const { scrollYProgress } = useScroll();
  const [showSolarSystem, setShowSolarSystem] = useState(false);
  
  // HUD fade out on scroll
  const opacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.15], [1, 0.9]);

  // CRAZY GLOBE PARALLAX: Bottom Center -> Right Center
  const globeY = useTransform(scrollYProgress, [0, 0.2, 1], ['45vh', '15vh', '15vh']);
  const globeX = useTransform(scrollYProgress, [0, 0.2, 1], ['0vw', '35vw', '35vw']);
  const globeScale = useTransform(scrollYProgress, [0, 0.2, 1], [1.0, 0.75, 0.75]);
  const globeOpacity = useTransform(scrollYProgress, [0, 0.2, 1], [1, 1, 0.9]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-[#030712] text-slate-200 font-sans min-h-screen relative overflow-x-hidden selection:bg-sky-500/30">
      
      <AnimatePresence>
        {showSolarSystem && <SolarSystemMap onClose={() => setShowSolarSystem(false)} />}
      </AnimatePresence>

      {/* AMBIENT GLOW BACKGROUNDS */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-50">
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-sky-600/10 blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/10 blur-[150px]" />
      </div>

      {/* FIXED HIGH-TECH 3D GLOBE BACKGROUND */}
      <motion.div 
        className="fixed inset-0 z-0 flex items-center justify-center mix-blend-screen pointer-events-auto"
        style={{ y: globeY, x: globeX, scale: globeScale, opacity: globeOpacity }}
        initial={{ opacity: 0, scale: 0.8, y: '50vh' }}
        animate={{ opacity: 1, scale: 1, y: '45vh' }}
        transition={{ duration: 2.5, ease: "easeOut" }}
      >
        <EarthGlobeHome />
      </motion.div>

      {/* Elegant Navbar */}
      <nav className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-6 md:px-12 py-5 bg-black/20 backdrop-blur-xl border-b border-white/5">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2 group">
          <Globe2 className="w-6 h-6 text-sky-400 group-hover:rotate-180 transition-transform duration-700 ease-in-out" />
          <span className="font-['Bebas_Neue'] text-xl tracking-[0.2em] bg-gradient-to-r from-white to-sky-200 bg-clip-text text-transparent">
            EARTHWATCH
          </span>
        </button>
        <div className="hidden md:flex items-center gap-10 text-xs font-medium tracking-[0.1em] text-slate-300">
          <button onClick={() => scrollToSection('platform')} className="hover:text-white transition-colors relative group">
            Platform
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-sky-400 group-hover:w-full transition-all" />
          </button>
          <button onClick={() => scrollToSection('technology')} className="hover:text-white transition-colors relative group">
            Technology
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-sky-400 group-hover:w-full transition-all" />
          </button>
          <button onClick={() => scrollToSection('about')} className="hover:text-white transition-colors relative group">
            Mission
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-sky-400 group-hover:w-full transition-all" />
          </button>
        </div>
        <Link 
          href="/launch" 
          className="px-6 py-2.5 rounded-full bg-white text-slate-900 font-semibold text-xs tracking-wide hover:bg-sky-50 transition-all duration-300"
        >
          Launch Interface
        </Link>
      </nav>

      {/* HERO SECTION */}
      <section className="relative h-screen flex flex-col items-center justify-center text-center px-4 pt-10 z-10 pointer-events-none">
        
        {/* Soft VENUS */}
        <motion.div 
          className="absolute left-[-2rem] md:left-4 top-[55%] -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none z-20"
          style={{ y: useTransform(scrollYProgress, [0, 0.2], ['0%', '-200%']), opacity }}
        >
          <div className="w-16 h-16 md:w-32 md:h-32 rounded-full bg-[radial-gradient(circle_at_30%_30%,#f5deb3_0%,#d2b48c_40%,#8b5a2b_80%,#3d2314_100%)] shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.9),0_0_30px_rgba(210,180,140,0.1)] flex items-center justify-center">
            <div className="w-full h-full rounded-full border border-white/10" />
          </div>
          <span className="text-[10px] tracking-widest text-slate-400 px-3 py-1 rounded-full bg-white/5 backdrop-blur-md border border-white/5">VENUS</span>
        </motion.div>

        {/* Soft MARS */}
        <motion.div 
          className="absolute right-[-1rem] md:right-4 top-[45%] -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none z-20"
          style={{ y: useTransform(scrollYProgress, [0, 0.2], ['0%', '-200%']), opacity }}
        >
          <span className="text-[10px] tracking-widest text-slate-400 px-3 py-1 rounded-full bg-white/5 backdrop-blur-md border border-white/5">MARS</span>
          <div className="w-12 h-12 md:w-28 md:h-28 rounded-full bg-[radial-gradient(circle_at_30%_30%,#ff7f50_0%,#cd5c5c_40%,#8b2323_80%,#3a0f0f_100%)] shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.9),0_0_30px_rgba(205,92,92,0.1)] flex items-center justify-center">
            <div className="w-full h-full rounded-full border border-white/10" />
          </div>
        </motion.div>

        <motion.div style={{ opacity, scale }} className="relative z-20 flex flex-col items-center pointer-events-auto mt-[-10vh]">
          
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-sky-200">
              Live Satellite Uplink Active
            </span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.4 }}
            className="text-[15vw] md:text-[14rem] leading-[0.85] font-serif tracking-tighter text-white select-none"
          >
            EARTH
          </motion.h1>
          <p className="mt-8 max-w-xl text-center text-sm md:text-sm leading-[2.2] font-normal text-white/80">
            Protecting our surface through advanced deep learning and unparalleled Sentinel-2 satellite monitoring. Explore the fragile beauty of our home.
          </p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 1 }}
            className="mt-16 flex flex-col sm:flex-row gap-6 items-center pointer-events-auto"
          >
            <Link 
              href="/launch" 
              className="group relative px-10 py-4 border border-white/20 text-white text-xs font-bold tracking-[0.2em] uppercase hover:bg-white hover:text-black transition-colors duration-300 flex items-center gap-3"
            >
              <span>Launch Mission Control</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            
            <button 
              onClick={() => setShowSolarSystem(true)}
              className="group relative px-10 py-4 border border-white/20 text-white/80 text-xs font-bold tracking-[0.2em] uppercase hover:bg-white hover:text-black transition-colors duration-300 flex items-center gap-3"
            >
              <Navigation className="w-4 h-4 transition-transform group-hover:rotate-12" />
              <span>Solar System View</span>
            </button>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.button 
          onClick={() => scrollToSection('platform')}
          whileHover={{ y: 5 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 2 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 w-12 h-12 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl flex items-center justify-center text-white/50 hover:text-white hover:border-white/30 transition-all cursor-pointer pointer-events-auto"
        >
          <ArrowRight className="w-5 h-5 rotate-90" />
        </motion.button>
      </section>

      {/* PLATFORM SECTION */}
      <section id="platform" className="relative z-10 py-40 px-6 md:px-16 w-full max-w-7xl mx-auto flex items-center pointer-events-none mt-20">
        
        {/* Left Side (Empty on Desktop, to align with the Globe which is on the Right) 
            Actually the text needs to be on the left, because globe is on the right! */}
        <div className="w-full md:w-1/2 md:pr-16 flex flex-col justify-center pointer-events-auto relative z-20">
          
          <div className="flex items-center gap-4 text-[11px] tracking-[0.4em] text-white/80 font-mono mb-8 border-b border-white/20 pb-4 inline-flex w-fit">
            <span>01</span>
            <div className="w-8 h-[1px] bg-white/20" />
            <span>02</span>
          </div>

          <motion.h2 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1 }}
            className="text-6xl md:text-[7rem] font-serif font-light mb-8 text-white capitalize"
            style={{ letterSpacing: "-0.04em", lineHeight: 0.9 }}
          >
            Intelligent<br/>Surveillance
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 1 }}
            className="text-sm md:text-sm leading-[2.2] font-normal text-white/80 mb-16 max-w-md border-l border-white/20 pl-6"
          >
            Upload custom geographical boundaries or utilize intuitive tactical drawing tools. The system instantly interfaces with Sentinel-2 archives to detect and report surface anomalies across global leases.
          </motion.p>

          <motion.div 
             initial={{ opacity: 0, y: 20 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: true }}
             transition={{ delay: 0.4, duration: 1 }}
             className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12"
          >
            <div className="flex flex-col gap-3 border-t border-white/20 pt-4">
              <span className="text-[10px] tracking-[0.25em] font-bold text-white uppercase">Threat Classification</span>
              <span className="text-xs text-white/80 font-normal leading-relaxed pr-4">Automatically analyzes mining site perimeters against official datasets to identify illegal incursions.</span>
            </div>
            <div className="flex flex-col gap-3 border-t border-white/20 pt-4">
              <span className="text-[10px] tracking-[0.25em] font-bold text-white uppercase">Live Polling</span>
              <span className="text-xs text-white/80 font-normal leading-relaxed pr-4">Direct connection to PostgreSQL spatial nodes, ensuring real-time ground truth checks.</span>
            </div>
          </motion.div>

        </div>
      </section>

      {/* TECHNOLOGY SECTION */}
      <section id="technology" className="relative z-10 py-40 px-6 md:px-16 w-full max-w-7xl mx-auto flex items-center pointer-events-none">
        <div className="w-full md:w-1/2 md:pr-16 flex flex-col justify-center pointer-events-auto relative z-20">
          
          <div className="flex items-center gap-4 text-[11px] tracking-[0.4em] text-white/80 font-mono mb-8 border-b border-white/20 pb-4 inline-flex w-fit">
            <span>02</span>
            <div className="w-8 h-[1px] bg-white/20" />
            <span>02</span>
          </div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1 }}
            className="text-6xl md:text-[6.5rem] font-serif font-light mb-8 text-white capitalize break-words"
            style={{ letterSpacing: "-0.04em", lineHeight: 0.9 }}
          >
            Deep<br/>Learning
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 1 }}
            className="text-sm md:text-sm leading-[2.2] font-normal text-white/80 mb-16 max-w-md border-l border-white/20 pl-6"
          >
            Earth Watch leverages a highly optimized PyTorch backend trained on millions of complex topographies using 11 multi-spectral bands to isolate minute terrestrial scarring perfectly.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 1 }}
            className="border-l border-white/20 pl-6 relative font-mono text-sm leading-loose max-w-md mt-4"
          >
            <div className="text-[10px] text-white/50 tracking-[0.25em] uppercase mb-4 opacity-50">inference_engine.py</div>
            <div className="text-white">import torch</div>
            <div className="text-white/50 mt-2"># Initialize inference engine</div>
            engine = <span className="text-white">ResNetUNet</span>(bands=11)<br/>
            prediction = engine.predict_masks(geo_bbox)<br/>
          </motion.div>
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="relative z-10 py-52 px-6 md:px-16 w-full max-w-7xl mx-auto flex flex-col items-center justify-center text-center">
        <h2 className="text-6xl md:text-[6rem] font-serif font-light text-white mb-8 capitalize" style={{ letterSpacing: "-0.04em", lineHeight: 0.9 }}>
          Protecting our <span className="italic">Planet</span>
        </h2>
        <p className="max-w-xl text-sm md:text-sm leading-[2.2] font-normal text-white/80 mb-16 px-4">
          Join the planetary defense initiative. Identify illegal extraction operations using real-time spatial intelligence and hold perpetrators accountable.
        </p>
        <Link 
          href="/launch" 
          className="group relative px-12 py-5 border border-white/20 text-white text-xs font-bold tracking-[0.2em] uppercase hover:bg-white hover:text-black transition-colors duration-300 flex items-center gap-3"
        >
          <span>Launch Platform</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-10 border-t border-white/5 bg-black flex flex-col items-center justify-center text-center">
        <div className="flex items-center gap-2 text-white/50 mb-3 hover:text-white transition-colors">
          <Globe2 className="w-5 h-5" /> <span className="font['Bebas_Neue'] tracking-[0.2em] text-lg">EARTHWATCH</span>
        </div>
        <p className="text-xs text-slate-600 font-light">
          © {new Date().getFullYear()} Planetary Systems Inc. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
