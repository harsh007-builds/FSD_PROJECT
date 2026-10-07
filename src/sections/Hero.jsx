import React from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { useUser } from '../context/UserContext';

const Hero = () => {
  // Consume the context safely via our custom hook
  const { user } = useUser();
  const firstName = user ? user.name.split(' ')[0] : '';

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-blue-500/20 rounded-full blur-[100px] md:blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-[400px] h-[400px] md:w-[600px] md:h-[600px] bg-purple-500/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center text-center">
        {/* Announcement Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card border-blue-500/30 text-blue-400 text-sm font-medium mb-8">
          <span className="text-base">🚀</span>
          <span>Real-time Collaboration Platform</span>
        </div>
        
        {/* Heading */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-tight max-w-4xl">
          Study Together{firstName ? `, ${firstName}` : ''}.<br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500"> Manage Projects Better.</span>
        </h1>
        
        {/* Paragraph */}
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed">
          Elevate your academic and professional workflow with collaborative study rooms, intuitive task management, shared notes, and seamless real-time teamwork. Everything you need to succeed, all in one place.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button className="btn-primary w-full sm:w-auto group flex items-center justify-center gap-2 hover:scale-105">
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button className="btn-secondary w-full sm:w-auto group flex items-center justify-center gap-2 hover:scale-105">
            <Play className="w-5 h-5 group-hover:text-purple-400 transition-colors" fill="currentColor" />
            View Demo
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
