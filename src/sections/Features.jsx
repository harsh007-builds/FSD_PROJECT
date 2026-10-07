import React from 'react';
import { Users, MessageSquare, CheckCircle2 } from 'lucide-react';

const FeatureCard = ({ icon: Icon, title, description }) => {
  return (
    <div className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-8 transition-all duration-300 hover:-translate-y-2 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10">
      <div className="inline-flex items-center justify-center bg-slate-800 p-3 rounded-2xl mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-500/20">
        <Icon className="w-6 h-6 text-slate-300 group-hover:text-blue-400 transition-colors duration-300" />
      </div>
      <h3 className="text-xl font-semibold mb-3 text-white">{title}</h3>
      <p className="text-slate-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
};

const Features = () => {
  const features = [
    {
      icon: Users,
      title: 'Study Rooms',
      description: 'Create collaborative rooms for group study sessions and discussions.',
    },
    {
      icon: MessageSquare,
      title: 'Real-time Chat',
      description: 'Instant messaging and live collaboration with teammates.',
    },
    {
      icon: CheckCircle2,
      title: 'Task Management',
      description: 'Organize assignments, deadlines, and project milestones efficiently.',
    }
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Powerful Collaboration Features</h2>
          <p className="text-lg text-slate-400">
            Everything you need to collaborate effectively. Designed specifically for students and teams to maximize productivity and streamline learning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FeatureCard 
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
