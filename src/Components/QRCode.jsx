import React from 'react';

const QRCode = ({ url }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md text-center">
      <h3 className="text-lg font-bold mb-4 font-handwriting">
        スマートフォンでも視聴できます
      </h3>
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`}
        alt="QR Code"
        className="mx-auto mb-4"
        width="200"
        height="200"
      />
      <p className="text-sm text-gray-600 font-handwriting">
        QRコードを読み取ってアクセス
      </p>
    </div>
  );
};

export default QRCode;