import React from 'react';

const GenerationProgress = ({ status }) => {
  const getStatusContent = () => {
    switch (status) {
      case 'generating_music':
        return {
          title: '🎵 生成中...',
          description: 'ミュージックビデオを生成しています（3分程度かかります）',
          color: 'bg-purple-500'
        };
      case 'complete':
        return {
          title: '✨ 完成！',
          description: 'ミュージックビデオが生成されました',
          color: 'bg-green-500'
        };
      default:
        return null;
    }
  };

  const content = getStatusContent();
  if (!content) return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="font-handwriting">
        <h3 className="text-lg font-bold mb-2 chalk-effect">{content.title}</h3>
        <p className="text-gray-600 mb-4">{content.description}</p>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${content.color} animate-pulse`} />
        </div>
      </div>
    </div>
  );
};

export default GenerationProgress;