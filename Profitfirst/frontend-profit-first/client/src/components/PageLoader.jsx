import React from 'react';

const PageLoader = () => {
  return (
    <div className="fixed inset-0 bg-[#101218] flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white text-sm">Loading...</p>
      </div>
    </div>
  );
};

export default PageLoader;
