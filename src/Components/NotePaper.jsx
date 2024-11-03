import React from 'react';

const NotePaper = ({ children, accent = 'blue' }) => {
  return (
    <div className={`bg-white rounded-lg p-6 shadow-md border-l-4 border-${accent}-400 relative overflow-hidden`}>
      <div className="absolute top-0 left-0 w-full h-full opacity-5 notebook-lines" />
      <div className="relative z-10 font-handwriting">
        {children}
      </div>
    </div>
  );
};

export default NotePaper;